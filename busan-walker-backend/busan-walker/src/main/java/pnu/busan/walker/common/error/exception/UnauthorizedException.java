package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 인증이 안 되었거나 토큰이 유효하지 않을 때
 */
public class UnauthorizedException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public UnauthorizedException(String message) {
		super(ErrorCode.AUTH_REQUIRED, message);
	}

}