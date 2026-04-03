package pnu.busan.walker.auth.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 이메일 인증 토큰 (1회용)
 *
 * 저장 원칙
 * - 토큰 원문(row)은 절대 DB에 저장하지 않음
 * - DB에는 SHA-256 해시(token_hash, 32 bytes)만 저장하여 유출 시 피해를 최소화
 *
 * 수명주기
 * - 발급(issue): user + token_hash + expires_at 저장
 * - 검증(verify): user + token_hash(+purpose)로 조회 후 만료/소비 여부 검사
 * - 소비(consume): consumed_at을 now로 설정하여 재사용 방지
 * - 청소(cleanup): 만료/소비 토큰을 삭제하여 테이블 관리
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
		name = "email_verifications",
		uniqueConstraints = {
				@UniqueConstraint(name = "uq_ev_user_token", columnNames = {"user_id", "token_hash"}),
				@UniqueConstraint(name = "uq_ev_token_hash", columnNames = {"token_hash"})
		},
		indexes = {
				@Index(name = "idx_ev_user_id", columnList = "user_id"),
				@Index(name = "idx_ev_expires_at", columnList = "expires_at"),
				@Index(name = "idx_ev_user_expires", columnList = "user_id, expires_at"),
				@Index(name = "idx_ev_user_purpose_id", columnList = "user_id, purpose, id"),
				@Index(name = "idx_ev_user_purpose_token", columnList = "user_id, purpose, token_hash")
		}
)
public class EmailVerification {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/**
	 * 토큰 소유 사용자
	 * - lazy 로딩: 검증 시점에만 접근(불필요한 조인/로딩 최소화)
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_ev_user"))
	private User user;

	/**
	 * 토큰 목적
	 * - 가입 인증(SIGNUP)/이메일 변경 인증(CHANGE_EMAIL)/비밀번호 변경 인증(CHANGE_PASSWORD) 등을 구분
	 */
	@Enumerated(EnumType.STRING)
	@Column(name = "purpose", nullable = false, length = 20)
	private EmailVerificationPurpose purpose = EmailVerificationPurpose.SIGNUP;

	/**
	 * 토큰 해시(BINARY(32))
	 * - SHA-256 결과(32 bytes)를 그대로 저장
	 */
	@Column(name = "token_hash", nullable = false, columnDefinition = "BINARY(32)")
	private byte[] tokenHash;

	/**
	 * 만료 시각
	 * - now 이후인지 여부로 유효성 판단
	 */
	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	/**
	 * 소비 시각
	 * - null: 미사용
	 * - not null: 이미 사용됨(재사용 방지)
	 */
	@Column(name = "consumed_at")
	private Instant consumedAt;
	
	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;
	
}
