package pnu.busan.walker.auth.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import pnu.busan.walker.auth.jwt.RotatingJwtDecoder;
import pnu.busan.walker.common.security.csrf.CsrfDoubleSubmitFilter;
import pnu.busan.walker.common.security.csrf.CsrfProperties;
import pnu.busan.walker.common.security.ratelimit.RateLimitFilter;
import pnu.busan.walker.common.security.ratelimit.RateLimitProperties;

/**
 * Spring Security 설정
 *
 * 핵심 목표
 * 1) 인증 실패/권한 거부 응답을 "ApiError(JSON)"로 표준화 (401/403)
 * 2) Rate Limit(429) / CSRF(Double Submit Cookie, 403) 필터를 Security Filter Chain에서만 관리
 *
 * 설계 포인트
 * - SessionCreationPolicy.STATELESS: 서버는 세션 저장소를 두지 않고 요청마다 JWT를 검증
 * - RefreshToken은 HttpOnly 쿠키로만 전달(브라우저 자동 첨부) -> 상태 변경(refresh/logout)은 CSRF 필수
 */
@Configuration
@EnableConfigurationProperties({
		JwtProperties.class,
		RateLimitProperties.class,
		CsrfProperties.class
})
@EnableMethodSecurity
public class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(
			HttpSecurity http,
			JwtDecoder jwtDecoder,
			BearerTokenResolver bearerTokenResolver,
			RateLimitFilter rateLimitFilter,
			CsrfDoubleSubmitFilter csrfDoubleSubmitFilter,
			CurrentUserJwtAuthenticationConverter currentUserJwtAuthenticationConverter,
			RestAuthenticationEntryPoint restAuthenticationEntryPoint,
			RestAccessDeniedHandler restAccessDeniedHandler
	) throws Exception {

		http
				/*
				  Spring Security 기본 CSRF(세션 기반)는 비활성화
				  - 본 프로젝트는 SPA + RefreshToken(HttpOnly 쿠키) 조합이므로
				    Double Submit Cookie 필터(CsrfDoubleSubmitFilter)로 보호 대상을 한정
				 */
				.csrf(AbstractHttpConfigurer::disable)

				/*
				  CORS
				  - WebConfig(WebMvcConfigurer)에서 allowedOrigins / allowCredentials / exposedHeaders를 통제
				 */
				.cors(Customizer.withDefaults())

				/*
				  세션 미사용(Stateless)
				  - 서버는 SecurityContext를 세션에 저장하지 않고 요청마다 JWT를 검증
				 */
				.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

				/*
				  인증/인가 실패 응답 표준화
				  - Spring Security 내부에서 발생하는 401/403을 ApiError(JSON)로 통일
				 */
				.exceptionHandling(exceptionHandling -> exceptionHandling
						.authenticationEntryPoint(restAuthenticationEntryPoint)
						.accessDeniedHandler(restAccessDeniedHandler)
				)

				.authorizeHttpRequests(auth -> auth
						.requestMatchers(
								"/actuator/health", "/actuator/info",
								"/docs/**",
								"/api/v1/auth/**"
						).permitAll()

						/* 업로드 이미지 정적 리소스(public) */
						.requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()

						/* 관광지 조회(읽기) 공개 */
						.requestMatchers(HttpMethod.GET, "/api/v1/attractions/**").permitAll()

						/* 리뷰/댓글 읽기 공개 (실제 경로: /api/v1/attractions/{keyId}/reviews/**) */
						.requestMatchers(HttpMethod.GET, "/api/v1/attractions/*/reviews/**").permitAll()

						/* Preflight 요청은 전부 허용 */
						.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

						/* 그 외는 인증 필요 */
						.anyRequest().authenticated()
				)
				.oauth2ResourceServer(oauth -> oauth
						.bearerTokenResolver(bearerTokenResolver)
						.jwt(jwt -> jwt
								.decoder(jwtDecoder)
								.jwtAuthenticationConverter(currentUserJwtAuthenticationConverter)
						)
				);

		/*
		  필터 체인 삽입 순서(중요)
		  1) RateLimitFilter: 가장 앞단에서 과도 트래픽 차단(비용 절감/안정성)
		  2) CsrfDoubleSubmitFilter: refresh/logout 같은 "쿠키 기반 상태 변경"을 보호
		  3) BearerTokenAuthenticationFilter: JWT 인증 처리
		 */
		http.addFilterBefore(rateLimitFilter, BearerTokenAuthenticationFilter.class);
		http.addFilterAfter(csrfDoubleSubmitFilter, RateLimitFilter.class);

		return http.build();
	}

	/**
	 * 핵심: 공용 경로에는 Authorization(Bearer)를 "해석하지 않음"
	 * - 만료/무효 토큰이 헤더에 붙어 있어도 GET /attractions(목록·상세)가 401로 죽지 않게 함
	 * - GET /attractions/{keyId}/reviews/... (리뷰·댓글)은 토큰을 해석해 로그인 시 viewerId로 "내 숨긴 댓글" 노출
	 */
	@Bean
	BearerTokenResolver bearerTokenResolver() {
		DefaultBearerTokenResolver delegate = new DefaultBearerTokenResolver();
		delegate.setAllowUriQueryParameter(false);

		return (HttpServletRequest request) -> {
			String uri = request.getRequestURI();
			String method = request.getMethod();

			if (uri == null) return delegate.resolve(request);

			// 공용/문서/헬스/인증 경로는 토큰을 해석하지 않음
			if (uri.startsWith("/api/v1/auth")) return null;
			if (uri.startsWith("/docs/")) return null;
			if (uri.startsWith("/actuator/")) return null;

			// 관광지 목록·상세(GET)만 토큰 미해석. /reviews/ 포함 경로는 항상 토큰 해석(내 숨긴 댓글 노출)
			if ("GET".equalsIgnoreCase(method) && uri.startsWith("/api/v1/attractions")) {
				if (uri.contains("/reviews/")) {
					return delegate.resolve(request);
				}
				if (uri.equals("/api/v1/attractions") || uri.matches("/api/v1/attractions/[^/]+$")) {
					return null;
				}
			}

			// OPTIONS는 어차피 허용
			if ("OPTIONS".equalsIgnoreCase(method)) return null;

			return delegate.resolve(request);
		};
	}

	/**
	 * 비밀번호 인코더 설정
	 * - BCrypt 강도는 운영 정책에 맞춰 조정
	 */
	@Bean
	public PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder(10);
	}

	/**
	 * kid 회전 대응 커스텀 Decoder
	 * - 요청 토큰의 kid에 따라 검증 키를 선택
	 */
	@Bean
	JwtDecoder jwtDecoder(JwtProperties props) {
		return new RotatingJwtDecoder(props);
	}
	
}
