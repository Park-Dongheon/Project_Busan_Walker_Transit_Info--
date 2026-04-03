package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 토큰 갱신 요청 DTO (Refresh 회전)
 * - POST /api/v1/auth/refresh
 */
public record RefreshRequest(
        @NotBlank String refreshToken
) {}