package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 로그아웃 요청 DTO
 * - POST /api/v1/auth/logout
 *
 * 전달값
 * - refreshToken: 세션(jti) 식별을 위한 토큰(서버는 해시로 조회)
 */
public record LogoutRequest(
        @NotBlank String refreshToken
) {}
