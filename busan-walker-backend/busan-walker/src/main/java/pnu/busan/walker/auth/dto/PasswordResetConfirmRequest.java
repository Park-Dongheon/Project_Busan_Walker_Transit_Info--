package pnu.busan.walker.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_DIGIT_MESSAGE;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_DIGIT_REGEX;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_LENGTH_MESSAGE;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_LOWERCASE_MESSAGE;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_LOWERCASE_REGEX;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_ALLOWED_CHARSET_MESSAGE;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_ALLOWED_CHARSET_REGEX;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_MAX_LENGTH;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_MIN_LENGTH;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_SPECIAL_ASCII_MESSAGE;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_SPECIAL_ASCII_REGEX;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_UPPERCASE_MESSAGE;
import static pnu.busan.walker.common.validation.PasswordPolicy.PASSWORD_UPPERCASE_REGEX;

/**
 * 비밀번호 재설정 확정 요청 DTO (1회용 토큰)
 * - POST /api/v1/auth/password/reset-confirm
 */
public record PasswordResetConfirmRequest(
		@Email
		@NotBlank
		String email,

		@NotBlank
		String token,

		@NotBlank
		@Size(min = PASSWORD_MIN_LENGTH, max = PASSWORD_MAX_LENGTH, message = PASSWORD_LENGTH_MESSAGE)
		@Pattern(regexp = PASSWORD_ALLOWED_CHARSET_REGEX, message = PASSWORD_ALLOWED_CHARSET_MESSAGE)
		@Pattern(regexp = PASSWORD_DIGIT_REGEX, message = PASSWORD_DIGIT_MESSAGE)
		@Pattern(regexp = PASSWORD_LOWERCASE_REGEX, message = PASSWORD_LOWERCASE_MESSAGE)
		@Pattern(regexp = PASSWORD_UPPERCASE_REGEX, message = PASSWORD_UPPERCASE_MESSAGE)
		@Pattern(regexp = PASSWORD_SPECIAL_ASCII_REGEX, message = PASSWORD_SPECIAL_ASCII_MESSAGE)
		String newPassword
) {}
