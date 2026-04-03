package pnu.busan.walker.review.web;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import pnu.busan.walker.common.pagination.ApiPage;
import pnu.busan.walker.common.pagination.PageParam;
import pnu.busan.walker.review.dto.*;
import pnu.busan.walker.review.service.ReviewService;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

/**
 * 관광지 리뷰 API
 *
 * 보안/정합 설계
 * - 조회는 /api/v1/attractions/** 하위에 두어 "공개 조회" 정책에 포함
 * - 쓰기(POST/PUT/DELETE)는 Security 설정에 의해 인증이 필요
 *
 * 경로
 * - /api/v1/attractions/{keyId}/reviews
 * - /api/v1/attractions/{keyId}/reviews/{reviewId}/comments
 * - /api/v1/attractions/{keyId}/reviews/{reviewId}/likes
 */
@RestController
@RequiredArgsConstructor
@Validated
@RequestMapping(path = "/api/v1/attractions/{keyId}/reviews", produces = APPLICATION_JSON_VALUE)
public class ReviewController {

    private final ReviewService reviewService;

    /* ============================================================
     * 리뷰 목록 조회(공개)
     *
     * - PageParam을 받아 Pageable로 변환해 페이지네이션을 수행
     * - 로그인 시 likedByMe 계산을 위해 viewerId를 전달
     * ============================================================ */

    @GetMapping
    public ApiPage<ReviewCardResponse> list(
            @PathVariable String keyId,
            @Validated PageParam pageParam,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long viewerId = (jwt == null) ? null : Long.parseLong(jwt.getSubject());
        return reviewService.listReviews(keyId, pageParam, viewerId);
    }

    /* ============================================================
     * 리뷰 상세 조회(공개)
     *
     * - 목록보다 더 많은 정보를 제공(집계 포함)
     * - viewerId가 있으면 likedByMe가 계산
     * ============================================================ */

    @GetMapping("/{reviewId}")
    public ReviewDetailResponse detail(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long viewerId = (jwt == null) ? null : Long.parseLong(jwt.getSubject());
        return reviewService.getReviewDetail(keyId, reviewId, viewerId);
    }


    /* ============================================================
     * 리뷰 작성(인증 필요)
     * ============================================================ */

    @PostMapping(consumes = APPLICATION_JSON_VALUE)
    public Long createReview(
            @PathVariable String keyId,
            @RequestBody @Valid ReviewCreateRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        return reviewService.createReview(userId, keyId, request);
    }

    /* ============================================================
     * 리뷰 수정(인증 필요)
     * ============================================================ */

    @PutMapping(path = "/{reviewId}", consumes = APPLICATION_JSON_VALUE)
    public void updateReview(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @RequestBody @Valid ReviewUpdateRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        reviewService.updateReview(userId, keyId, reviewId, request);
    }

    /* ============================================================
     * 리뷰 삭제(인증 필요, 작성자만 가능, 소프트 삭제)
     * ============================================================ */

    @DeleteMapping("/{reviewId}")
    public void deleteReview(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        reviewService.deleteReview(userId, keyId, reviewId);
    }

    /* ============================================================
     * 좋아요(인증 필요)
     * ============================================================ */

    @PostMapping("/{reviewId}/likes")
    public void like(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        reviewService.like(userId, keyId, reviewId);
    }

    /* ============================================================
     * 좋아요 취소(인증 필요)
     * ============================================================ */

    @DeleteMapping("/{reviewId}/likes")
    public void unlike(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        reviewService.unlike(userId, keyId, reviewId);
    }

    /* ============================================================
     * 댓글(목록 공개, 쓰기/삭제 인증)
     * ============================================================ */

    @GetMapping("/{reviewId}/comments")
    public ApiPage<ReviewCommentResponse> listComments(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @Validated PageParam pageParam,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long viewerId = (jwt == null) ? null : Long.parseLong(jwt.getSubject());
        return reviewService.listComments(keyId, reviewId, pageParam, viewerId);
    }

    /* ============================================================
     * 댓글 작성(인증 필요)
     * ============================================================ */

    @PostMapping(path = "/{reviewId}/comments", consumes = APPLICATION_JSON_VALUE)
    public Long addComment(
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @RequestBody @Valid ReviewCommentCreateRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        return reviewService.addComment(userId, keyId, reviewId, request);
    }

    /* ============================================================
     * 댓글 삭제
     * ============================================================ */

    @DeleteMapping("/{reviewId}/comments/{commentId}")
    public void deleteComment(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String keyId,
            @PathVariable Long reviewId,
            @PathVariable Long commentId
    ) {
        Long userId = Long.parseLong(jwt.getSubject());
        reviewService.deleteComment(userId, keyId, reviewId, commentId);
    }

}