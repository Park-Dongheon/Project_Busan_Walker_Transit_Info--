package pnu.busan.walker.favorite.web;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import pnu.busan.walker.attraction.dto.AttractionCardResponse;
import pnu.busan.walker.common.pagination.ApiPage;
import pnu.busan.walker.common.pagination.PageParam;
import pnu.busan.walker.favorite.dto.FavoriteExistsResponse;
import pnu.busan.walker.favorite.service.FavoriteService;

import static org.springframework.http.MediaType.APPLICATION_JSON_VALUE;

/**
 * 즐겨찾기 REST 컨트롤러
 * 경로: /api/v1/favorites
 * - SecurityConfig 에서 인증 필요 경로로 설정
 */
@RestController
@RequestMapping(path = "/api/v1/favorites", produces = APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
@Validated
public class FavoriteController {

	private final FavoriteService favoriteService;
	
	private Long currentUserId(Jwt jwt) {
		/* SecurityConfig 에서 JWT의 sub에 userId를 넣고 있으므로 그대로 사용 */
		return Long.parseLong(jwt.getSubject());
	}
	
	/**
	 * 즐겨찾기 추가
	 */
	@PostMapping("/{attractionId}")
	public void addFavorite(@AuthenticationPrincipal Jwt jwt, @PathVariable("attractionId") String keyId) {
		favoriteService.addFavorite(currentUserId(jwt), keyId);
	}
	
	/**
	 * 즐겨찾기 삭제
	 */
	@DeleteMapping("/{attractionId}")
	public void removeFavorite(@AuthenticationPrincipal Jwt jwt, @PathVariable("attractionId") String keyId) {
		favoriteService.removeFavorite(currentUserId(jwt), keyId);
	}

	@GetMapping("/{attractionId}/exists")
	public FavoriteExistsResponse existsFavorite(
			@AuthenticationPrincipal Jwt jwt,
			@PathVariable("attractionId") String keyId
	) {
		boolean exists = favoriteService.existsFavorite(currentUserId(jwt), keyId);
		return new FavoriteExistsResponse(exists);
	}
	
	/**
	 * 내 즐겨찾기 목록
	 */
	@GetMapping
	public ApiPage<AttractionCardResponse> listFavorites(@AuthenticationPrincipal Jwt jwt, @Validated PageParam pageParam) {
		return favoriteService.listFavorites(currentUserId(jwt), pageParam);
	}
	
}
