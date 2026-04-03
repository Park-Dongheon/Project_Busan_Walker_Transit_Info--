package pnu.busan.walker.attraction.web;

import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import pnu.busan.walker.attraction.dto.AttractionDetailResponse;
import pnu.busan.walker.attraction.dto.AttractionIntroCardResponse;
import pnu.busan.walker.attraction.service.AttractionQueryService;
import pnu.busan.walker.common.pagination.ApiPage;
import pnu.busan.walker.common.pagination.PageParam;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

/**
 * 관광지 API Controller
 *
 * API 목표
 * - 지도 화면: bbox(지도 영역) 기반 카드 목록을 페이징으로 제공
 * - 소개 화면: keyword 기반 소개 카드 목록을 페이징으로 제공
 * - 상세 화면: 관광지 기본 정보 + 교통 접근 옵션을 단건 응답으로 제공
 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping(path = "/api/v1/attractions", produces = APPLICATION_JSON_VALUE)
public class AttractionController {

	private final AttractionQueryService attractionQueryService;
	
	/**
	 * 관광지 카드 리스트(지도/목록)
	 *
	 * Query Parameters
	 * - page, size, sort: PageParam이 바인딩 (예: sort=placeName,asc)
	 * - bbox: "south,west,north,east" (옵션)
	 *
	 * 정렬 주의사항
	 * - sort는 화이트리스트로 검증되며, 실제 정렬은 서비스/SQL에서만 수행
	 * - Repository에 전달하는 Pageable은 "정렬 없는" PageRequest이므로 SQL이 깨지지 않음
	 */
	@GetMapping
	public ApiPage<AttractionQueryService.AttractionCardView> list(
			@Validated PageParam pageParam,
			@RequestParam(required = false) String bbox,
			@RequestParam(required = false) String keyword
	) {
		return attractionQueryService.getAttractions(pageParam, bbox, keyword);
	}

	/**
	 * 관광지 상세
	 *
	 * Path Variable
	 * - keyId: 관광지 식별자
	 *
	 * 응답
	 * - attractions 기본/소개 정보 + 교통 접근 옵션 N건을 한 번에 제공하여, 프론트에서 다중 API 호출 없이 상세 화면을 구성
	 */
	@GetMapping("/{keyId}")
	public AttractionDetailResponse detail(@PathVariable String keyId) {
		return attractionQueryService.getAttractionDetail(keyId);
	}

	/**
	 * Query Parameters
	 * - page, size, sort: PageParam 바인딩 (예: sort=categoryName,desc)
	 * - keyword: 부분일치 검색 키워드(옵션)
	 */
	@GetMapping("/intros")
	public ApiPage<AttractionIntroCardResponse> introCards(
			@Validated PageParam pageParam,
			@RequestParam(required = false) String keyword
	) {
		return attractionQueryService.getIntroCards(pageParam, keyword);
	}
	
}
