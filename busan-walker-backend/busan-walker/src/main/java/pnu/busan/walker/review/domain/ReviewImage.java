package pnu.busan.walker.review.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.Instant;

/**
 * 리뷰 첨부 이미지 (단순 URL + 정렬순서)
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "review_images",
		indexes = @Index(name = "idx_ri_review", columnList = "review_id, sort_order"))
public class ReviewImage {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@NonNull
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "review_id", nullable = false, foreignKey = @ForeignKey(name = "fk_ri_review"))
	private AttractionReview review;

	@NotBlank
	@Size(max = 500)
	@Column(name = "image_url", nullable = false, length = 500)
	private String imageUrl;

	@Builder.Default
	@Min(1)
	@Column(name = "sort_order", nullable = false)
	private int sortOrder = 1;

	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

}
