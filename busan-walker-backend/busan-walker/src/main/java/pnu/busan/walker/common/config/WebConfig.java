package pnu.busan.walker.common.config;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import pnu.busan.walker.common.security.csrf.CsrfProperties;
import pnu.busan.walker.common.web.TraceIdFilter;
import pnu.busan.walker.file.config.FileStorageProperties;

import java.time.Clock;
import java.nio.file.Paths;
import java.util.List;

/**
 * Web MVC 공통 설정 (CORS, 필터 등록 등)
 *
 * 핵심 목적
 * - CORS: 프론트와 분리된 Origin(개발/운영)에서 API 호출 가능하도록 허용
 * - allowCredentials(true): refreshToken(HttpOnly 쿠키)을 브라우저가 요청에 포함할 수 있도록 허용
 * - exposedHeaders: 브라우저 JS가 읽어야 하는 헤더(TraceId / RateLimit / CSRF)를 노출
 *
 * 실무 포인트
 * - allowCredentials(true) 사용 시 allowedOrigins에 "*"는 불가 → 반드시 명시 Origin 필요
 */
@Configuration
@RequiredArgsConstructor
@EnableConfigurationProperties({
		CsrfProperties.class
})
public class WebConfig implements WebMvcConfigurer {

	/**
     * CORS 허용 Origin 목록
     * - 환경 변수/설정 파일에서 주입
     *
     * 예:
     * - app.cors.allowed-origins[0]=<a href="http://localhost:5173">...</a>
     * - app.cors.allowed-origins[1]=<a href="https://domain.com">...</a>
     *
     * fallback:
     * - app.frontend-base-url 없으면 <a href="http://localhost:5173">...</a>
     */
	@Value("${app.cors.allowed-origins:${app.frontend-base-url:http://localhost:5173}}")
	private String[] allowedOrigins;

	private final CsrfProperties csrfProperties;
	private final FileStorageProperties fileStorageProperties;

	/**
	 * CORS 설정
	 *
	 * 목적
	 * - SPA(프론트)에서 API 호출 시 Origin 정책을 안전하게 제어
	 * - 쿠키 기반 요청(refreshToken 등)을 위해 allowCredentials(true) 활성화
	 *
	 * 노출 헤더(exposedHeaders)
	 * - 클라이언트가 JS에서 읽을 수 있도록 노출
	 * - RateLimit 응답 헤더/TraceId/CSRF 헤더 등을 노출
	 */
	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/**")
				.allowedOrigins(allowedOrigins)
				.allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
				/*
				  allowedHeaders
				  - 브라우저가 실제 요청에서 전송할 수 있도록 허용할 헤더 목록
				  - CSRF 방어용 헤더도 명시적으로 허용
				 */
				.allowedHeaders(
						"Authorization",
						"Content-Type",
						"X-Trace-Id",
						csrfProperties.getHeaderName()
				)
				/*
				  exposedHeaders
				  - 브라우저 JS가 읽을 수 있도록 노출할 헤더 목록
				  - Retry-After는 429 처리 시 UX(재시도 안내)에 유용
				 */
				.exposedHeaders(
						"X-Trace-Id",
						"X-RateLimit-Limit",
						"X-RateLimit-Remaining",
						"Retry-After",
						csrfProperties.getHeaderName()
				)
				.allowCredentials(true)
				.maxAge(3600);
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		String publicPathPrefix = normalizePublicPathPrefix(fileStorageProperties.getPublicPathPrefix());
		String resourcePattern = publicPathPrefix + "/**";
		String resourceLocation = Paths.get(fileStorageProperties.getLocalBaseDir())
				.toAbsolutePath()
				.normalize()
				.toUri()
				.toString();

		registry.addResourceHandler(resourcePattern)
				.addResourceLocations(resourceLocation)
				.setCachePeriod(31536000);
	}

	/**
	 * 서버 기준 시각(Clock) Bean
	 *
	 * 목적
	 * - Instant.now() 직접 호출을 분리하여 테스트/정책 변경에 유리
	 * - 운영 정책에 맞춰 타임존을 통제
	 */
	@Bean
	public Clock systemClock() {
		return Clock.systemUTC();
	}

	/**
	 * TraceIdFilter Bean 등록
	 *
	 * 목적
	 * - FilterRegistrationBean이 TraceIdFilter를 주입받을 수 있도록 “Spring Bean”으로 등록
	 * - 구성 클래스(WebConfig)가 필터 생성 책임을 명확히 가짐
	 */
	@Bean
	public TraceIdFilter traceIdFilter() {
		return new TraceIdFilter();
	}

	/**
	 * TraceId 필터 등록
	 * - 요청 단위로 traceId를 부여하여 로그/에러 응답에서 상호 추적 가능
	 *
	 * 주의(중복 실행 방지)
	 * - 보안 필터(RateLimit/CSRF)는 SecurityConfig(SecurityFilterChain)에서만 관리하여
	 *   서블릿 필터 체인과의 중복 실행/순서 꼬임을 방지
	 */
	@Bean
	public FilterRegistrationBean<TraceIdFilter> traceIdFilterRegistration(TraceIdFilter filter) {
		FilterRegistrationBean<TraceIdFilter> bean = new FilterRegistrationBean<>();
		bean.setFilter(filter);
		bean.setOrder(0);
		bean.setUrlPatterns(List.of("/*"));
		return bean;
	}

	private String normalizePublicPathPrefix(String raw) {
		String prefix = (raw == null || raw.isBlank()) ? "/uploads" : raw.trim();
		if (!prefix.startsWith("/")) prefix = "/" + prefix;
		while (prefix.endsWith("/")) {
			prefix = prefix.substring(0, prefix.length() - 1);
		}
		return prefix;
	}

}
