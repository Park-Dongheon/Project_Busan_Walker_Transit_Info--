package pnu.busan.walker.auth.dto;

/**
 * 로그인 응답 DTO
 *
 * 설계 의도
 * - 브라우저 저장소(LocalStorage/SessionStorage)에 refreshToken이 남지 않도록 refreshToken은 응답 바디에서 제거
 * - refreshToken은 컨트롤러가 Set-Cookie(HttpOnly)로만 발급
 */
public record LoginResponse(
		String userId,
		String email,
		String displayName,
		String role,
		BrowserTokens tokens
) {}
