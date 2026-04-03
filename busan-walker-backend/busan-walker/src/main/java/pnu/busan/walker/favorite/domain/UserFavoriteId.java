package pnu.busan.walker.favorite.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serial;
import java.io.Serializable;
import java.util.Objects;

/**
 * PK(user_id, keyid)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Embeddable
public class UserFavoriteId implements Serializable {

	@Serial
    private static final long serialVersionUID = 1L;

	/**
	 * 즐겨찾기 복합 PK
	 * - user_id + keyid 조합으로 중복을 방지
	 */
	@Column(name = "user_id", nullable = false)
	private Long userId;
	
	@Column(name = "keyid", length = 64, nullable = false)
	private String keyId;

	@Override
	public int hashCode() {
		return Objects.hash(userId, keyId);
	}

	@Override
	public boolean equals(Object obj) {
		if (this == obj) {
			return true;
		}

		if (!(obj instanceof UserFavoriteId f)) {
			return false;
		}

		return Objects.equals(userId, f.userId) && Objects.equals(keyId, f.keyId);
	}

}
