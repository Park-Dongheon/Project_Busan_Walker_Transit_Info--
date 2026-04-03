package pnu.busan.walker.attraction.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * 관광지 마스터 엔티티
 *
 * - PK: keyid (원본 CSV KEYID)
 * - 지역: ctprvn_nm / signgu_nm / emd_nm
 * - 좌표는 누락될 수 있으므로 NULL 허용
 * - has_coord는 DB Generated Column(STORED)로 관리되며 애플리케이션에서 수정하지 않음
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "attractions")
public class Attraction {

	@Id
	@Column(name = "keyid", length = 64, nullable = false)
	private String keyId;

	/* 시/도 */
	@Column(name = "ctprvn_nm", length = 32)
	private String provinceName;

	/* 시/군/구 */
	@Column(name = "signgu_nm", length = 32)
	private String districtName;

	/* 읍/면/동 */
	@Column(name = "emd_nm",  length = 32)
	private String neighborhoodName;

	/* 관광지명 */
	@Column(name = "place_name", length = 200, nullable = false)
	private String placeName;

	/* 주소 */
	@Column(name = "address", length = 300)
	private String address;

	/* 관광지 대표 이미지 URL */
	@Column(name = "image_url", length = 512)
	private String imageUrl;

	/* 위도(DECIMAL(10,7)) - NULL 가능 */
	@Column(name = "latitude", precision = 10, scale = 7, nullable = true)
	private BigDecimal latitude;

	/* 경도(DECIMAL(10,7)) - NULL 가능 */
	@Column(name = "longitude", precision = 10, scale = 7, nullable = true)
	private BigDecimal longitude;

	/**
	 * 좌표 보유 여부
	 * - DB에서 latitude/longitude 기반으로 계산되어 STORED 컬럼로 존재
	 * - insert/update 대상이 아님
	 */
	@Column(
			name = "has_coord",
			nullable = false,
			insertable = false,
			updatable = false,
			columnDefinition = "TINYINT UNSIGNED"
	)
	private Boolean hasCoord;

	/* 분류명 */
	@Column(name = "category_name", length = 80)
	private String categoryName;

	/* 스토리 제목 */
	@Column(name = "story_title", length = 200)
	private String storyTitle;

	/* 스토리 요약(TEXT) */
	@Column(name = "story_summary", columnDefinition = "TEXT")
	private String storySummary;

	/* 스토리 URL */
	@Column(name = "story_url", length = 500)
	private String storyUrl;

	/* 핵심 키워드(TEXT) */
	@Column(name = "core_keywords", columnDefinition = "TEXT")
	private String coreKeywords;

	/* 생성 시각(DB 기본값) */
	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	/* 수정 시각(DB 기본값/ON UPDATE) */
	@Column(name = "updated_at", insertable = false, updatable  = false)
	private Instant updatedAt;

}
