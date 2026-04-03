package pnu.busan.walker.common.security.csrf;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

/**
 * CSRF(Double Submit Cookie) 설정
 *
 * Double Submit Cookie 개념
 * - 서버가 CSRF 토큰을 "JS로 읽을 수 있는 쿠키"로 발급
 * - 프론트는 그 값을 읽어 "헤더(X-CSRF-Token)"로 다시 전송
 * - 서버는 "쿠키 값 == 헤더 값" 일치 여부로 CSRF 여부를 판단
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.security.csrf")
public class CsrfProperties {

    /* 기능 on/off: 개발/테스트에서 일시적으로 끌 수 있으나, 운영은 true */
    private boolean enabled = true;

    /* CSRF 토큰을 담는 쿠키 이름 (JS에서 읽어 헤더로 올려야 하므로 HttpOnly=false) */
    @NotBlank
    private String cookieName = "bh_csrf";

    /* 클라이언트가 CSRF 토큰을 실어 보내는 헤더 이름 */
    @NotBlank
    private String headerName = "X-CSRF-Token";

    /**
     * CSRF 쿠키 Path
     * - SPA에서 document.cookie로 CSRF 쿠키를 읽어 헤더에 싣는 패턴을 쓰는 경우,
     *   쿠키 Path를 "/api/v1/auth"처럼 좁히면 라우트가 "/"인 화면에서 document.cookie에 노출되지 않아
     *   refresh 같은 부트스트랩 요청에서 CSRF 헤더를 못 만들어 403이 발생할 수 있음
     *
     * - 따라서 Path는 "/"로 두고, 실제 보호 범위는 CsrfDoubleSubmitFilter의 protectedPaths로 제한
     */
    @NotBlank
    private String path = "/";

    /**
     * domain은 운영에서만 필요
     */
    private String domain = "";

    /* Secure 쿠키 여부: local(http) - false, 운영(https) - true */
    private boolean secure = false;

    /**
     * CSRF 쿠키 SameSite 정책
     * - Lax: 일반적인 UX/안전성 균형
     * - Strict: 더 엄격하지만 일부 흐름에 불편 가능
     */
    @NotBlank
    private String sameSite = "Lax";

    /* 0이면 세션 쿠키(브라우저 종료 시 만료) */
    private long maxAgeSec = 0;

    /* CSRF 토큰 TTL */
    private Duration ttl = Duration.ofHours(8);

    /**
     * CSRF 검사를 적용할 API 경로 목록
     * - 쿠키 기반 상태 변경 엔드포인트(refresh/logout)만 보호
     */
    private List<String> protectedPaths = List.of(
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout"
    );

}
