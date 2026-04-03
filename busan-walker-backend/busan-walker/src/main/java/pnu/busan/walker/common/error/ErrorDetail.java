package pnu.busan.walker.common.error;

/**
 * 단일 필드 검증 오류 항목
 * - {"field":"size", "reason":"must be >= 1"} 같은 형태
 */
public record ErrorDetail(
		String field,
		String reason
) {}