package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 대상 리소스를 찾을 수 없을 때
 */
public class NotFoundException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public NotFoundException(String message) {
		super(ErrorCode.NOT_FOUND, message);
	}

}