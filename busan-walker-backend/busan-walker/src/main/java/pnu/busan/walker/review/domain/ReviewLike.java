package pnu.busan.walker.review.domain;

import jakarta.persistence.*;
import lombok.*;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 리뷰 좋아요 (중복 방지 PK = (review_id, user_id))
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "review_likes")
public class ReviewLike {

	@EmbeddedId
	private ReviewLikeId id;

	@NonNull
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@MapsId("reviewId")
	@JoinColumn(name = "review_id", nullable = false, foreignKey = @ForeignKey(name = "fk_rl_review"))
	private AttractionReview review;

	@NonNull
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@MapsId("userId")
	@JoinColumn(name = "user_id", nullable = false, foreignKey = @ForeignKey(name = "fk_rl_user"))
	private User user;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

}
