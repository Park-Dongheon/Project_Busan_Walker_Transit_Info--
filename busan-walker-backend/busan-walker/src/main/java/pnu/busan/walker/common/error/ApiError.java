package pnu.busan.walker.common.error;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * 표준 에러 응답 DTO (클라이언트에 내려가는 JSON)
 *
 * {
 *   "timestamp": "...",
 *   "traceId": "...",
 *   "code": "VALIDATION_ERROR",
 *   "message": "Invalid request parameters",
 *   "details": [{"field":"size", "reason":"must be >= 1"}]
 * }
 */
@Getter
@Setter
@AllArgsConstructor
@Builder
public final class ApiError {
	private final OffsetDateTime 	timestamp;		// 에러 발생 시각 (서버 기준 UTC 권장)
	private final String		 	traceId;		// 추적용 Trace ID (로그/MDC와 연결)
	private final String		 	code;			// ErrorCode.name() 예: "VALIDATION_ERROR", "NOT_FOUND"
	private final String		 	message;		// 사용자/클라이언트에게 보여줄 메시지(민감 정보 금지)
	private final List<ErrorDetail> details;		// 필드 단위 상세 오류 목록 (없으면 빈 리스트)
	
	public static ApiError of(
			String traceId,
			ErrorCode errorCode,
			String message,
			List<ErrorDetail> details
	) {
		String resolvedCode = errorCode.getCode();
		String resolvedMessage = (message == null || message.isBlank())
				? errorCode.getMessage()
				: message;

		return new ApiError(
				OffsetDateTime.now(ZoneOffset.UTC),
				traceId,
				resolvedCode,
				resolvedMessage,
				(details == null ? List.of() : details)
		);
	}
	
}