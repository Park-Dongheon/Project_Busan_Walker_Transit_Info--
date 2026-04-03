package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 액세스 토큰 또는 리프레시 토큰이 만료된 경우
 * 로그인은 했지만 세션/토큰이 더 이상 유효하지 않은 상황에 사용
 */
public class TokenExpiredException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public TokenExpiredException(String message) {
		super(ErrorCode.TOKEN_EXPIRED, message);
	}

}