package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 이메일/비밀번호 로그인 요청 DTO
 * - POST /api/v1/auth/login
 */
public record LoginRequest(
		@Email @NotBlank String email,
		@NotBlank String password
) {}
