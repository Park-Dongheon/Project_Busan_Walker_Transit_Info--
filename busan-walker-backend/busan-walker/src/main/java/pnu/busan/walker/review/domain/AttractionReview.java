package pnu.busan.walker.review.domain;

import jakarta.persistence.*;
import lombok.*;
import pnu.busan.walker.attraction.domain.Attraction;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 관광지 리뷰(평점 1..5, soft-delete: is_hidden)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
		name = "attraction_reviews",
		indexes = {
				@Index(name = "idx_ar_attraction_created", columnList = "keyid, created_at DESC"),
				@Index(name = "idx_ar_user_created", columnList = "user_id, created_at DESC")
		})
public class AttractionReview {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@NonNull
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "keyid", nullable = false, foreignKey = @ForeignKey(name = "fk_ar_attraction"))
	private Attraction attraction;

	@ManyToOne(fetch = FetchType.LAZY, optional = true)
	@JoinColumn(name = "user_id", nullable = true, foreignKey = @ForeignKey(name = "fk_ar_user"))
	private User author;

	@Column(name = "author_name_snapshot", length = 80)
	private String authorNameSnapshot;
	
	@Column(name = "rating", nullable = false)
	private Byte rating;		// 1 ~ 5

	@Column(name = "body", nullable = false, columnDefinition = "TEXT")
	private String body;

	@Column(name = "is_hidden", nullable = false, columnDefinition = "TINYINT(1)")
	private byte isHidden = 0;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", insertable = false, updatable = false)
	private Instant updatedAt;

}
