package pnu.busan.walker.transit.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * 대중교통 분류 코드 (정적 코드 테이블)
 * DB: transit_types(code PK, data_no, name, created_at, updated_at)
 */
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "transit_types")
public class TransitType {

	@Id
	@Column(name = "code", nullable = false, length = 8)
	private String code;

	// DB가 SMALLINT면 Java는 Short가 가장 자연스럽습니다.
	// (UNSIGNED면 값 범위만 주의: 0~65535)
	@Column(name = "data_no", nullable = false)
	private Short dataNo;

	@Column(name = "name", nullable = false, length = 40)
	private String name;

	// TIMESTAMP(6)면 Instant(UTC) 추천 (운영/분산환경에서 안정적)
	@Column(name = "created_at", insertable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", insertable = false, updatable = false)
	private Instant updatedAt;
}