package pnu.busan.walker.review.service;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.attraction.repository.AttractionRepository;
import pnu.busan.walker.common.domain.Role;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.ForbiddenException;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.common.pagination.ApiPage;
import pnu.busan.walker.common.pagination.PageParam;
import pnu.busan.walker.file.service.ImageFileStorageService;
import pnu.busan.walker.review.domain.*;
import pnu.busan.walker.review.dto.*;
import pnu.busan.walker.review.repository.AttractionReviewRepository;
import pnu.busan.walker.review.repository.ReviewCommentRepository;
import pnu.busan.walker.review.repository.ReviewImageRepository;
import pnu.busan.walker.review.repository.ReviewLikeRepository;
import pnu.busan.walker.user.domain.User;
import pnu.busan.walker.user.repository.UserRepository;

import java.util.*;


/**
 * 리뷰 도메인 서비스
 *
 * 제공 기능
 * - 관광지(keyId) 기준 리뷰 목록 페이지네이션
 * - 리뷰 상세 조회(좋아요/댓글 집계 포함)
 * - 리뷰 작성/수정/삭제(소프트 삭제)
 * - 좋아요 추가/취소 (idempotent)
 * - 댓글 목록 페이지네이션, 댓글 작성, 댓글 삭제(소프트 삭제)
 */
@Service
@RequiredArgsConstructor
public class ReviewService {

    private static final byte VISIBLE = 0;
    private static final byte HIDDEN = 1;

    /**
     * PageParam에서 허용할 sort 필드 목록(화이트리스트)
     * - 외부 입력(sort)을 그대로 ORDER BY에 반영하면 예기치 않은 컬럼/alias로 SQL 오류 또는 성능 문제가 발생할 수 있어
     *   서버에서 허용 목록을 제한
     */
    private static final Set<String> SORT_WHITELIST = Set.of(
            "createdAt", "rating"
    );

    private final AttractionRepository attractionRepo;
    private final UserRepository userRepo;

    private final AttractionReviewRepository reviewRepo;
    private final ReviewImageRepository reviewImageRepo;
    private final ReviewCommentRepository reviewCommentRepo;
    private final ReviewLikeRepository reviewLikeRepo;
    private final ImageFileStorageService imageFileStorageService;

    /* ============================================================
     * 관광지 리뷰 목록 조회
     *
     * 처리 흐름
     * 1) 관광지 존재 여부 확인(없는 keyId로 조회 시 404)
     * 2) PageParam -> Pageable 변환(정렬 화이트리스트 적용)
     * 3) 리뷰 카드 projection 페이지 조회(native query)
     * 4) 현재 페이지에 해당하는 리뷰 ID만 모아 이미지들을 IN 쿼리로 배치 조회
     * 5) Page.map(...)으로 DTO Page 생성
     * 6) ApiPage.from(dtoPage)로 표준 응답 반환
     * ============================================================ */

