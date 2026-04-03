package pnu.busan.walker.common.security.ratelimit;

/**
 * 토큰 소비 결과
 *
 * remaining: 응답 헤더(X-RateLimit-Remaining) 노출용
 * retryAfterSeconds: 제한 걸렸을 때 클라이언트 back-off 유도용
 */
public record RateLimitDecision(
        boolean allowed,
        long remaining,
        long retryAfterSeconds
) {}
