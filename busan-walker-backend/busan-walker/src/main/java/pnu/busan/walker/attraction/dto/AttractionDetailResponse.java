package pnu.busan.walker.attraction.dto;

import java.util.List;

/**
 * 관광지 상세 DTO
 */
public record AttractionDetailResponse(
		String keyId,
		String placeName,
		String address,
		String imageUrl,
		Double latitude,
		Double longitude,

		String categoryName,
		String storyTitle,
		String storySummary,
		String storyUrl,
		String coreKeywords,

		List<TransitOptionDto> transitOptions
) {
	/**
	 * 상세 페이지의 대중교통 옵션 DTO
	 *
	 * - DB 뷰(vw_transit_access_enriched)의 row들을 그대로 리스트로 제공
	 * - accessNo(BIGINT)는 JS 정밀도 이슈를 피하기 위해 문자열로 전달
	 */
	public record TransitOptionDto(
			String accessNo,
			String modeCode,
			String modeName,
			String transitClassName,
			String facilityName,
			String busStopNo,
			String entranceName,
			String facilityAddress,
			Double facilityLat,
			Double facilityLon,
			Boolean facilityHasCoord,
			Double rawDistanceM,
			Double distanceM,
			String distanceSource,
			Double distanceKm,
			Integer walkMin
	) {}
}
