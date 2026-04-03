package pnu.busan.walker.common.security.csrf;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * CSRF 토큰을 "쿠키로 발급/삭제"하는 전용 컴포넌트
 *
 * 역할 분리
 * - Controller가 쿠키 스펙(SameSite/Secure/TTL/Path)을 직접 다루면 중복/실수 증가
 * - 쿠키 정책을 한 곳에서 통제하면 운영 중 정책 변경이 쉬움
 */
@Component
@RequiredArgsConstructor
public class CsrfTokenCookieWriter {

    private final CsrfProperties props;

    /**
     * CSRF 토큰 쿠키를 발급
     * - HttpOnly=false: 프론트에서 document.cookie로 읽어 헤더(X-CSRF-Token)에 실어야 하기 때문
     * - Path는 properties.path 기준 (SPA에서는 "/")
     */
    public ResponseCookie issue(String csrfToken) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(props.getCookieName(), csrfToken)
                .path(props.getPath())
                .httpOnly(false)
                .secure(props.isSecure())
                .sameSite(props.getSameSite());

        if (props.getDomain() != null && !props.getDomain().isBlank()) {
            builder.domain(props.getDomain());
        }

        if (props.getMaxAgeSec() > 0) {
            builder.maxAge(props.getMaxAgeSec());
        }

        return builder.build();
    }

    /**
     * CSRF 토큰 쿠키 삭제
     */
    public ResponseCookie clear() {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(props.getCookieName(), "")
                .path(props.getPath())
                .httpOnly(false)
                .secure(props.isSecure())
                .sameSite(props.getSameSite())
                .maxAge(0);

        if (props.getDomain() != null && !props.getDomain().isBlank()) {
            builder.domain(props.getDomain());
        }

        return builder.build();
    }

}
