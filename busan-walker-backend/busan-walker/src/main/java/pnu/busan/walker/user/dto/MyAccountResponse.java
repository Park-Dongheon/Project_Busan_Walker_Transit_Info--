package pnu.busan.walker.user.dto;

import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 마이페이지 - 내 계정 정보 응답 DTO
 * 엔티티를 그대로 노출하지 않고 필요한 필드만 flattening 하여 반환
 * - id는 JS Number 정밀도 이슈를 피하기 위해 문자열로 직렬화
 */
public record MyAccountResponse(
		String id,
		String email,
		String displayName,
		String role,
		boolean active,
		boolean emailVerified,
		Instant createdAt,
		Instant updatedAt
) {
	
	/* User 엔티티 -> 응답 DTO 변환용 정적 팩토리 */
	public static MyAccountResponse from(User u) {
		return new MyAccountResponse(
				u.getId() == null ? null : String.valueOf(u.getId()),
				u.getEmail(),
				u.getDisplayName(),
				u.getRole().name(),
				u.isActive(),
				u.getEmailVerifiedAt() != null,
				u.getCreatedAt(),
				u.getUpdatedAt()
		);
	}
}
