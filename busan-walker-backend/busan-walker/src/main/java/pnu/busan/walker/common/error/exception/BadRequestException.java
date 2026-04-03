package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 잘못된 요청 파라미터, 형식 오류 등
 */
public class BadRequestException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;
	
	public BadRequestException(String message) {
		super(ErrorCode.VALIDATION_ERROR, message);
	}

}