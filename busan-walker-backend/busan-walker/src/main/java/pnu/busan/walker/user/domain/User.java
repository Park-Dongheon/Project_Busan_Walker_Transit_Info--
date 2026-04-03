package pnu.busan.walker.user.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;
import pnu.busan.walker.common.domain.Role;

import java.time.Instant;

/**
 * 애플리케이션 사용자
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "users",
	   uniqueConstraints = { 
			   @UniqueConstraint(name = "uq_users_email", columnNames = "email")
	   }
)
public class User {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Email
	@NotBlank
	@Size(max = 191)
	@Column(name = "email", nullable = false, length = 191)
	private String email;

	@Size(max = 255)
	@Column(name = "password_hash")
	private String passwordHash;

	@NotBlank
	@Size(max = 80)
	@Column(name = "display_name", nullable = false, length = 80)
	private String displayName;

	/**
	 * DB ENUM('ADMIN', 'MEMBER') -> EnumType.STRING 매핑
	 */
	@Builder.Default
	@Enumerated(EnumType.STRING)
	@Column(name = "role", nullable = false, length = 10)
	private Role role = Role.MEMBER;
	
	/* 이메일 인증 시각 (null: 미인증) */
	@Column(name = "email_verified_at")
	private Instant emailVerifiedAt;

	/* 계정 활성 여부 (DB: is_active TINYINT(1)) */
	@Builder.Default
	@Column(name = "is_active", nullable = false, columnDefinition = "TINYINT")
	private boolean active = false;		// 기본값 비활성
	
	@Builder.Default
	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 32)
	private AccountStatus status = AccountStatus.ACTIVE;
	
	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", insertable = false, updatable = false)
	private Instant updatedAt;
	
	/* === 도메인 메서드 === */
	
	/* 현재 계정이 실제 로그인 가능한 상태인지 */
	public boolean isLoginEnabled() {
		return active && status == AccountStatus.ACTIVE;
	}
	
	/* 사용자가 스스로 비활성화 */
	public void deactivateByUser() {
		this.active = false;
		this.status = AccountStatus.DISABLED_BY_USER;
	}
	
	/* 관리자가 비활성화 */
	public void deactivateByAdmin() {
		this.active = false;
		this.status = AccountStatus.DISABLED_BY_ADMIN;
	}
	
	/* 재활성 */
	public void reactivate() {
		this.active = true;
		this.status = AccountStatus.ACTIVE;
	}

}
