package pnu.busan.walker.review.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serial;
import java.io.Serializable;
import java.util.Objects;

/**
 * PK(review_id, user_id)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Embeddable
public class ReviewLikeId implements Serializable {

	@Serial
    private static final long serialVersionUID = 1L;

	@Column(name = "review_id")
	private Long reviewId;

	@Column(name = "user_id")
	private Long userId;

	@Override
	public int hashCode() {
		return Objects.hash(reviewId, userId);
	}

	@Override
	public boolean equals(Object obj) {
		if (this == obj) {
			return true;
		}

		if (!(obj instanceof ReviewLikeId r)) {
			return false;
		}

		return Objects.equals(reviewId, r.reviewId) && Objects.equals(userId, r.userId);
	}

}