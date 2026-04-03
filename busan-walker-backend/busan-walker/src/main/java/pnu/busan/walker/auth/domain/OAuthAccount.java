package pnu.busan.walker.auth.domain;

import jakarta.persistence.*;
import lombok.*;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 소셜 로그인 계정 매핑
 *
 * 데이터 모델(oauth_accounts)
 * - provider + provider_user_id 조합으로 외부 계정을 유일하게 식별
 * - 내부 User와 1:N 매핑(사용자 1명이 여러 provider 계정을 연결할 수 있음)
 *
 * 사용 시나리오
 * - 소셜 로그인 콜백에서 provider/provider_user_id로 OAuthAccount를 조회
 * - 존재하면 해당 user로 로그인 처리
 * - 없으면 신규 user 생성/연결을 수행
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
		name = "oauth_accounts",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_oauth_provider_uid",
				columnNames = {"provider","provider_user_id"}
		)
)
public class OAuthAccount {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_oauth_user"))
	private User user;

	@Enumerated(EnumType.STRING)
	@Column(name = "provider", nullable = false, length = 10)
	private OAuthProvider provider;

	@Column(name = "provider_user_id", nullable = false, length = 191)
	private String providerUserId;

	@Column(name = "email", length = 191)
	private String email;

	@Column(name = "profile_name", length = 120)
	private String profileName;

	@Column(name = "avatar_url", length = 512)
	private String avatarUrl;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", insertable = false, updatable = false)
	private Instant updatedAt;

}
