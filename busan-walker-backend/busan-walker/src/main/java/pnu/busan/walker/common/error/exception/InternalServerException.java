package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 내부적으로 치명적/예상 불가능한 상황을 명시적으로 터뜨리고 싶을 때
 * 실제로는 대부분 try/catch 없이 터진 Exception을 GlobalExceptionHandler가 500 처리하겠지만,
 * "이건 무조건 500으로 내려라" 라는 비즈니스 의사결정이 필요한 경우 직접 던짐
 */
public class InternalServerException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public InternalServerException(String message) {
		super(ErrorCode.INTERNAL_ERROR, message);
	}

}