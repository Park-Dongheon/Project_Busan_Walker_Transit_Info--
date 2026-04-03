package pnu.busan.walker.common.security.ratelimit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory Token Bucket Rate Limiter (single-node)
 *
 * 설계 의도
 * - 요청 경로에서 무거운 작업(전체 맵 순회/정리)을 매번 수행하면 tail latency가 증가
 * - 그래서 cleanup는 "주기적(Interval)"로만 수행하여 비용을 제한
 *
 * 한계
 * - scale-out 시 전역 제한이 깨짐(노드별 버킷 분리) → Redis 등 분산 스토리지로 교체 필요
 */
@Component
@RequiredArgsConstructor
public class TokenBucketRateLimiter {

    private final Clock clock;
    private final RateLimitProperties props;

    /**
     * key: ruleId::subjectKey
     * value: Bucket
     */
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * cleanup 수행 시각(밀리초)
     * - 멀티스레드 환경에서 중복 cleanup를 줄이기 위해 AtomicLong 사용
     */
    private final AtomicLong lastCleanupAtMs = new AtomicLong(0);

    /**
     * tryConsume
     * - rule + subjectKey(사용자ID/IP 등) 조합으로 버킷을 조회/생성
     * - 성공 시 1 토큰 소비
     */
    public RateLimitDecision tryConsume(RateLimitRule rule, String subjectKey) {
        if (rule == null || !rule.enabled()) {
            /* 실무에서는 보통 예외/방어 로직을 명확히 함 */
            return new RateLimitDecision(true, Long.MAX_VALUE, 0);
        }

        if (subjectKey == null || subjectKey.isBlank()) {
            /*
              subjetKey가 비면 "모든 사용자가 같은 버킷 공유" 사고가 남
              - 이 경우는 차라리 제한을 적용하지 않고 통과시키는 편이 장애를 줄임
             */
            return new RateLimitDecision(true, Long.MAX_VALUE, 0);
        }

        long nowMs = clock.millis();
        maybeCleanup(nowMs);

        String bucketKey = rule.id() + "::" + subjectKey;

        Bucket bucket = buckets.computeIfAbsent(bucketKey, k ->
                new Bucket(rule.capacity(), rule.refillTokens(), rule.refillDuration(), nowMs)

        );

        return bucket.tryConsume(nowMs);
    }

    /**
     * maybeCleanup
     * - cleanupInterval 주기마다 bucket에서 TTL 지난 버킷을 제거
     * - removeIf는 ConcurrentHashMap에서도 안전하게 동작(weakly consistent iteration)
     */
    private void maybeCleanup(long nowMs) {
        Duration cleanupInterval = props.getCleanupInterval();
        long intervalMs = Math.max(1L, cleanupInterval.toMillis());

        long last = lastCleanupAtMs.get();
        if (nowMs - last < intervalMs) return;

        if (!lastCleanupAtMs.compareAndSet(last, nowMs)) return;

        long ttlMs = Math.max(1L, props.getBucketTtl().toMillis());
        buckets.entrySet().removeIf(e -> nowMs - e.getValue().lastSeenAtMs > ttlMs);
    }

    /**
     * Bucket 내부 상태
     * - synchronized로 상태(tokens/lastRefillAtMs) 보호
     * - cleanup 스레드(요청 스레드)기 lastSeenAtMs를 락 없이 읽으므로 volatile로 가시성 보장
     */
    private static final class Bucket {

        private final long capacity;
        private final long refillTokens;
        private final long refillDurationMs;

        private long lastRefillAtMs;

        /* cleanup가 읽기 때문에 volatile(가시성 보장) */
        private volatile long lastSeenAtMs;

        /* fractional token 지원(선형 충전) */
        private double tokens;

        /**
         * Bucket 생성자
         *
         * 파라미터 의미
         * - capacity: 버킷 최대 토큰 수
         * - refillTokens: refillDuration 동안 충전될 토큰 수
         * - refillDuration: 충전 주기(Duration). null이면 1ms로 방어 처리
         * - nowMs: 버킷 생성 시각(밀리초)
         */
        private Bucket(long capacity, long refillTokens, Duration refillDuration, long nowMs) {
            this.capacity = Math.max(1L, capacity);
            this.refillTokens = Math.max(1L, refillTokens);

            long durationMs = (refillDuration == null) ? 1L : refillDuration.toMillis();
            this.refillDurationMs = Math.max(1L, durationMs);

            /*
              초기 버킷 토큰 전략
              - "처음 생성 시 꽉 찬 버킷"이 일반적
              - 최초 진입 사용자에게 429가 바로 뜨는 UX를 방지
             */
            this.tokens = this.capacity;
            this.lastRefillAtMs = nowMs;
            this.lastSeenAtMs = nowMs;
        }

        synchronized RateLimitDecision tryConsume(long nowMs) {
            lastSeenAtMs = nowMs;

            refill(nowMs);

            if (tokens >= 1.0d) {
                tokens -= 1.0;
                long remaining = (long) Math.floor(tokens);
                return new RateLimitDecision(true, remaining, 0);
            }

            long retryAfterSec = calcRetryAfterSeconds();
            return new RateLimitDecision(false, 0, retryAfterSec);
        }

        private void refill(long nowMs) {
            long elapsedMs = nowMs - lastRefillAtMs;
            if (elapsedMs <= 0) return;     /* 시간 역행/동일 시각 방어 */

            double ratePerMs = (double) refillTokens / (double) refillDurationMs;
            double refillAmount = elapsedMs * ratePerMs;

            if (refillAmount <= 0) return;

            tokens = Math.min(capacity, tokens + refillAmount);
            lastRefillAtMs = nowMs;
        }

        private long calcRetryAfterSeconds() {
            double missing = 1.0d - tokens;
            if (missing <= 0) return 0;

            double ratePerMs = (double) refillTokens / (double) refillDurationMs;
            if (ratePerMs <= 0) return 1;

            double ms = missing / ratePerMs;
            long sec = (long) Math.ceil(ms / 1000.0d);
            return Math.max(1, sec);
        }

    }

}
