package pnu.busan.walker.common.security.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;

/**
 * 요청 -> RateLimitRule 매핑 정책
 *
 * 실무 포인트
 * - 인증(auth) 엔드포인트는 공격(브루트포스, refresh 폭주)의 표적이 되기 쉬움 → 더 강한 제한 적용
 * - 나머지는 서비스 성격에 맞춘 기본 제한 적용
 */
@Component
@RequiredArgsConstructor
public class RateLimitPolicy {

    private final RateLimitProperties props;

    private final AntPathMatcher matcher = new AntPathMatcher();

    public boolean isEnabled() {
        return props.isEnabled();
    }

    public RateLimitRule resolve(HttpServletRequest request) {
        if (!props.isEnabled()) return RateLimitRule.disabled();

        String uri = request.getRequestURI();
        boolean isAuth = props.getAuthPaths().stream().anyMatch(path -> matcher.match(path, uri));

        if (isAuth) {
            return new RateLimitRule(
                    "auth",
                    true,
                    props.getAuthCapacity(),
                    props.getAuthRefillTokens(),
                    props.getAuthRefillDuration()
            );
        }

        return new RateLimitRule(
                "default",
                true,
                props.getDefaultCapacity(),
                props.getDefaultRefillTokens(),
                props.getDefaultrefillDuration()
        );
    }

}
