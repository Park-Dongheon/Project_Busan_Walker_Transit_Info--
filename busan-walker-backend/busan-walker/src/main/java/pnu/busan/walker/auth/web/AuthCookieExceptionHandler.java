package pnu.busan.walker.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import pnu.busan.walker.common.error.ApiError;
import pnu.busan.walker.common.error.ErrorCode;
import pnu.busan.walker.common.error.exception.AppException;
import pnu.busan.walker.common.error.exception.ReusedRefreshTokenException;
import pnu.busan.walker.common.error.exception.TokenExpiredException;
import pnu.busan.walker.common.error.exception.UnauthorizedException;
import pnu.busan.walker.common.security.csrf.CsrfTokenCookieWriter;

import java.util.List;

/**
 * AuthCookieExceptionHandler
 *
 * 목적
 * - refresh/logout 같은 "쿠키 기반 세션 엔드포인트"에서 예외가 발생하면
 *   서버가 브라우저 쿠키를 정리(Set-Cookie clear)까지 책임져야
 *   프론트/사용자가 "스스로 쿠키를 지워야 하는 상태"로 방치되지 않음
 *
 * 처리 범위
 * - /api/v1/auth/refresh, /api/v1/auth/logout 에서 발생한 토큰 종료성 예외
 *
 * 응답
 * - 표준 ApiError(JSON) + 상태 코드(ErrorCode.status) + 쿠키 clear(Set-Cookie)
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = AuthController.class)
@RequiredArgsConstructor
public class AuthCookieExceptionHandler {

    private static final String TRACE_ID_MDC_KEY = "traceId";

    private final RefreshTokenCookieWriter refreshTokenCookieWriter;
    private final CsrfTokenCookieWriter csrfTokenCookieWriter;

    @ExceptionHandler({
            UnauthorizedException.class,
            TokenExpiredException.class,
            ReusedRefreshTokenException.class
    })
    public ResponseEntity<ApiError> handleSessionTerminal(AppException ex, HttpServletRequest request) {
        ErrorCode errorCode = ex.getErrorCode();

        ApiError body = ApiError.of(
                resolveTraceId(),
                errorCode,
                ex.getMessage(),
                List.of()
        );

        ResponseEntity.BodyBuilder builder = ResponseEntity.status(errorCode.getStatus());

        if (shouldClearCookies(request)) {
            ResponseCookie clearRt = refreshTokenCookieWriter.clear();
            ResponseCookie clearCsrf = csrfTokenCookieWriter.clear();

            builder.header(HttpHeaders.SET_COOKIE, clearRt.toString());
            builder.header(HttpHeaders.SET_COOKIE, clearCsrf.toString());
        }

        /* 보안 응답은 캐시되면 안 됨 */
        builder.header(HttpHeaders.CACHE_CONTROL, "no-store");

        return builder.body(body);
    }

    private static boolean shouldClearCookies(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null) return false;

        return uri.endsWith("/api/v1/auth/refresh") || uri.endsWith("/api/v1/auth/logout");
    }

    public static String resolveTraceId() {
        String traceId = MDC.get(TRACE_ID_MDC_KEY);
        return (traceId == null ? "" : traceId);
    }
}
