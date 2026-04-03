package pnu.busan.walker.common.error.exception;

import pnu.busan.walker.common.error.ErrorCode;

import java.io.Serial;

/**
 * CSRF 검증 실패 예외
 *
 * 사용 위치
 * - CsrfDoubleSubmitFilter에서 보호 대상 요청(refresh/logout 등)의
 *   CSRF 쿠키/헤더 값이 누락되거나 불일치할 때 발생
 *
 * 목적
 * - ErrorCode.CSRF_INVALID를 명시하여, 프론트가 "재시도(토큰 재발급) vs 재로그인"을 구분 가능
 */
public class CsrfInvalidException extends AppException{

    @Serial
    private static final long serialVersionUID = 1L;

    public CsrfInvalidException(String message) {
        super(ErrorCode.CSRF_INVALID, message);
    }
}