    @Transactional(readOnly = true)
    public ApiPage<ReviewCardResponse> listReviews(String keyId, PageParam pageParam, Long viewerId) {
        /* 관광지 존재 여부를 먼저 확인해 404를 명확히 반환 */
        ensureAttractionExceptions(keyId);

        /* 기본 정렬: 최신순(createdAt desc) */
        Pageable pageable = pageParam.toPageable(
                SORT_WHITELIST,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        Page<AttractionReviewRepository.ReviewCardRow> page = reviewRepo.findCardsByKeyId(keyId, viewerId, pageable);

        /* 페이지에 포함된 리뷰 ID만 수집하여 이미지 배치 조회(N+1 방지) */
        List<Long> reviewIds = page.getContent().stream()
                .map(AttractionReviewRepository.ReviewCardRow::getReviewId)
                .filter(Objects::nonNull)
                .toList();

        Map<Long, List<String>> imageMap = loadImageMap(reviewIds);

        Page<ReviewCardResponse> dtoPage = page.map(row -> new ReviewCardResponse(
                row.getReviewId(),
                row.getAuthorId(),
                safeAuthorName(row.getAuthorName()),
                row.getRating(),
                row.getBody(),
                row.getLikedByMe() != null && row.getLikedByMe() == 1,
                nvl(row.getLikeCount()),
                nvl(row.getCommentCount()),
                imageMap.getOrDefault(row.getReviewId(), List.of()),
                row.getCreatedAt(),
                row.getUpdatedAt()
        ));

        return ApiPage.from(dtoPage);
    }

    /* ============================================================
     * 리뷰 상세 조회
     *
     * - 관광지(keyId)와 리뷰(reviewId)의 관계를 강제하여 잘못된 접근을 방지
     * - 좋아요/댓글 수는 집계 쿼리를 통해 조회(규모가 커지면 집계 테이블로 확장 가능)
     * ============================================================ */

    @Transactional(readOnly = true)
    public ReviewDetailResponse getReviewDetail(String keyId, Long reviewId, Long viewerId) {
        AttractionReview review = reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        /* 이미지 URL은 정렬된 형태로 반환하여 클라이언트가 추가 정렬 로직 없이 렌더링 가능 */
        List<String> imageUrls = reviewImageRepo.findAllByReviewIdsOrdered(List.of(reviewId)).stream()
                .map(ReviewImage::getImageUrl)
                .toList();

        /* count 전용 메서드를 사용하면 불필요한 Page 조회 없이 바로 카운트를 얻을 수 있음  */
        long commentCount = reviewCommentRepo.countByReview_IdAndHiddenFalse(reviewId);
        long likeCount = reviewLikeRepo.countByReview_Id(reviewId);


        boolean likedByMe = false;
        if (viewerId != null) {
            ReviewLikeId id = new ReviewLikeId(reviewId, viewerId);
            likedByMe = reviewLikeRepo.existsById(id);
        }

        return new ReviewDetailResponse(
                review.getId(),
                review.getAttraction().getKeyId(),
                review.getAuthor() != null ? review.getAuthor().getId() : null,
                safeAuthorName(review.getAuthorNameSnapshot()),
                review.getRating() != null ? (int) review.getRating() : null,
                review.getBody(),
                likedByMe,
                likeCount,
                commentCount,
                imageUrls,
                review.getCreatedAt(),
                review.getUpdatedAt()
        );
    }

    /* ============================================================
     * 리뷰 작성
     *
     * - 작성자(userId)는 인증 토큰(JWT subject)에서 얻는 것을 전제
     * - author_name_snapshot은 "작성 당시 표시명"을 저장하여 닉네임 변경/탈퇴 이후에도 목록 표시가 안정적
     * ============================================================ */

    @Transactional
    public Long createReview(Long userId, String keyId, ReviewCreateRequest request) {
        validateRating(request.rating());

        Attraction attraction = attractionRepo.findById(keyId).orElseThrow(() -> new NotFoundException("Attraction not found: keyId=" + keyId));

        User user = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));

        AttractionReview review = new AttractionReview();
        review.setAttraction(attraction);
        /* author는 FK(user_id)로 저장되어 추후 작성자 기반 기능(내 리뷰/차단/신고)에 활용 가능 */
        review.setAuthor(user);
        /* 스냅샷은 "작성 시점의 표시 이름"을 저장하여, 닉네임 변경에도 리뷰 표시가 흔들리지 않게 함 */
        review.setAuthorNameSnapshot(user.getDisplayName());
        review.setRating(request.rating().byteValue());
        review.setBody(request.body());
        /* is_hidden은 0(노출)로 생성 */
        review.setIsHidden(VISIBLE);

        AttractionReview saved = reviewRepo.save(review);

        /* 이미지 URL 저장 (정렬은 요청 순서 기반) */
        replaceImages(saved.getId(), request.imageUrls());

