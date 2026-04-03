package pnu.busan.walker.review.repository;

import org.jspecify.annotations.NonNull;
import org.springframework.data.jpa.repository.JpaRepository;
import pnu.busan.walker.review.domain.ReviewLike;
import pnu.busan.walker.review.domain.ReviewLikeId;

/**
 * 좋아요 저장소
 *
 * - (review_id, user_id) 복합키/유니크가 존재해야 "중복 좋아요"가 DB 수준에서 방지
 * - 서비스에서는 동일 요청이 반복되어도 결과가 안정적으로 같도록 idempotent로 처리
 */
public interface ReviewLikeRepository extends JpaRepository<ReviewLike, ReviewLikeId> {

    boolean existsById(@NonNull ReviewLikeId id);

    void deleteById(@NonNull ReviewLikeId id);

    /**
     * 특정 리뷰의 좋아요 수 집계
     * - 상세 조회 응답(likeCount)에 사용
     */
    long countByReview_Id(Long reviewId);

}
