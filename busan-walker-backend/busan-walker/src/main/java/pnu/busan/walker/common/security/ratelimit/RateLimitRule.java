package pnu.busan.walker.common.security.ratelimit;

import java.time.Duration;

/**
 * RateLimit 규칙(불변 record)
 *
 * 목적
 * - 요청별로 적용할 제한 정책(버킷 크키/충전량/충전주기)을 하나의 값 객체로 전달
 *
 * 필드 의미
 * - id: 버킷 키 구성을 위한 규칙 식별자 (예: "auth", "default")
 * - enabled: 이 규칙이 활성화되었는지 여부
 * - capacity: 버킷 최대 토큰 수 (최대 동시/연속 처리량 상한)
 * - refillTokens: refillDuration 동안 충전되는 토큰 수
 * - refillDuration: 충전 주기 (이 기간 동안 refillTokens 만큼 선형 충전)
 *
 * 실무 포인트
 * - record는 불변이라 멀티스레드 환경에서 안전하게 공유 가능
 * - 정책 계산은 RateLimitPolicy가 담당하고, limiter는 rule을 그대로 소비하는 구조
 */
public record RateLimitRule(
        String id,
        boolean enabled,
        long capacity,
        long refillTokens,
        Duration refillDuration
) {
    /**
     * disabled
     * - 전역 RateLimit이 비활성화된 경우(또는 예외적으로 제외할 경우) 사용
     *
     * 동작의도
     * - enabled=false 로 처리 계층에서 "무제한 통과"로 해석하도록 유도
     * - capacity/refill은 의미가 없지만 record 생성 제약을 위해 최소값을 넣음
     */
    public static RateLimitRule disabled() {
        return new RateLimitRule("disabled", false, 1L, 1L, Duration.ofDays(1));
    }
}