        return saved.getId();
    }

    /* ============================================================
     * 리뷰 수정
     *
     * - 작성자만 수정할 수 있도록 권한을 검증
     * - imageUrls는 전체 교체 방식으로 처리
     * ============================================================ */

    @Transactional
    public void updateReview(Long userId, String keyId, Long reviewId, ReviewUpdateRequest request) {
        validateRating(request.rating());

        AttractionReview review = reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        assertOwner(userId, review);

        review.setRating(request.rating().byteValue());
        review.setBody(request.body());
        reviewRepo.save(review);

        // 이미지 교체
        replaceImages(reviewId, request.imageUrls());
    }

    /* ============================================================
     * 리뷰 삭제(소프트 삭제)
     *
     * - 실제 row 삭제가 아니라 is_hidden=1로 변경하여
     * - 운영 측면에서 신고/감사/복구가 가능하고, 참조 무결성도 안전하게 유지
     * ============================================================ */

    @Transactional
    public void deleteReview(Long userId, String keyId, Long reviewId) {
        AttractionReview review = reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        assertOwner(userId, review);

        /* 소프트 삭제: 리뷰 + 해당 리뷰의 모든 댓글 숨김 */
        int updated = reviewRepo.setHiddenByIdAndKeyId(keyId, reviewId);
        if (updated == 0) {
            throw new NotFoundException("Review not found or already hidden: id=" + reviewId);
        }
        reviewCommentRepo.setHiddenByReviewId(reviewId);

        /*
         * 리뷰 본문은 소프트 삭제(is_hidden=1)로 보존하지만,
         * 첨부 이미지는 review_images와 S3 객체를 함께 정리해 orphan 파일을 남기지 않는다.
         */
        replaceImages(reviewId, List.of());
    }

    /* ============================================================
     * 좋아요 추가
     *
     * idempotent(멱등성) 정책
     * - 동일 사용자가 같은 리뷰에 좋아요를 여러 번 요청해도 결과는 "좋아요 상태"로 동일
     * - 동시성/재시도로 DB 유니크 제약 위반이 발생할 수 있으므로 DataIntegrityViolationException을 흡수
     * ============================================================ */

    @Transactional
    public void like(Long userId, String keyId, Long reviewId) {
        AttractionReview review = reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        User user = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));

        ReviewLikeId id = new ReviewLikeId(reviewId, userId);
        if (reviewLikeRepo.existsById(id)) {
            /* 이미 좋아요 상태면 아무 작업 없이 종료해도 최종 상태는 동일 */
            return;
        }

        ReviewLike like = new ReviewLike();
        like.setId(id);
        like.setReview(review);
        like.setUser(user);

        try {
            reviewLikeRepo.save(like);
        } catch (DataIntegrityViolationException e) {
            /* 중복 좋아요(동시성/재시도 요청)에서 발생 가능, 최종 상태는 "좋아요가 존재"이므로 성공으로 취급  */
        }
    }

    /**
     * 좋아요 취소
     *
     * - 존재하지 않아도 성공 처리(idempotent)
     * - 클라이언트 재시도/중복 요청에서도 API 동작이 안정적으로 유지
     */
    @Transactional
    public void unlike(Long userId, String keyId, Long reviewId) {
        /* keyId 정합 검증: 다른 관광지 리뷰에 대해 삭제하는 실수를 방지 */
        reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        ReviewLikeId id = new ReviewLikeId(reviewId, userId);
        if (!reviewLikeRepo.existsById(id)) {
            return;
        }

        reviewLikeRepo.deleteById(id);
    }

    /* ============================================================
     * 댓글 목록 조회(페이지네이션)
     *
     * - 댓글은 누적될 수 있으므로 Page 기반으로 제공하여 무한 스크롤/더보기 UX에 적합
     * - viewerId가 있으면: 공개 댓글 + 본인이 숨긴 댓글까지 반환 (숨긴 댓글은 작성자만 노출)
     * - viewerId가 없으면: 공개 댓글만 반환
     * ============================================================ */

    @Transactional(readOnly = true)
    public ApiPage<ReviewCommentResponse> listComments(String keyId, Long reviewId, PageParam pageParam, Long viewerId) {
        /* 리뷰가 해당 관광지에 속하는지 먼저 확인(보안/정합성) */
        reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        Pageable pageable = pageParam.toPageable(Set.of("createdAt"), Sort.by(Sort.Direction.ASC, "createdAt"));
        Page<ReviewComment> page = viewerId != null
                ? reviewCommentRepo.findByReview_IdWithVisibleOrOwnHidden(reviewId, viewerId, pageable)
                : reviewCommentRepo.findByReview_IdAndHiddenFalse(reviewId, pageable);

        Page<ReviewCommentResponse> dtoPage = page.map(c -> new ReviewCommentResponse(
                c.getId(),
                c.getAuthor() != null ? c.getAuthor().getId() : null,
                safeAuthorName(c.getAuthorNameSnapshot()),
                c.getBody(),
                c.getCreatedAt(),
                c.isHidden()
        ));

        return ApiPage.from(dtoPage);
    }

    /* ============================================================
     * 댓글 작성
     *
     * - 작성자 스냅샷(author_name_snapshot)을 저장해, 닉네임 변경에도 표시가 안정적
     * ============================================================ */

    @Transactional
    public Long addComment(Long userId, String keyId, Long reviewId, ReviewCommentCreateRequest request) {
        AttractionReview review = reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        User user = userRepo.findById(userId).orElseThrow(() -> new NotFoundException("User not found: id=" + userId));

        ReviewComment comment = new ReviewComment();
        comment.setReview(review);
        comment.setAuthor(user);
        comment.setAuthorNameSnapshot(user.getDisplayName());
        comment.setBody(request.body());
        comment.setHidden(false);

        ReviewComment saved = reviewCommentRepo.save(comment);
        return saved.getId();
    }

    /* ============================================================
     * 댓글 삭제(소프트 삭제)
     *
     * - 댓글은 hidden=true로 처리하여 감사/복구 가능성을 남김
     * - 작성자만 삭제 가능하도록 권한을 검증
     * ============================================================ */

    @Transactional
    public void deleteComment(Long userId, String keyId, Long reviewId, Long commentId) {

        /* 리뷰 정합성 체크 */
        reviewRepo.findVisibleByIdAndKeyId(keyId, reviewId).orElseThrow(() -> new NotFoundException("Review not found: id=" + reviewId));

        ReviewComment comment = reviewCommentRepo.findById(commentId).orElseThrow(() -> new NotFoundException("Comment not found: id=" + commentId));

        /* 댓글이 어떤 리뷰에 속하는지 검증하여 경로 파라미터 위조를 방지 */
        if (!Objects.equals(comment.getReview().getId(), reviewId)) {
            throw new NotFoundException("Comment does not belong to review: commentId=" + commentId);
        }

        /* 권한: 작성자만 삭제(운영자 삭제는 추후 ROLE 기반으로 확장) */
        boolean admin = isAdmin(userId);
        if (!admin && (comment.getAuthor() == null || !Objects.equals(comment.getAuthor().getId(), userId))) {
            throw new ForbiddenException("Not a comment owner");
        }

        comment.setHidden(true);
        reviewCommentRepo.save(comment);
    }

    /* ----------------------------- 내부 유틸 ----------------------------- */

    private void ensureAttractionExceptions(String keyId) {
        if (!attractionRepo.existsById(keyId)) {
            throw new NotFoundException("Attraction not found: keyId=" + keyId);
        }
    }

    private void validateRating(Integer rating) {
        if (rating == null || rating < 1 || rating > 5) {
            throw new BadRequestException("rating must be between 1 and 5");
        }
    }

    private void assertOwner(Long userId, AttractionReview review) {
        if (isAdmin(userId)) {
            return;
        }
        if (review.getAuthor() == null || !Objects.equals(review.getAuthor().getId(), userId)) {
            throw new ForbiddenException("Not a review owner");
        }
    }

    private boolean isAdmin(Long userId) {
        if (userId == null) return false;
        return userRepo.findById(userId)
                .map(User::getRole)
                .map(role -> role == Role.ADMIN)
                .orElse(false);
    }

    private long nvl(Long v) {
        return v == null ? 0L : v;
    }

    /**
     * author_name_snapshot 기반으로 작성자명을 결정
     * - 작성자명이 비어 있으면 UI에서 처리하기 쉬운 기본 문자열을 반환
     */
    private String safeAuthorName(String snapshot) {
        if (snapshot != null && !snapshot.isBlank()) return snapshot;
        return "익명";
    }

    /**
     * 리뷰 이미지 배치 조회 결과를 reviewId -> imageUrls 로 구성
     *
     * - reviewId IN 조회를 1번만 수행하고, 자바에서 그룹핑하여 N+1 문제를 방지
     * - 결과 리스트의 순서는 repository query의 ORDER BY(reviewId asc, sortOrder asc)를 그대로 유지
     */
    private Map<Long, List<String>> loadImageMap(List<Long> reviewIds) {
        if (reviewIds == null || reviewIds.isEmpty()) return Map.of();

        List<ReviewImage> images = reviewImageRepo.findAllByReviewIdsOrdered(reviewIds);

        Map<Long, List<String>> map = new HashMap<>();
        for (ReviewImage img: images) {
            Long rid = img.getReview().getId();
            map.computeIfAbsent(rid, k -> new ArrayList<>()).add(img.getImageUrl());
        }
        return map;
    }

    /**
     * 이미지 전체 교체 로직
     *
     * 동작
     * 1) 해당 reviewId에 대한 기존 이미지를 모두 삭제
     * 2) 요청된 imageUrls를 입력 순서대로 sortOrder를 부여하여 다시 저장
     *
     * 장점
     * - 클라이언트가 "최종 상태"를 보내는 규칙이므로 결과가 예측 가능
     * - 부분 diff 갱신보다 구현이 단순하여 운영 중 버그 가능성을 낮춤
     */
    private void replaceImages(Long reviewId, List<String> imageUrls) {
        List<String> previousUrls = reviewImageRepo.findAllByReviewIdsOrdered(List.of(reviewId)).stream()
                .map(ReviewImage::getImageUrl)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList();
        List<String> nextUrls = normalizeImageUrls(imageUrls);

        /* 실제 리뷰 엔티티를 다시 로딩하지 않고 FK(review_id)만 지정하기 위한 스텁 객체 */
        AttractionReview stub = new AttractionReview();
        stub.setId(reviewId);

        reviewImageRepo.deleteAllByReviewId(reviewId);
        reviewImageRepo.flush();

        if (nextUrls.isEmpty()) {
            deleteDetachedImages(previousUrls, Set.of());
            return;
        }

        int order = 1;
        for (String url : nextUrls) {
            ReviewImage img = new ReviewImage();
            img.setReview(stub);
            img.setImageUrl(url);
            img.setSortOrder(order++);

            reviewImageRepo.save(img);
        }

        deleteDetachedImages(previousUrls, new HashSet<>(nextUrls));
    }

    private List<String> normalizeImageUrls(List<String> imageUrls) {
        if (imageUrls == null || imageUrls.isEmpty()) return List.of();

        Set<String> normalized = new LinkedHashSet<>();
        for (String url : imageUrls) {
            if (url == null) continue;
            String trimmed = url.trim();
            if (trimmed.isBlank()) continue;
            normalized.add(trimmed);
        }
        return List.copyOf(normalized);
    }

    private void deleteDetachedImages(List<String> previousUrls, Set<String> retainedUrls) {
        if (previousUrls == null || previousUrls.isEmpty()) return;

        for (String url : previousUrls) {
            if (retainedUrls.contains(url)) continue;
            if (reviewImageRepo.existsByImageUrl(url)) continue;
            imageFileStorageService.deleteByPublicUrl(url);
        }
    }

}
