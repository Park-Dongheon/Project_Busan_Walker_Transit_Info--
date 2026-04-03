package pnu.busan.walker.auth.web;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

/**
 * RefreshToken을 HttpOnly 쿠키 발급/삭제 전용 컴포넌트
 *
 * 핵심 동작
 * - issue(): refreshToken 원문을 HttpOnly 쿠키로 저장하며, 만료는 refreshExpiresAtMs 기준으로 계산
 * - clear(): 쿠키를 Max-Age=0으로 즉시 만료
 *
 * 보안/운영 포인트
 * - HttpOnly: JS 접근 차단으로 XSS에 의한 탈취 리스크를 낮춤
 * - Path 제한: /api/v1/auth 로 좁혀 불필요한 요청에 쿠키가 포함되는 것을 줄임
 * - SameSite: 기본 Lax(일반적인 폼/링크 내비게이션에 호환), OAuth 콜백까지 고려
 */
@Component
@RequiredArgsConstructor
public class RefreshTokenCookieWriter {

    public static final String DEFAULT_COOKIE_NAME = "bh_rt";

    private final Clock clock;

    @Value("${app.auth.refresh-cookie.name:" + DEFAULT_COOKIE_NAME + "}")
    private String cookieName;

    @Value("${app.auth.refresh-cookie.path:/api/v1/auth}")
    private String cookiePath;

    @Value("${app.auth.refresh-cookie.domain:}")
    private String cookieDomain;

    @Value("${app.auth.refresh-cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${app.auth.refresh-cookie.same-site:Lax}")
    private String cookieSameSite;

    public String cookieName() {
        return cookieName;
    }

    /**
     * RefreshToken 발급 쿠키 생성
     * - maxAge는 refreshExpiresAtMs(서버 기준 절대시각)에서 현재 시각을 빼서 계산
     * - refreshExpiresAtMs가 이미 지났다면 0으로 처리되어 쿠키가 즉시 만료
     */
    public ResponseCookie issue(String refreshTokenRaw, long refreshExpiresAtMs) {
        long nowMs = clock.millis();
        long ttlMs = Math.max(0L, refreshExpiresAtMs - nowMs);

        ResponseCookie.ResponseCookieBuilder cookieBuilder = ResponseCookie.from(cookieName, refreshTokenRaw)
                .httpOnly(true)
                .secure(cookieSecure)
                .path(cookiePath)
                .sameSite(cookieSameSite)
                .maxAge(Duration.ofMillis(ttlMs));

        /* domain은 빈 문자열일 수 있으므로, 값이 있을 때만 설정 */
        if (cookieDomain != null && !cookieDomain.isBlank()) {
            cookieBuilder.domain(cookieDomain);
        }

        return cookieBuilder.build();
    }

    /**
     * RefreshToken 삭제 쿠키 생성
     * - maxAge=0으로 브라우저에서 즉시 삭제 처리
     */
    public ResponseCookie clear() {
        ResponseCookie.ResponseCookieBuilder cookieBuilder = ResponseCookie.from(cookieName, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .path(cookiePath)
                .sameSite(cookieSameSite)
                .maxAge(Duration.ZERO);

        if (cookieDomain != null && !cookieDomain.isBlank()) {
            cookieBuilder.domain(cookieDomain);
        }

        return cookieBuilder.build();
    }

}
