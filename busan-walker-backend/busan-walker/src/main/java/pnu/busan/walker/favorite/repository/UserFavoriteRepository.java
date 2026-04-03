package pnu.busan.walker.favorite.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pnu.busan.walker.favorite.domain.UserFavorite;
import pnu.busan.walker.favorite.domain.UserFavoriteId;

import java.time.Instant;

/**
 * 즐겨찾기 리포지토리
 * - user_favorites 엔티티 기반 CRUD
 * - vw_user_favorites_detail 기반 카드 조회
 */
public interface UserFavoriteRepository extends JpaRepository<UserFavorite, UserFavoriteId> {

	/**
	 * 즐겨찾기 카드 Projection
	 * - vw_user_favorites_detail 뷰 카드 표시용 정보
	 */
	interface FavoriteCardProjection {
		Long getUserId();
		String getKeyId();
		String getPlaceName();
		String getAddress();
		String getImageUrl();
		Double getLatitude();
		Double getLongitude();
		Number getReviewCount();
		Double getAvgRating();
		Number getTotalAccess();
		String getNearestModeCode();
		String getNearestModeName();

		/* 즐겨찾기 목록에서 프론트가 사용하는 필드: Km */
		Double getNearestDistanceKm();

		/* 서버 내부/기존 응답 호환용: m */
		Double getNearestDistanceM();

		Number getNearestWalkMin();
		Instant getFavoredAt();
	}
	
	/**
	 * 특정 유저의 즐겨찾기 카드 페이지
	 * - 컬럼명은 vw_user_favorites_detail 정의(keyid/total_transit_count/nearest_distance_m 등)
	 */
	@Query(
			value = """
					SELECT user_id								AS userId,
						   keyid								AS keyId,
						   place_name							AS placeName,
						   address								AS address,
						   image_url							AS imageUrl,
						   latitude								AS latitude,
						   longitude							AS longitude,
						   review_count							AS reviewCount,
						   avg_rating							AS avgRating,
						   total_transit_count					AS totalAccess,
						   nearest_mode_code					AS nearestModeCode,
						   nearest_mode_name					AS nearestModeName,
						   nearest_distance_m					AS nearestDistanceM,
						   nearest_distance_km					AS nearestDistanceKm,
						   CAST(nearest_walk_min AS SIGNED)		AS nearestWalkMin,
						   favored_at							AS favoredAt
					FROM vw_user_favorites_detail
					WHERE user_id = :userId
					-- #pageable
					""",
			countQuery = """
						 SELECT COUNT(*)
						 FROM vw_user_favorites_detail
						 WHERE user_id = :userId
						 """,
			nativeQuery = true
	)
	Page<FavoriteCardProjection> findFavoriteCardsByUserId(
			@Param("userId") Long userId,
			Pageable pageable
	);

}
