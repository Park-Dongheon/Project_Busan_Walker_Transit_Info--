package pnu.busan.walker.review.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pnu.busan.walker.review.domain.AttractionReview;

import java.time.Instant;
import java.util.Optional;

/**
 * attraction_reviews 기반 리뷰 조회/저장 Repository
 *
 * 설계 포인트
 * - 목록 조회는 "집계(좋아요/댓글) + likedByMe"가 필요하므로 native query + projection을 사용
 * - 삭제는 소프트 삭제(is_hidden=1)이므로, 목록/상세에서 is_hidden=0 조건을 강제
 */
public interface AttractionReviewRepository extends JpaRepository<AttractionReview, Long> {

    interface ReviewCardRow {
        Long getReviewId();
        String getKeyId();

        Long getAuthorId();
        String getAuthorName();

        Integer getRating();
        String getBody();

        Long getLikeCount();
        Long getCommentCount();

        Integer getLikedByMe();

        Instant getCreatedAt();
        Instant getUpdatedAt();
    }

    /**
     * 관광지 리뷰 목록(페이지네이션)
     *
     * - keyId 기준 필터링
     * - is_hidden=0만 노출
     * - likeCount/commentCount는 서브쿼리 집계
     * - likedByMe는 viewerId가 null이면 0으로 고정하고,
     *   null이 아니면 EXISTS로 "현재 사용자가 좋아요를 눌렀는지"를 계산
     */
    @Query(
            value = """
                    SELECT
                        ar.id                               AS reviewId,
                        ar.keyid                            AS keyId,
                        ar.user_id                          AS authorId,
                        ar.author_name_snapshot             AS authorName,
                        CAST(ar.rating AS SIGNED)           AS rating,
                        ar.body                             AS body,
                        (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = ar.id) AS likeCount,
                        (SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id = ar.id AND rc.is_hidden = 0) AS commentCount,
                        (CASE
                            WHEN :viewerId IS NULL THEN 0
                            WHEN EXISTS (
                                SELECT 1
                                FROM review_likes rl2
                                WHERE rl2.review_id = ar.id
                                  AND rl2.user_id = :viewerId
                            ) THEN 1
                            ELSE 0
                        END)                                AS likedByMe,
                        ar.created_at                       AS createdAt,
                        ar.updated_at                       AS updatedAt
                    FROM attraction_reviews ar
                    WHERE ar.keyid = :keyId
                      AND ar.is_hidden = 0
                    -- #pageable
                    """,
            countQuery = """
                         SELECT COUNT(*)
                         FROM attraction_reviews ar
                         WHERE ar.keyid = :keyId
                           AND ar.is_hidden = 0
                         """,
            nativeQuery = true
    )
    Page<ReviewCardRow> findCardsByKeyId(
            @Param("keyId") String keyId,
            @Param("viewerId") Long viewerId,
            Pageable pageable
    );

    /**
     * 리뷰 상세 조회(소프트 삭제 제외, 관광지 정합 포함)
     *
     * - (keyId, reviewId) 조합을 강제하여 다른 관광지의 리뷰를 잘못 조회하는 실수 방지
     * - isHidden=0 조건을 포함하여 소프트 삭제된 리뷰는 조회되지 않게 함
     */
    @Query("""
        SELECT r
        FROM AttractionReview r
        WHERE r.id = :reviewId
          AND r.attraction.keyId = :keyId
          AND r.isHidden = 0
    """)
    Optional<AttractionReview> findVisibleByIdAndKeyId(@Param("keyId") String keyId, @Param("reviewId") Long reviewId);

    /**
     * 리뷰 소프트 삭제: is_hidden=1로 직접 UPDATE
     * - 엔티티 로드/변경 대신 쿼리로 DB에 즉시 반영
     */
    @Modifying
    @Query("UPDATE AttractionReview r SET r.isHidden = 1 WHERE r.id = :reviewId AND r.attraction.keyId = :keyId")
    int setHiddenByIdAndKeyId(@Param("keyId") String keyId, @Param("reviewId") Long reviewId);

}
