package pnu.busan.walker.auth.domain;

import jakarta.persistence.*;
import lombok.*;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 1회용 비밀번호 재설정 토큰
 *
 * 저장 원칙
 * - 토큰 원문(raw)은 메일 링크/응답으로만 전달
 * - DB에는 SHA-256 해시(token_hash)만 저장
 *
 * 주요 컬럼 의미
 * - expires_at  : 만료 시각
 * - consumed_at : 사용 완료 시각(1회성 보장)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
		name = "password_resets",
		uniqueConstraints = @UniqueConstraint(name = "uq_pr_user_token", columnNames = {"user_id", "token_hash"}),
		indexes = @Index(name = "idx_pr_expires", columnList = "expires_at"))
public class PasswordReset {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_pr_user"))
	private User user;

	/* 토큰 해시(BINARY(32)) */
	@Column(name = "token_hash", nullable = false, columnDefinition = "BINARY(32)")
	private byte[] tokenHash;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "consumed_at")
	private Instant consumedAt;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

}
