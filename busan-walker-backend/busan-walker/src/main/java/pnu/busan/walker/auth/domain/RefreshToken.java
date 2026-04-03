package pnu.busan.walker.auth.domain;

import jakarta.persistence.*;
import lombok.*;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * Refresh 토큰 저장소
 *
 * 모델링 의도
 * - 클라이언트에는 refresh token 원문(raw)이 존재
 * - 서버에는 SHA-256 해시(token_hash)만 저장하여 유출 리스크를 줄임
 *
 * 회전(rotate) / 재사용 탐지
 * - 회전 시: 현재  토큰 consumed_at 설정(1회성 보장) + 새 토큰 저장
 * - 재사용 탐지: consumed_at != null 인 토큰이 다시 제출되면 "동일 jti 패밀리"를 전부 폐기(revoked_at)
 * 
 * 주요 컬럼 의미
 * - jti		: 세션/패밀리 식별자(UUID를 BINARY(16)로 저장)
 * - token_hash	: SHA-256 해시(BINARY(32))
 * - consumed_at: 사용 완료(회전 완료) 시각
 * - revoked_at	: 강제 폐기(로그아웃/사고 대응) 시각
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
		name = "refresh_tokens",
		uniqueConstraints = @UniqueConstraint(name = "uk_rt_token_hash", columnNames = "token_hash"),
		indexes = {
				@Index(name = "idx_rt_user_expires", columnList = "user_id, expires_at"),
				@Index(name = "idx_rt_jti", columnList = "jti"),
				@Index(name = "idx_rt_expires", columnList = "expires_at")
		}
)
public class RefreshToken {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_rt_user"))
	private User user;

	/* 세션/패밀리 식별자 - UUID 권장 (Converter로 BINARY(16) 매핑) */
	@Column(name = "jti", nullable = false, columnDefinition = "BINARY(16)")
	private byte[] jti;

	/* SHA-256 해시 원문 32바이트 → BINARY(32) */
	@Column(name = "token_hash", nullable = false, columnDefinition = "BINARY(32)")
	private byte[] tokenHash;

	@Column(name = "issued_at", nullable = false)
	private Instant issuedAt;

	@Column(name  = "expires_at", nullable = false)
	private Instant expiresAt;
	
	/* 회전/사용 완료 시각(재사용 탐지용) */
	@Column(name = "consumed_at")
	private Instant consumedAt;

	/* 폐기(블랙리스트/사고 대응) */
	@Column(name = "revoked_at")
	private Instant revokedAt;

	/* VARBINARY(16) - IPv4/IPv6 원시 바이트 */
	@Column(name = "ip_address", columnDefinition = "VARBINARY(16)")
	private byte[] ipAddress;

	@Column(name = "user_agent", length = 255)
	private String userAgent;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", insertable = false, updatable = false)
	private Instant updatedAt;

}
