package pnu.busan.walker.auth.dto;

/**
 * 로그인 처리 결과(서버 내부 전달용)
 *
 * 설계 의도
 * - 컨트롤러가 refreshToken을 HttpOnly 쿠키로 내려야 하므로 raw refreshToken 이 필요
 * - 다라서 AuthService는 TokenPair를 포함한 내부 결과(LoginResult)를 반환
 * - 외부 응답(LoginResponse)에는 refreshToken을 포함하지 않음
 */
public record LoginResult(
        long userId,
        String email,
        String displayName,
        String role,
        TokenPair tokenPair
) {}
