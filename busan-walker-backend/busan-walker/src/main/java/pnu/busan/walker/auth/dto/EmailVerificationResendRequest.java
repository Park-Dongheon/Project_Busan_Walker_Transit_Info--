package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * 이메일 인증 재발송 요청 DTO
 * - POST /api/v1/auth/email/resend
 */
public record EmailVerificationResendRequest(
		@Email @NotBlank String email
) {}
