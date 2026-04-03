package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 너무 많은 요청(ex: API rate limit 초과)
 * 429 Too Many Requests 로 응답
 */
public class RateLimitedException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public RateLimitedException(String message) {
		super(ErrorCode.RATE_LIMITED, message);
	}

}