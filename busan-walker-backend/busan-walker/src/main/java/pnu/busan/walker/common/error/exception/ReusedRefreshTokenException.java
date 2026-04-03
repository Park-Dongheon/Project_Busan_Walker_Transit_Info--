package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 이미 사용된(또는 탈취가 의심되는) refresh token이 다시 제출된 경우
 * 보안 이벤트로 간주할 수 있는 상황
 */
public class ReusedRefreshTokenException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public ReusedRefreshTokenException(String message) {
		super(ErrorCode.REUSED_REFRESH_TOKEN, message);
	}

}