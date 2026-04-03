package pnu.busan.walker.common.error;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.MDC;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import pnu.busan.walker.common.error.exception.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 전역 예외 처리기
 *
 * 기본 정책:
 * - 항상 ApiError(JSON) + ErrorCode 기반 HTTP 상태를 반환
 * - 검증/바인딩 계열 → 400 VALIDATION_ERROR
 * - 정렬 화이트리스트 위반 → 400 INVALID_SORT_FIELD
 * - 인증/권한/리소스/충돌 → 401/403/404/409
 * - 무결성 위반(DataIntegrity) → 409
 * - 마지막 Fallback → 500 INTERNAL_ERROR
 *
 * - 스프링 기본 405/415 등은 ResponseEntityExceptionHandler 기본 구현 유지
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	private static final String TRACE_ID_MDC_KEY = "traceId";
	private static final String INVALID_SORT_FIELD_PREFIX = "INVALID_SORT_FIELD";

	/* -------------------------------------------------------------------------
	 * 1) (@RequestBody + @Valid) 바인딩/검증 실패 → 400
	 * ------------------------------------------------------------------------- */
	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(
			MethodArgumentNotValidException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {
		List<ErrorDetail> details = extractFieldErrors(ex.getBindingResult());

		return response(ErrorCode.VALIDATION_ERROR, "Invalid request parameters", details);
	}

	/* -------------------------------------------------------------------------
	 * 2) JSON 파싱 실패(문법 오류 등) → 400
	 * ------------------------------------------------------------------------- */
	@Override
	protected ResponseEntity<Object> handleHttpMessageNotReadable(
			HttpMessageNotReadableException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {

		return response(ErrorCode.VALIDATION_ERROR, "Malformed JSON request", null);
	}

	/* -------------------------------------------------------------------------
	 * 3) 타입 변환 실패(예: id=abc 이지만 Long 기대) → 400
	 * ------------------------------------------------------------------------- */
	@Override
	protected ResponseEntity<Object> handleTypeMismatch(
			TypeMismatchException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {
		String message;

		if (ex instanceof MethodArgumentTypeMismatchException matme) {
			String paramName = matme.getName();
			String requiredType = (matme.getRequiredType() != null)
					? matme.getRequiredType().getSimpleName()
					: "unknown";

			message = "Type mismatch for parameter '" + paramName + "': expected " + requiredType;
		} else {
			message = "Type mismatch";
		}

		return response(ErrorCode.VALIDATION_ERROR, message, null);
	}

	/* -------------------------------------------------------------------------
	 * 4) @ModelAttribute / query param 바인딩 실패 → 400
	 * ------------------------------------------------------------------------- */
	@ExceptionHandler(BindException.class)
	public ResponseEntity<Object> handleBindException(BindException ex) {
		List<ErrorDetail> details = extractFieldErrors(ex.getBindingResult());

		return response(ErrorCode.VALIDATION_ERROR, "Invalid request parameters", details);
	}

	/* -------------------------------------------------------------------------
	 * 5) (@PathVariable, @RequestParam 등) 제약 위반 → 400
	 * ------------------------------------------------------------------------- */
	@ExceptionHandler(ConstraintViolationException.class)
	public ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException ex) {
		List<ErrorDetail> details = new ArrayList<>();

		for (ConstraintViolation<?> v : ex.getConstraintViolations()) {
			String field = v.getPropertyPath() != null ? v.getPropertyPath().toString() : "";
			String reason = v.getMessage() != null ? v.getMessage() : "Validation failed";
			details.add(new ErrorDetail(field, reason));
		}

		return response(ErrorCode.VALIDATION_ERROR, "Constraint violation", details);
	}

	/* -------------------------------------------------------------------------
	 * 6) 도메인/애플리케이션 계층 예외 → 정의된 ErrorCode로 매핑
	 * ------------------------------------------------------------------------- */
	@ExceptionHandler(BadRequestException.class)
	public ResponseEntity<Object> handleBadRequest(BadRequestException ex) {
		return response(ErrorCode.VALIDATION_ERROR, ex.getMessage(), null);
	}

	@ExceptionHandler(UnauthorizedException.class)
	public ResponseEntity<Object> handleUnauthorized(UnauthorizedException ex) {
		return response(ErrorCode.AUTH_REQUIRED, ex.getMessage(), null);
	}

	@ExceptionHandler(ForbiddenException.class)
	public ResponseEntity<Object> handleForbidden(ForbiddenException ex) {
		return response(ErrorCode.FORBIDDEN, ex.getMessage(), null);
	}

	@ExceptionHandler(NotFoundException.class)
	public ResponseEntity<Object> handleNotFound(NotFoundException ex) {
		return response(ErrorCode.NOT_FOUND, ex.getMessage(), null);
	}

	@ExceptionHandler(ConflictException.class)
	public ResponseEntity<Object> handleConflict(ConflictException ex) {
		return response(ErrorCode.CONFLICT, ex.getMessage(), null);
	}

	@ExceptionHandler(AppException.class)
	public ResponseEntity<Object> handleAppException(AppException ex) {
		/*AppException 내부에 정의된 ErrorCode 사용*/
		return response(ex.getErrorCode(), ex.getMessage(), null);
	}

	/* ----------------------------------------------------------------------
     * 7) 데이터 무결성 위반 → 409
     * -------------------------------------------------------------------- */
	@ExceptionHandler(DataIntegrityViolationException.class)
	public ResponseEntity<Object> handleDataIntegrity(DataIntegrityViolationException ex) {
		return response(ErrorCode.CONFLICT, "Data integrity violation", null);
	}

	/* ----------------------------------------------------------------------
     * 8) 잘못된 파라미터(정렬 화이트리스트 위반 등) → 400
     *    - 예: "INVALID_SORT_FIELD: sortField"
     * -------------------------------------------------------------------- */
	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<Object> handleIllegalArgument(IllegalArgumentException ex) {
		String raw = ex.getMessage() == null ? "" : ex.getMessage();

		if (raw.startsWith(INVALID_SORT_FIELD_PREFIX)) {
			String field = "";
			int idx = raw.indexOf(":");

			if (idx >= 0 && idx < raw.length() - 1) {
				field = raw.substring(idx + 1).trim();
			}

			List<ErrorDetail> details = new ArrayList<>();
			details.add(new ErrorDetail(field, INVALID_SORT_FIELD_PREFIX));

			return response(ErrorCode.INVALID_SORT_FIELD, "Invalid sort field: " + field, details);
		}
		return response(ErrorCode.VALIDATION_ERROR, raw.isEmpty() ? "Bad request" : raw, null);
	}

	@ExceptionHandler(MultipartException.class)
	public ResponseEntity<Object> handleMultipartException(MultipartException ex) {
		return response(
				ErrorCode.VALIDATION_ERROR,
				"멀티파트 업로드 요청 처리에 실패했습니다. 파일 크기와 네트워크 상태를 확인해 주세요.",
				null
		);
	}

	/* ----------------------------------------------------------------------
     * 9) 최종 Fallback → 500
     *    - 내부 스택/SQL 등 민감정보 미노출
     *    - traceId로 서버 로그 역추적
     * -------------------------------------------------------------------- */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<Object> handleEtc(Exception ex) {
		return response(ErrorCode.INTERNAL_ERROR, "Unexpected error", null);
	}

	/* ======================================================================
     * 유틸리티
     * ==================================================================== */

	/* BindingResult 기반 필드 에러를 details 리스트로 변환 */
	private List<ErrorDetail> extractFieldErrors(BindingResult bindingResult) {
		List<ErrorDetail> list = new ArrayList<>();

		for (FieldError fe : bindingResult.getFieldErrors()) {
			String fieldName = fe.getField();
			String reason = fe.getDefaultMessage();

			if (reason == null || reason.isBlank()) {
				reason = "Validation failed";
			}

			list.add(new ErrorDetail(fieldName, reason));
		}
		return list;
	}

	/* ApiError DTO 생성 + ResponseEntity(status) 빌드 */
	private ResponseEntity<Object> response(ErrorCode code, String message, List<ErrorDetail> details) {
		String traceId = MDC.get(TRACE_ID_MDC_KEY);
		ApiError body = ApiError.of(traceId, code, message, details);

		return ResponseEntity.status(code.getStatus()).body(body);
	}

}
