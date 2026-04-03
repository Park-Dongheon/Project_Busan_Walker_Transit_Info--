package pnu.busan.walker.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 마이페이지 - 내 정보(표시 이름) 수정 요청 DTO
 */
public record UpdateProfileRequest(
		@NotBlank
		@Size(max = 80)
		String displayName
) {}
