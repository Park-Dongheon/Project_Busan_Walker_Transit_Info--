package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * 지원하지 않는 정렬 필드를 요청했을 때 사용
 */
public class InvalidSortFieldException extends AppException {

	@Serial
    private static final long serialVersionUID = 1L;

	public InvalidSortFieldException(String message) {
		super(ErrorCode.INVALID_SORT_FIELD, message);
	}

}