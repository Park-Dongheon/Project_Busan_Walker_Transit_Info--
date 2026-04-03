package pnu.busan.walker.review.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pnu.busan.walker.review.domain.ReviewComment;

import java.util.Optional;

/**
 * 댓글 저장소
 *
 * - hidden=false(=is_hidden=0)만 노출하도록 쿼리를 분리
 * - 댓글 목록은 Page로 반환하여 페이지네이션 기본 지원
 */
public interface ReviewCommentRepository extends JpaRepository<ReviewComment, Long> {

    Page<ReviewComment> findByReview_IdAndHiddenFalse(Long reviewId, Pageable pageable);

    /**
     * 공개 댓글 + 현재 사용자가 숨긴 본인 댓글만 조회 (숨긴 댓글은 작성자만 볼 수 있음)
     */
    @Query("SELECT c FROM ReviewComment c WHERE c.review.id = :reviewId AND (c.hidden = false OR (c.hidden = true AND c.author.id = :viewerId))")
    Page<ReviewComment> findByReview_IdWithVisibleOrOwnHidden(@Param("reviewId") Long reviewId, @Param("viewerId") Long viewerId, Pageable pageable);

    long countByReview_IdAndHiddenFalse(Long reviewId);

    /**
     * 해당 리뷰의 모든 댓글을 숨김 처리(리뷰 소프트 삭제 시 함께 수행)
     */
    @Modifying
    @Query("UPDATE ReviewComment c SET c.hidden = true WHERE c.review.id = :reviewId")
    int setHiddenByReviewId(@Param("reviewId") Long reviewId);

    /**
     * 삭제/권한 검증 시 "이미 숨김 처리된 댓글"을 제외하고 조회하기 위한 메서드
     * - 숨김 댓글을 다시 숨김 처리하는 요청이 들어오더라도, 서비스에서 idempotent하게 처리하기 쉬움
     */
    Optional<ReviewComment> findByIdAndHiddenFalse(Long commentId);

}
