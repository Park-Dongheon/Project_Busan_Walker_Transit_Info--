package pnu.busan.walker.common.security.ratelimit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;
import pnu.busan.walker.common.error.exception.RateLimitedException;

import java.io.IOException;

/**
 * RateLimit Filter
 *
 * 목적
 * - 컨트롤러/DB/외부 API 호출 이전에 과도 트래픽을 빠르게 차단
 *
 * 응답 헤더
 * - X-RateLimit-Limit / X-RateLimit-Remaining : 클라이언트 진단/UX용
 * - Retry-After : 백오프(재시도 대기) 안내
 *
 * 예외 처리 전략
 * - Filter 레벨 예외도 GlobalExceptionHandler(@RestControllerAdvice) 포맷(JSON)으로 통일하기 위해
 *   HandlerExceptionResolver로 위임
 *
 * 실무 포인트
 * - OncePerRequestFilter는 doFilterInternal을 구현해야 함
 * - doFilter를 직접 오버라이드하면 프레임워크 호출 흐름과 충돌하여 동작/컴파일 문제가 생김
 */
@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitPolicy policy;
    private final RateLimitKeyResolver keyResolver;
    private final TokenBucketRateLimiter limiter;

    /**
     * handlerExceptionResolver는 Spring이 제공하는 기본 Bean 이름이 정해져 있어
     * “이름 기반 주입”을 사용하면 Lombok + @Qualifier 복사 문제를 피할 수 있음
     */
    private final HandlerExceptionResolver handlerExceptionResolver;

    /**
     * shouldNotFilter
     * - Preflight(OPTIONS) 요청은 통과
     * - RateLimit 기능이 비활성화면 통과
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return "OPTIONS".equalsIgnoreCase(request.getMethod()) || !policy.isEnabled();
    }

    /**
     * doFilterInternal
     * - OncePerRequestFilter가 실제로 호출하는 핵심 필터 메서드
     */
    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        RateLimitRule rule = policy.resolve(request);
        String subjectKey = keyResolver.resolve(request, rule);

        RateLimitDecision decision = limiter.tryConsume(rule, subjectKey);

        response.setHeader("X-RateLimit-Limit", String.valueOf(rule.capacity()));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(decision.remaining()));

        if (!decision.allowed()) {
            response.setHeader("Retry-After", String.valueOf(decision.retryAfterSeconds()));
            resolveAsJson(request, response, new RateLimitedException("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void resolveAsJson(HttpServletRequest request, HttpServletResponse response, Exception exception) {
        if (response.isCommitted()) return;
        handlerExceptionResolver.resolveException(request, response, null, exception);
    }

}
