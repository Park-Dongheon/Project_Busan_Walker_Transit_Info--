package pnu.busan.walker.attraction.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import pnu.busan.walker.attraction.domain.Attraction;

import java.util.List;
import java.util.Optional;

/**
 * 관광지 Repository
 *
 * 설계 의도
 * - "목록(지도/카드)"은 집계/파생 컬럼이 있는 뷰(vw_attraction_cards)를 사용해 조회 성능과 응답 단순화를 확보
 * - "상세"는 attractions(정규화 테이블)에서 기본/소개 정보를 가져오고,
 * 	 교통 접근 옵션은 vw_transit_access_enriched에서 N건을 가져와 서비스에서 조합
 *
 * 페이징/정렬 정책
 * - 네이티브 쿼리에서 ORDER BY에 컬럼명/정렬방향을 파라미터로 직접 바인딩하면 SQL 문법 오류/인젝션 리스크가 생김
 * - 따라서 정렬은 "화이트리스트로 확정된 sortKey/sortDir"만 받아
 *   SQL에서 CASE WHEN으로 정렬식을 고정해 안전하게 처리
 * - Repository 메서드는 Page를 반환하고 countQuery를 별도로 둬서 totalElements/totalPages 계산을 일관되게 수행
 */
public interface AttractionRepository extends JpaRepository<Attraction, String> {

	/* =====================================================
	   1) 지도/카드 목록: vw_attraction_cards
	   ===================================================== */

	/**
	 * 카드 목록 Projection
	 *
	 * 매핑 규칙
	 * - SELECT alias(AS xxx)와 getter(getXxx)의 프로퍼티명이 일치해야 함
	 * - 집계 컬럼은 DB/드라이버에 따라 Integer/Long/BigDecimal 등이 섞일 수 있어 Number로 수용하는 편이 안전
	 */
	interface CardProjection {
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
		Double getNearestDistanceKm();
		Number getNearestWalkMin();
	}

	@Query(
			value = """
					SELECT keyid								AS keyId,
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
						   nearest_distance_km					AS nearestDistanceKm,
						   CAST(nearest_walk_min AS SIGNED)		AS nearestWalkMin
					FROM vw_attraction_cards
					WHERE latitude IS NOT NULL
					  AND longitude IS NOT NULL
					  AND ((:keyword IS NULL OR :keyword = '')
						   OR (place_name LIKE CONCAT('%', :keyword, '%')
							   OR address LIKE CONCAT('%', :keyword, '%')))
					ORDER BY
						/* placeName */
						CASE WHEN :sortKey = 'placeName' AND :sortDir = 'ASC' THEN place_name END ASC,
						CASE WHEN :sortKey = 'placeName' AND :sortDir = 'DESC' THEN place_name END DESC,

						/* avgRating (NULL은 0으로 치환하여 정렬 안정화) */
						CASE WHEN :sortKey = 'avgRating' AND :sortDir = 'ASC' THEN COALESCE(avg_rating, 0) END ASC,
						CASE WHEN :sortKey = 'avgRating' AND :sortDir = 'DESC' THEN COALESCE(avg_rating, 0) END DESC,

						/* totalAccess */
						CASE WHEN :sortKey = 'totalAccess' AND :sortDir = 'ASC' THEN total_transit_count END ASC,
						CASE WHEN :sortKey = 'totalAccess' AND :sortDir = 'DESC' THEN total_transit_count END DESC,

						/* nearestDistanceKm */
						CASE WHEN :sortKey = 'nearestDistanceKm' AND :sortDir = 'ASC' THEN nearest_distance_km END ASC,
						CASE WHEN :sortKey = 'nearestDistanceKm' AND :sortDir = 'DESC' THEN nearest_distance_km END DESC,

						/* tie-breaker: 동일 값일 때 결과 순서 고정 */
						place_name ASC,
						keyid ASC
					""",
			countQuery = """
						 SELECT COUNT(*)
						 FROM vw_attraction_cards
						 WHERE latitude IS NOT NULL
						   AND longitude IS NOT NULL
						   AND ((:keyword IS NULL OR :keyword = '')
							    OR (place_name LIKE CONCAT('%', :keyword, '%')
								    OR address LIKE CONCAT('%', :keyword, '%')))
						 """,
			nativeQuery = true
	)
	Page<CardProjection> findCardPageAllWithCoord(
			@Param("sortKey") String sortKey,
			@Param("sortDir") String sortDir,
			@Param("keyword") String keyword,
			Pageable pageable
	);

