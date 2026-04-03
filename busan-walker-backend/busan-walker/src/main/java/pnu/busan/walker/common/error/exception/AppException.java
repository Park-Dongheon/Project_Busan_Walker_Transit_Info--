package pnu.busan.walker.common.error.exception;

import lombok.Getter;
import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 서비스/도메인 레이어에서 던지는 표준 예외의 최상위 추상 클래스
 * - GlobalExceptionHandler 에서 AppException 하나만 상속받아 ErrorCode 기반 응답 생성
 */
@Getter
public abstract class AppException extends RuntimeException {

	@Serial
    private static final long serialVersionUID = 1L;

	private final ErrorCode errorCode;
	
	protected AppException(ErrorCode errorCode, String message) {
		super(message);
		this.errorCode = errorCode;
	}

}