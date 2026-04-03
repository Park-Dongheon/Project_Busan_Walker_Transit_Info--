package pnu.busan.walker.auth.dto;

/**
 * 브라우저로 내려주는 토큰 묶음
 *
 * 보안 원칙
 * - refreshToken은 절대 응답 바디(JSON)로 내리지 않음(오직 HttpOnly 쿠키 Set-Cookie로만 전달)
 * - 브라우저(JS)는 refreshToken 원문에 접근할 수 없고, 접근해서도 안 됨
 *
 * 반환 정책
 * - accessToken만 응답 바디로 제공
 * - refreshToken의 만료/연장/회전은 서버가 쿠키(Set-Cookie)로만 관리
 */
public record BrowserTokens(
        String accessToken
) {}
