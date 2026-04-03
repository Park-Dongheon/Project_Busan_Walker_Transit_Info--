package pnu.busan.walker.attraction.dto;

/**
 * 관광지 카드 DTO
 *
 * - 좌표는 누락될 수 있으므로 Double(래퍼)로 받음
 * - 거리(nearestDistanceM)는 DB에서 DOUBLE로 계산될 수 있으므로 Double로 받음
 */
public record AttractionCardResponse(
		String keyId,
		String placeName,
		String address,
		String imageUrl,
		Double latitude,
		Double longitude,

		Integer reviewCount,
		Double avgRating,

		Integer totalAccess,
		String nearestModeCode,
		String nearestModeName,

		Double nearestDistanceM,
		Double nearestDistanceKm,
		Integer nearestWalkMin
) {}
