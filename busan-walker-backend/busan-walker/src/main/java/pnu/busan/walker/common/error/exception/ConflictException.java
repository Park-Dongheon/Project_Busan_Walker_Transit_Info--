package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 중복 생성, unique 제약 위반 등 충돌 상황
 */
public class ConflictException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public ConflictException(String message) {
		super(ErrorCode.CONFLICT, message);
	}

}