package pnu.busan.walker.common.security.csrf;

import com.nimbusds.jose.util.StandardCharset;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;
import pnu.busan.walker.common.error.exception.CsrfInvalidException;

import java.io.IOException;
import java.security.MessageDigest;

/**
 * Double Submit Cookie 기반 CSRF 방어 필터
 *
 * 핵심 로직
 * 1) 보호 대상 경로(protectedPaths) + 상태 변경 메서드(POST/PUT/PATCH/DELETE) 인지 검사
 * 2) CSRF 쿠키(HTTP Request Cookie)와 CSRF 헤더(Request Header)를 읽음
 * 3) 두 값이 모두 존재하고 완전히 동일할 때만 통과
 *
 * 실무 포인트
 * - Filter에서 예외를 throw 하면 @RestControllerAdvice JSON 포맷이 깨질 수 있어
 *   HandlerExceptionResolver로 공통 ApiError 포맷을 유지하는 방식이 안정적
 */
@Component
@RequiredArgsConstructor
public class CsrfDoubleSubmitFilter extends OncePerRequestFilter {

    private final CsrfProperties props;

    @Qualifier("handlerExceptionResolver")
    private final HandlerExceptionResolver handlerExceptionResolver;

    private final AntPathMatcher antPathMatcher = new AntPathMatcher();

    /**
     * shouldNotFilter
     *
     * 역할
     * - CSRF 검증이 필요한 요청만 필터를 적용
     *
     * 현재 정책
     * - props.enabled=false 이면 전부 스킵
     * - safe method(GET/HEAD/OPTIONS)는 스킵
     * - protectPaths에 매칭되는 경로만 적용
     */
    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        if (!props.isEnabled()) return true;

        String method = request.getMethod();

        /* Preflight / 안전 메서드는 CSRF 검증 대상에서 제외 */
        if ("OPTIONS".equalsIgnoreCase(method)) return true;
        if ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)) return true;

        String uri = request.getRequestURI();
        if (uri == null || uri.isBlank()) return true;

        /*
          protectedPath에만 적용
          - 프로젝트는 refresh/logout 같은 "쿠키 기반 상태 변경" 엔드포인트만 CSRF 보호
         */
        return props.getProtectedPaths().stream().noneMatch(path -> antPathMatcher.match(path, uri));
    }

    /**
     * doFilterInternal
     *
     * 역할
     * - cookie/header 토큰을 비교하여 불일치 시 요청을 차단
     *
     * 예외 처리
     * - 컨트롤러 밖(필터)에서 예외가 발생하므로,
     *   HandlerExceptionResolver를 통해 GlobalExceptionHandler로 위임해
     *   ApiError(JSON) 포맷을 통일
     */
    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String cookieToken = readCookieValue(request, props.getCookieName());
        String headerToken = request.getHeader(props.getHeaderName());

        /*
          검증 규칙
          - cookieToken / headerToken 둘 다 있어야 하며
          - 값이 완전히 일치해야 통과
         */
        boolean ok = cookieToken != null
                && !cookieToken.isBlank()
                && headerToken != null
                && !headerToken.isBlank()
                && constantTimeEquals(cookieToken, headerToken);

        if (!ok) {
            /* 403 + code=CSRF_INVALID 로 내려가야 프론트가 "CSRF 재발급 후 1회 재시도" UX를 만들 수 있음 */
            resolveAsJson(request, response, new CsrfInvalidException("CSRF 토큰이 유효하지 않습니다."));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void resolveAsJson(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull CsrfInvalidException exception) {
        if (response.isCommitted()) return;
        handlerExceptionResolver.resolveException(request, response, null, exception);
    }

    private static String readCookieValue(HttpServletRequest request, String cookieName) {
        Cookie[] cookies = request.getCookies();

        if (cookies == null) return null;

        for (Cookie cookie : cookies) {
            if (cookieName.equals(cookie.getName())) {
                String value = cookie.getValue();
                return (value == null || value.isBlank()) ? null : value;
            }
        }

        return null;
    }

    /**
     * constantTimeEquals
     * - 타이밍 기반 추측을 줄이기 위해 MessageDigest.isEqual 사용
     */
    private static boolean constantTimeEquals(String a, String b) {
        byte[] ba = a.getBytes(StandardCharset.UTF_8);
        byte[] bb = b.getBytes(StandardCharset.UTF_8);
        return MessageDigest.isEqual(ba, bb);
    }

}
