package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 이메일 인증 확정 요청 DTO
 * - POST /api/v1/auth/email/verify
 *
 * payload 의미
 * - email: 인증 대상 사용자 식별(메일 주소)
 * - token: 메일 링크로 전달된 원문 토큰(Base64URL)
 */
public record EmailVerifyRequest(
		
		@Email
		@NotBlank
		String email,
		
		@NotBlank
		String token
) {}
