package pnu.busan.walker.common.security.ratelimit;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Rate Limit 정책 설정 바인딩
 *
 * 실무 포인트
 * - scale-out(서버 다중 인스턴스) 시 Redis 등 분산 저장소 기반으로 교체 필요
 * - 프로퍼티 이름은 오탈자 없이 "일관된 camelCase"로 유지해야 운영에서 실수가 줄어듬
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.security.ratelimit")
public class RateLimitProperties {

    private boolean enabled = true;

    /**
     * 일반 API 기본 제한(토큰/기간)
     */
    private long defaultCapacity = 200;
    private long defaultRefillTokens = 200;
    private Duration defaultrefillDuration = Duration.ofMinutes(1);

    /**
     * 인증 관련 엔드포인트 제한(브루트포스/자동화 공격 방어)
     * - 예: 20 req / 1분
     */
    private long authCapacity = 20;
    private long authRefillTokens = 20;
    private Duration authRefillDuration = Duration.ofMinutes(1);

    /**
     * 인증 경로 패턴
     * - /api/v1/auth/** 는 login/refresh/logout 등 공격 표적이 되기 쉬운 구간
     */
    private List<String> authPaths = new ArrayList<>(List.of(
            "/api/v1/auth/**"
    ));

    /**
     * In-memory 버킷 정리 정책(메모리 누수 완화)
     * - bucketTtl: "마지막 사용 이후" TTL이 지난 버킷 제거
     * - cleanupInterval: cleanup를 너무 자주 하지 않아 CPU 낭비를 방지
     */
    private Duration bucketTtl = Duration.ofHours(6);
    private Duration cleanupInterval = Duration.ofMinutes(5);

}
