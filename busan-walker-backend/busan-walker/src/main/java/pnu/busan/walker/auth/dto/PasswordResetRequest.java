package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 비밀번호 재설정 토큰 발급 요청 DTO
 * - POST /api/v1/auth/password/reset-request
 */
public record PasswordResetRequest(
		@Email @NotBlank String email
) {}