	/**
	 * bbox(지도 영역) 필터 카드 목록
	 *
	 * bbox 의미: south, west, north, east
	 * - latitude BETWEEN south AND north
	 * - longitude BETWEEN west AND east
	 */
	@Query(
			value = """
					SELECT keyid								AS keyId,
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
						   nearest_distance_km					AS nearestDistanceKm,
						   CAST(nearest_walk_min AS SIGNED)		AS nearestWalkMin
					FROM vw_attraction_cards
					WHERE latitude BETWEEN :south AND :north
					  AND longitude BETWEEN :west AND :east
					  AND ((:keyword IS NULL OR :keyword = '')
						   OR (place_name LIKE CONCAT('%', :keyword, '%')
							   OR address LIKE CONCAT('%', :keyword, '%')))
					ORDER BY
						CASE WHEN :sortKey = 'placeName' AND :sortDir = 'ASC' THEN place_name END ASC,
						CASE WHEN :sortKey = 'placeName' AND :sortDir = 'DESC' THEN place_name END DESC,
						
						CASE WHEN :sortKey = 'avgRating' AND :sortDir = 'ASC' THEN COALESCE(avg_rating, 0) END ASC, 
						CASE WHEN :sortKey = 'avgRating' AND :sortDir = 'DESC' THEN COALESCE(avg_rating, 0) END DESC,
						
						CASE WHEN :sortKey = 'totalAccess' AND :sortDir = 'ASC' THEN total_transit_count END ASC,
						CASE WHEN :sortKey = 'totalAccess' AND :sortDir = 'DESC' THEN total_transit_count END DESC,
						
						CASE WHEN :sortKey = 'nearestDistanceKm' AND :sortDir = 'ASC'  THEN nearest_distance_km END ASC,
						CASE WHEN :sortKey = 'nearestDistanceKm' AND :sortDir = 'DESC' THEN nearest_distance_km END DESC,
						
						place_name ASC,
						keyid ASC
					""",
			countQuery = """
						 SELECT COUNT(*)
						 FROM vw_attraction_cards
						 WHERE latitude BETWEEN :south AND :north
						   AND longitude BETWEEN :west AND :east
						   AND ((:keyword IS NULL OR :keyword = '')
							    OR (place_name LIKE CONCAT('%', :keyword, '%')
								    OR address LIKE CONCAT('%', :keyword, '%')))
						 """,
			nativeQuery = true
	)
	Page<CardProjection> findCardPageByBbox(
			@Param("sortKey") String sortKey,
			@Param("sortDir") String sortDir,
			@Param("keyword") String keyword,
			@Param("south") Double south,
			@Param("west") Double west,
			@Param("north") Double north,
			@Param("east") Double east,
			Pageable pageable
	);

	/* =====================================================
	   2) 소개 카드 목록: attractions
	   ===================================================== */

	/**
	 * 소개 페이지 카드 Projection
	 * - 소개 화면에서 필요한 컬럼만 최소 조회하여 네트워크/직렬화 비용을 절감
	 */
	interface IntroCardProjection {
		String getKeyId();
		String getPlaceName();
		String getAddress();
		String getImageUrl();
		String getCategoryName();
		String getStoryTitle();
		String getStorySummary();
		String getStoryUrl();
		String getCoreKeywords();
	}

	/**
	 * 소개 카드 페이지 조회(+ 키워드 필터)
	 *
	 * keyword 필터 정책
	 * - keyword가 비어있으면 전체 조회
	 * - keyword가 있으면 place_name/address/category_name에 부분일치로 필터
	 */
	@Query(
			value = """
					SELECT a.keyid							AS keyId,
						   a.place_name						AS placeName,
						   a.address						AS address,
						   a.image_url						AS imageUrl,
						   a.category_name					AS categoryName,
						   a.story_title					AS storyTitle,
						   a.story_summary					AS storySummary,
						   a.story_url						AS storyUrl,
						   a.core_keywords					AS coreKeywords
					FROM attractions a
					WHERE (:keyword IS NULL OR :keyword = '')
					   OR (a.place_name LIKE CONCAT('%', :keyword, '%')
						   OR a.address LIKE CONCAT('%', :keyword, '%')
						   OR a.category_name LIKE CONCAT('%', :keyword, '%'))
					ORDER BY
						CASE WHEN :sortKey = 'placeName' AND :sortDir = 'ASC' THEN a.place_name END ASC,
						CASE WHEN :sortKey = 'placeName' AND :sortDir = 'DESC' THEN a.place_name END DESC,

						CASE WHEN :sortKey = 'categoryName' AND :sortDir = 'ASC' THEN a.category_name END ASC,
						CASE WHEN :sortKey = 'categoryName' AND :sortDir = 'DESC' THEN a.category_name END DESC,

						a.place_name ASC,
						a.keyid ASC
					""",
			countQuery = """
						 SELECT COUNT(*)
						 FROM attractions a
						 WHERE (:keyword IS NULL OR :keyword = '')
						 	OR (a.place_name LIKE CONCAT('%', :keyword, '%')
						 	   OR a.address LIKE CONCAT('%', :keyword, '%')
						 	   OR a.category_name LIKE CONCAT('%', :keyword, '%'))
						 """,
			nativeQuery = true
	)
	Page<IntroCardProjection> findIntroCardPage(
			@Param("keyword") String keyword,
			@Param("sortKey") String sortKey,
			@Param("sortDir") String sortDir,
			Pageable pageable
	);

