package pnu.busan.walker.review.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import lombok.*;
import pnu.busan.walker.user.domain.User;

import java.time.Instant;

/**
 * 리뷰 댓글(soft-delete: is_hidden)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
		name = "review_comments",
		indexes = {
				@Index(name = "idx_rc_review_created", columnList = "review_id, created_at"),
				@Index(name = "idx_rc_user_created", columnList = "user_id, created_at")
		})
public class ReviewComment {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@NonNull
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "review_id", nullable = false, foreignKey = @ForeignKey(name = "fk_rc_review"))
	private AttractionReview review;

	@ManyToOne(fetch = FetchType.LAZY, optional = true)
	@JoinColumn(name = "user_id", nullable = true, foreignKey = @ForeignKey(name = "fk_rc_user"))
	private User author;

	@Column(name = "author_name_snapshot", length = 80)
	private String authorNameSnapshot;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "parent_comment_id", foreignKey = @ForeignKey(name = "fk_rc_parent"))
	private ReviewComment parent;

	@NotBlank
	@Column(name = "body", nullable = false, columnDefinition = "TEXT")
	private String body;

	@Builder.Default
	@Column(name = "is_hidden", nullable = false, columnDefinition = "TINYINT(1)")
	private boolean hidden = false;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", insertable = false, updatable = false)
	private Instant updatedAt;

}
