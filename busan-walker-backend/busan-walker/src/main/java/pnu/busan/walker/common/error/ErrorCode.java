package pnu.busan.walker.common.error;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * API 에러 코드
 *
 * - status: HTTP 상태 코드
 * - code: 내부 식별 코드
 * - message: 사용자/개발자에게 노출 가능한 기본 메시지
 */
@Getter
@AllArgsConstructor
public enum ErrorCode {

	/* ========== 인증/인가 ========== */
	AUTH_REQUIRED(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다."),
	FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "권한이 없습니다."),

	/**
	 * CSRF 토큰 검증 실패
	 * - 쿠키 기반 인증 (RefreshToken 쿠키/세션 쿠키)을 사용하는 엔드포인트에서
	 *   크로스 사이트 요청 위조를 막기 위해 CSRF 토큰을 검증
	 * - 실패 시 403을 반환하고, 프론트는 CSRF 쿠키 재발급(GET /api/v1/auth/csrf) 후 재시도 전략을 선택 가능
	 */
	CSRF_INVALID(HttpStatus.FORBIDDEN, "CSRF_INVALID", "요청 검증에 실패했습니다."),

	/* ========== Rate Limit ========== */
	RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."),

	/* ========== 요청 검증 ========== */
	/**
	 * 요청 파라미터/바디 유효성 검증 실패
	 * - Bean Validation(@Valid) 또는 수동 검증 로직에서 실패한 경우 사용
	 */
	VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "요청 값이 올바르지 않습니다."),
	/**
	 * 허용되지 않은 정렬 필드/정렬 조건 요청
	 * - 화이트리스트 기반 정렬 필드 검즈에서 실패한 경우 사용
	 */
	INVALID_SORT_FIELD(HttpStatus.BAD_REQUEST, "INVALID_SORT_FIELD", "정렬 조건이 올바르지 않습니다."),

	/* ========== 토큰/세션 ========== */
	/**
	 * 인증 토큰(Access/Session) 만료
	 * - 재인증(로그인) 또는 갱신 플로우 진입이 필요한 경우 사용
	 */
	TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "인증이 만료되었습니다."),
	/**
	 * Refresh Token 재사용(회전/탈취 방지 정책 위반)
	 * - Refresh Token Rotation 전략에서 이미 폐기된 토큰이 다시 제출된 경우 사용
	 */
	REUSED_REFRESH_TOKEN(HttpStatus.UNAUTHORIZED, "REUSED_REFRESH_TOKEN", "토큰이 유효하지 않습니다. 다시 로그인해 주세요."),

	/* ========== 리소스 ========== */
	BAD_REQUEST(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "잘못된 요청입니다."),
	NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND", "요청한 리소스를 찾을 수 없습니다."),
	CONFLICT(HttpStatus.CONFLICT, "CONFLICT", "요청이 현재 상태와 충돌합니다."),

	/* ========== 서버 ========== */
	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");

	private final HttpStatus status;
	private final String code;
	private final String message;

}
