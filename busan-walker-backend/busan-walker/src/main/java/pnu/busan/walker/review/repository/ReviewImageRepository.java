package pnu.busan.walker.review.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pnu.busan.walker.review.domain.ReviewImage;

import java.util.List;

/**
 * 리뷰 이미지 저장소
 *
 * - 목록 페이지에서 N+1을 피하기 위해 reviewId IN 배치 조회를 제공
 * - 정렬은 (review_id, sort_order)로 고정해 항상 동일한 순서로 노출되게 함
 */
public interface ReviewImageRepository extends JpaRepository<ReviewImage, Long> {

    @Query("""
            SELECT ri
            FROM ReviewImage ri
            WHERE ri.review.id IN :reviewIds
            ORDER BY ri.review.id ASC, ri.sortOrder ASC
            """)
	List<ReviewImage> findAllByReviewIdsOrdered(@Param("reviewIds") List<Long> reviewIds);

	@Modifying(flushAutomatically = true)
	@Query("""
			DELETE FROM ReviewImage ri
			WHERE ri.review.id = :reviewId
			""")
	int deleteAllByReviewId(@Param("reviewId") Long reviewId);

    boolean existsByImageUrl(String imageUrl);
}