	/* =====================================================
	   3) 상세 기본 정보: attractions 단건
	   ===================================================== */

	/**
	 * 상세 기본 정보 Projection
	 * - 상세 화면에서 필요한 기본/소개 컬럼만 조회하여 엔티티 로딩 비용을 회피
	 */
	interface DetailProjection {
		String getKeyId();
		String getPlaceName();
		String getAddress();
		String getImageUrl();
		Double getLatitude();
		Double getLongitude();

		String getCategoryName();
		String getStoryTitle();
		String getStorySummary();
		String getStoryUrl();
		String getCoreKeywords();
	}

	@Query(
			value = """
					SELECT a.keyid						AS keyId,
						   a.place_name					AS placeName,
						   a.address					AS address,
						   a.image_url					AS imageUrl,
						   a.latitude					AS latitude,
						   a.longitude					AS longitude,
						   a.category_name				AS categoryName,
						   a.story_title				AS storyTitle,
						   a.story_summary				AS storySummary,
						   a.story_url					AS storyUrl,
						   a.core_keywords				AS coreKeywords
					FROM attractions a
					WHERE a.keyid = :keyId
					""",
			nativeQuery = true
	)
	Optional<DetailProjection> findDetailByKeyId(@Param("keyId") String keyId);

	/* =====================================================
	   4) 상세 교통 옵션: vw_transit_access_enriched
	   ===================================================== */

	/**
	 * 상세 교통 옵션 Projection
	 * - 관광지 1건에 대해 접근 옵션 N건을 행(row)으로 제공하는 뷰를 그대로 투영
	 */
	interface TransitOptionProjection {
		Number getAccessNo();
		String getModeCode();
		String getModeName();
		String getTransitClassName();
		String getFacilityName();
		String getBusStopNo();
		String getEntranceName();
		String getFacilityAddress();
		Double getFacilityLat();
		Double getFacilityLon();
		Number getFacilityHasCoord();
		Double getRawDistanceM();
		Double getDistanceM();
		String getDistanceSource();
		Double getDistanceKm();
		Number getWalkMin();
	}

	@Query(
			value = """
					SELECT ta.access_no						AS accessNo,
						   ta.transport_code				AS modeCode,
						   ta.transport_name				AS modeName,
						   ta.pbtrnsp_cl_nm				AS transitClassName,
						   ta.facility_name					AS facilityName,
						   ta.bus_stop_no					AS busStopNo,
						   ta.entrance_name					AS entranceName,
						   ta.facility_address				AS facilityAddress,
						   ta.facility_lat					AS facilityLat,
						   ta.facility_lon					AS facilityLon,
						   CASE
						   		WHEN ta.facility_lat IS NOT NULL
						   		 AND ta.facility_lon IS NOT NULL THEN 1
								ELSE 0
						   END								AS facilityHasCoord,
						   ta.raw_distance_m				AS rawDistanceM,
						   ta.distance_m					AS distanceM,
						   ta.distance_source				AS distanceSource,
						   ta.distance_km					AS distanceKm,
						   ta.est_walk_min					AS walkMin
					FROM vw_transit_access_enriched ta
					WHERE ta.keyid = :keyId
					ORDER BY ta.distance_m ASC, ta.access_no ASC
					""",
			nativeQuery = true
	)
	List<TransitOptionProjection> findTransitOptionByKeyId(@Param("keyId") String keyId);

	/* =====================================================
	   5) 엔티티가 필요할 때: 파생 쿼리
	   ===================================================== */

	Optional<Attraction> findByKeyId(String keyId);

}
