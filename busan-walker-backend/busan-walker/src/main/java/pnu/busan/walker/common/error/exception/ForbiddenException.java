package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 인증은 됐지만 권한(ROLE 등)이 없을 때
 */
public class ForbiddenException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public ForbiddenException(String message) {
		super(ErrorCode.FORBIDDEN, message);
	}

}