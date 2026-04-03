package pnu.busan.walker.common.security.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.security.Principal;

/**
 * DefaultRateLimitKeyResolver
 *
 * 기본 키 전략(실무에서 흔한 우선순위)
 * 1) 인증 사용자 식별자(있다면) → user:{id}
 * 2) 없으면 클라이언트 IP → ip:{ip}
 *
 * 기대 효과
 * - 로그인 이후에는 사용자 단위로 공정한 제한
 * - 익명 구간(로그인/검색 등)은 IP 단위로 기본 방어
 *
 * 주의
 * - 프록시(Nginx/CloudFront 등) 뒤에서는 X-Forwarded-For 처리가 필요
 * - X-Forwarded-For는 스푸핑 가능하므로 “신뢰할 수 있는 프록시 뒤에서만” 사용해야 함
 */
@Component
public class DefaultRateLimitKeyResolver implements RateLimitKeyResolver {

    @Override
    public String resolve(HttpServletRequest request, RateLimitRule rule) {
        String userKey = resolveUserKey(request);
        if (userKey != null) return userKey;

        String ip = extractClientIp(request);
        return "ip:" + ip;
    }

    /**
     * resolveUserKey
     * - Spring Security를 쓰는 경우, Principal 또는 Authentication에서 사용자 정보를 얻을 수 있음
     * - 현재 프로젝트에서 "userId를 어디에 담는지"에 따라 구현 방식이 달라질 수 있으므로
     *   가장 안전한 기본 구현은 Principal#getName() 기반으로 둠
     *
     * 실무에서는 보통
     * - principal name = userId(또는 username/email)
     * - 또는 JWT claim(sub, userId)에서 추출
     * 과 같은 방식으로 사용자 식별자를 구성
     */
    private String resolveUserKey(HttpServletRequest request) {
        Principal principal = request.getUserPrincipal();
        if (principal == null) return null;

        String name = principal.getName();
        if (name == null || name.isBlank()) return null;

        return "user:" + name;
    }

    /**
     * extractClientIp
     * - X-Forwarded-For의 첫 번째 값을 클라이언트 IP로 취급하는 것이 일반적
     * - 헤더가 없으면 request.getRemoteAddr() 사용
     */
    private String extractClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String first = xff.split(",")[0].trim();
            if (!first.isBlank()) return first;
        }

        String remote = request.getRemoteAddr();
        return (remote == null || remote.isBlank()) ? "unknown" : remote;
    }

}
