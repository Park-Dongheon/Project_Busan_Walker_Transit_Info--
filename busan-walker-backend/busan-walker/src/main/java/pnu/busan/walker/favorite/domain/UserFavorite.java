package pnu.busan.walker.favorite.domain;

import jakarta.persistence.*;
import lombok.*;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 즐겨찾기 (중복 방지 PK = (user_id, keyid)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
		name = "user_favorites",
		indexes = {
				@Index(name = "idx_uf_keyid_created", columnList = "keyid, created_at")
		}
)
public class UserFavorite {

	/**
	 * 즐겨찾기 엔티티
	 * - user_favorites는 (user_id, keyid) 복합 PK를 사용
	 * - keyid는 attractions(keyid)를 참조
	 */
	@EmbeddedId
	private UserFavoriteId id;

	@MapsId("userId")
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_uf_user"))
	private User user;

	/**
	 * 즐겨찾기의 관광지 FK는 attractions.keyid를 참조
	 */
	@MapsId("keyId")
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "keyid", referencedColumnName = "keyid", nullable = false, foreignKey = @ForeignKey(name = "fk_uf_attraction"))
	private Attraction attraction;

	/**
	 * 즐겨찾기 등록 시각(DB에서 자동 생성)
	 */
	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

}
