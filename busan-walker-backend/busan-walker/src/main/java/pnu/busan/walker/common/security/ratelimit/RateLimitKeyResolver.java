package pnu.busan.walker.common.security.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

/**
 * RateLimitKeyResolver
 *
 * 역할
 * - RateLimit 버킷의 subjectKey(대상 키)를 생성
 *
 * 실무 포인트
 * - 단순 IP 기반만 쓰면 NAT(회사/학교/공용망) 환경에서 여러 사용자가 한 IP를 공유해
 *   억울한 429가 발생할 수 있음
 * - 가능하면 "인증 사용자 식별자(userId 등)"를 우선 사용하고,
 *   비로그인/익명 상태에서는 IP로 fallback 하는 방식이 흔함
 */
public interface RateLimitKeyResolver {

    /**
     * resolve
     * - 현재 요청을 어떤 대상(사용자/IP 등)으로 제한할지 키를 반환
     * - 반환 값이 비거나 null이면 "모든 요청이 동일 버킷"으로 합쳐지는 사고가 날 수 있으므로
     *   구현체에서 반드시 안전한 값을 반환해야 함
     */
    String resolve(HttpServletRequest request, RateLimitRule rule);

}
