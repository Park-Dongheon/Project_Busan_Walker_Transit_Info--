package pnu.busan.walker.attraction.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pnu.busan.walker.attraction.dto.AttractionDetailResponse;
import pnu.busan.walker.attraction.dto.AttractionIntroCardResponse;
import pnu.busan.walker.attraction.repository.AttractionRepository;
import pnu.busan.walker.common.error.exception.BadRequestException;
import pnu.busan.walker.common.error.exception.NotFoundException;
import pnu.busan.walker.common.pagination.ApiPage;
import pnu.busan.walker.common.pagination.PageParam;

import java.util.List;
import java.util.Set;

/**
 * 관광지 Query 전용 Service
 *
 * 역할
 * - Repository(Projection/네이티브 쿼리)에서 가져온 데이터를 API 응답 형태로 조립
 * - 정렬 키/방향 화이트리스트를 강제하여 SQL 인젝션 및 쿼리 오류를 차단
 * - bbox 문자열 파싱/검증을 수행하여 지도 영역 필터를 안전하게 적용
 *
 * 중요한 구현 포인트: "정렬은 SQL에서만 수행"
 * - PageParam이 생성하는 Pageable에는 Sort가 포함될 수 있음
 * - 네이티브 쿼리에 Sort가 섞이면 Spring Data가 ORDER BY를 덧붙이면서 SQL이 깨질 수 있음
 * - 따라서:
 * 	 1) PageParam으로 sort를 "검증"만 하고
 * 	 2) Repository에 전달하는 Pageable은 Sort 없는 PageRequest로 만듬
 * 	 3) 실제 정렬은 Repository SQL의 CASE WHEN만 수행
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AttractionQueryService {

	private final AttractionRepository attractionRepo;

	/**
	 * 지도/카드 목록에서 허용하는 정렬 키
	 * - 이 목록 밖의 값은 PageParam 단계에서 차단되며, 최종적으로 SQL의 CASE WHEN에만 반영
	 */
	private static final Set<String> CARD_SORT_WHITELIST = Set.of(
			"placeName", "avgRating", "totalAccess", "nearestDistanceKm"
	);

	/**
	 * 소개 카드 목록에서 허용하는 정렬 키
	 */
	private static final Set<String> INTRO_SORT_WHITELIST = Set.of(
			"placeName", "categoryName"
	);

	/**
	 * 지도/카드 목록 조회
	 *
	 * @param pageParam page/size/sort 정보를 담은 공통 파라미터 객체
	 * @param bbox "south, west, north, east" 형식의 지도 영역
	 * @return ApiPage 현태의 페이징 응답
	 */
	public ApiPage<AttractionCardView> getAttractions(PageParam pageParam, String bbox, String keyword) {
		/* 1) sort 문자열을 화이트리스트로 검증하고, 기본 정렬을 부여 */
		Sort defaultSort = Sort.by(Sort.Order.asc("placeName"));
		Pageable validated = pageParam.toPageable(CARD_SORT_WHITELIST, defaultSort);

		/* 2) 검증된 Sort에서 대표(첫 번째) 정렬 조건을 뽑아 SQL 파라미터로 사용 */
		Sort.Order primaryOrder = firstOrderOrDefault(validated.getSort(), defaultSort);
		String sortKey = primaryOrder.getProperty();
		String sortDir = primaryOrder.isAscending() ? "ASC" : "DESC";

		/* 3) Repository로 전달하는 Pageable은 "정렬 없는" PageRequest로 만들어, Spring Data가 ORDER BY를 추가하지 못하게 함 */
		Pageable pageableForRepo = PageRequest.of(validated.getPageNumber(), validated.getPageSize());

		Page<AttractionRepository.CardProjection> page;
		if (bbox == null || bbox.isBlank()) {
			page = attractionRepo.findCardPageAllWithCoord(sortKey, sortDir, keyword, pageableForRepo);
		} else {
			Bbox parsed = parseAndValidateBbox(bbox);
			page = attractionRepo.findCardPageByBbox(
					sortKey, sortDir, keyword,
					parsed.south(), parsed.west(), parsed.north(), parsed.east(),
					pageableForRepo
			);
		}

		/* 4) Projection -> API View DTO로 매핑하여 ApiPage로 래핑 */
		Page<AttractionCardView> mapped = page.map(this::toCardView);
		return ApiPage.from(mapped);
	}

	/**
	 * 소개 카드 목록 조회(+ 키워드)
	 *
	 * @param pageParam page/size/sort
	 * @param keyword 부분일치 검색 키워드
	 */
	public ApiPage<AttractionIntroCardResponse> getIntroCards(PageParam pageParam, String keyword) {
		Sort defaultSort = Sort.by(Sort.Order.asc("placeName"));
		Pageable validated = pageParam.toPageable(INTRO_SORT_WHITELIST, defaultSort);

		Sort.Order primaryOrder = firstOrderOrDefault(validated.getSort(), defaultSort);
		String sortKey = primaryOrder.getProperty();
		String sortDir = primaryOrder.isAscending() ? "ASC" : "DESC";

		Pageable pageableForRepo = PageRequest.of(validated.getPageNumber(), validated.getPageSize());

		Page<AttractionRepository.IntroCardProjection> page = attractionRepo.findIntroCardPage(keyword, sortKey, sortDir, pageableForRepo);

		Page<AttractionIntroCardResponse> mapped = page.map(this::toIntroCardResponse);
		return ApiPage.from(mapped);
	}

	public AttractionDetailResponse getAttractionDetail(String keyId) {
		AttractionRepository.DetailProjection detail = attractionRepo.findDetailByKeyId(keyId).orElseThrow(() -> new NotFoundException("관광지를 찾을 수 없습니다. keyId=" + keyId));

		List<AttractionDetailResponse.TransitOptionDto> options = attractionRepo.findTransitOptionByKeyId(keyId)
				.stream()
				.map(this::toTransitOptionDto)
				.toList();

		return new AttractionDetailResponse(
				detail.getKeyId(),
				detail.getPlaceName(),
				detail.getAddress(),
				detail.getImageUrl(),
				detail.getLatitude(),
				detail.getLongitude(),
				detail.getCategoryName(),
				detail.getStoryTitle(),
				detail.getStorySummary(),
				detail.getStoryUrl(),
				detail.getCoreKeywords(),
				options
		);
	}

	/* =====================================================
	   Mapping helpers
	   ===================================================== */

	/**
	 * 카드 목록 View DTO
	 *
	 * - 프론트가 사용하는 표시 단위를 Km로 고정하기 위해 nearestDistanceKm를 제공
	 * - 하위 호환 또는 서버 내부 연산 편의를 위해 nearestDistanceM도 함께 제공
	 */
	public record AttractionCardView(
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
			Double nearestDistanceKm,
			Double nearestDistanceM,
			Integer nearestWalkMin
	) {}

	private AttractionCardView toCardView(AttractionRepository.CardProjection p) {
		Integer reviewCount = toIntOrNull(p.getReviewCount());
		Integer totalAccess = toIntOrNull(p.getTotalAccess());
		Integer nearestWalkMin = toIntOrNull(p.getNearestWalkMin());

		Double nearestDistanceKm = p.getNearestDistanceKm();
		Double nearestDistanceM = (nearestDistanceKm == null) ? null : nearestDistanceKm * 1000.0;

		return new AttractionCardView(
				p.getKeyId(),
				p.getPlaceName(),
				p.getAddress(),
				p.getImageUrl(),
				p.getLatitude(),
				p.getLongitude(),
				reviewCount,
				p.getAvgRating(),
				totalAccess,
				p.getNearestModeCode(),
				p.getNearestModeName(),
				nearestDistanceKm,
				nearestDistanceM,
				nearestWalkMin
		);
	}

	private AttractionIntroCardResponse toIntroCardResponse(AttractionRepository.IntroCardProjection p) {
		return new AttractionIntroCardResponse(
				p.getKeyId(),
				p.getPlaceName(),
				p.getAddress(),
				p.getImageUrl(),
				p.getCategoryName(),
				p.getStoryTitle(),
				p.getStorySummary(),
				p.getStoryUrl(),
				p.getCoreKeywords()
		);
	}

	private AttractionDetailResponse.TransitOptionDto toTransitOptionDto(AttractionRepository.TransitOptionProjection p) {
		return new AttractionDetailResponse.TransitOptionDto(
				toStringOrNull(p.getAccessNo()),
				p.getModeCode(),
				p.getModeName(),
				p.getTransitClassName(),
				p.getFacilityName(),
				p.getBusStopNo(),
				p.getEntranceName(),
				p.getFacilityAddress(),
				p.getFacilityLat(),
				p.getFacilityLon(),
				toBooleanByFlag(p.getFacilityHasCoord()),
				p.getRawDistanceM(),
				p.getDistanceM(),
				p.getDistanceSource(),
				p.getDistanceKm(),
				toIntOrNull(p.getWalkMin())
		);
	}

	/* =====================================================
	   Validation helpers
	   ===================================================== */

	/**
	 * bbox 파싱/검증
	 *
	 * 입력 형식: "south, west, north, east"
	 * - south < north
	 * - west < east
	 * - latitude 범위 (-90~90), longitude 범위 (-180~180) 검증
	 *
	 * 잘못된 입력은 BadRequestException으로 400 계열 에러로 처리되도록 함
	 */
	private Bbox parseAndValidateBbox(String bbox) {
		String[] parts = bbox.split(",");
		if (parts.length != 4) {
			throw new BadRequestException("bbox 형식이 올바르지 않습니다. 기대 형식: south, west, north, east");
		}

		double south;
		double west;
		double north;
		double east;

		try {
			south = Double.parseDouble(parts[0].trim());
			west = Double.parseDouble(parts[1].trim());
			north = Double.parseDouble(parts[2].trim());
			east = Double.parseDouble(parts[3].trim());
		}  catch (NumberFormatException e) {
			throw new BadRequestException("bbox는 숫자 4개로 구성되어야 합니다. 기대 형식: south,west,north,east");
		}

		if (south >= north) {
			throw new BadRequestException("bbox 위도 범위가 올바르지 않습니다. south < north 이어야 합니다.");
		}

		if (west >= east) {
			throw new BadRequestException("bbox 경도 범위가 올바르지 않습니다. west < east 이어야 합니다.");
		}

		if (!isInRange(south, -90, 90) || !isInRange(north, -90, 90)) {
			throw new BadRequestException("bbox 위도 범위는 -90~90 이어야 합니다.");
		}

		if (!isInRange(west, -180, 180) || !isInRange(east, -180, 180)) {
			throw new BadRequestException("bbox 경도 범위는 -180~180 이어야 합니다.");
		}

		return new Bbox(south, west, north, east);
	}

	private record Bbox(double south, double west, double north, double east) {}

	private static boolean isInRange(double value, double min, double max) {
		return value >= min && value <= max;
	}

	private static Sort.Order firstOrderOrDefault(Sort sort, Sort defaultSort) {
		var	it = sort.iterator();
		if (it.hasNext()) return it.next();

		return defaultSort.iterator().next();
	}

	private static Integer toIntOrNull(Number n) {
		if (n == null) return null;
		/* 집계 값이 큰 경우도 있어 long으로 받아 안전하게 변환(범위 초과 시 예외 대신 상한 처리 가능) */
		long v = n.intValue();
		if (v > Integer.MAX_VALUE) return Integer.MAX_VALUE;
		if (v < Integer.MIN_VALUE) return Integer.MIN_VALUE;
		return (int) v;
	}

	private static String toStringOrNull(Number n) {
		return (n == null) ? null : n.toString();
	}

	private static Boolean toBooleanByFlag(Number n) {
		if (n == null) return null;
		return n.intValue() != 0;
	}

}
