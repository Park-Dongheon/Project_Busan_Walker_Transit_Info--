package pnu.busan.walker.user.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 마이페이지 - 계정 활성/비활성 상태 변경 요청 DTO
 */
public record UpdateStatusRequest(
		@NotNull
		Boolean active
) {}
