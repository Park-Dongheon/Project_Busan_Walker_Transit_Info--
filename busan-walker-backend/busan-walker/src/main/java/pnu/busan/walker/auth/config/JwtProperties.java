package pnu.busan.walker.auth.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Map;

/**
 * JWT 설정 (HMAC/HS256 + kid 회전)
 *
 * 구성 목적
 * - Access/Refresh 토큰의 TTL(유효기간)과 표준 클레임(iss/aud)을 한 곳에서 관리
 * - kid(키 식별자)를 통해 다중 키를 운용하며, activeKid가 "현재 서명에 사용할 키"를 의미
 *
 * 프로퍼티 예시 (application-*.properties)
 * - app.security.jwt.active-kid=main-v2
 * - app.security.jwt.keys.main-v1=...base64url...
 * - app.security.jwt.keys.main-v2=...base64url...
 * - app.security.jwt.issuer=busan-walker
 * - app.security.jwt.audience=web
 * - app.security.jwt.access-ttl=30m
 * - app.security.jwt.refresh-ttl=14d
 */
@Data
@ConfigurationProperties(prefix = "app.security.jwt")
public class JwtProperties {

	/**
	 * 현재 서명(Signing)에 사용할 kid
	 * - JwtIssuer가 Access Token을 발급할 때 헤더의 kid로 설정
	 */
	private String activeKid;

	/**
	 * kid -> base64url secret (권장: 256bit 이상)
	 * - RotatingJwtDecoder는 요청 토큰 헤더의 kid로 이 Map에서 검증 키를 선택
	 */
	private Map<String, String> keys;

	/**
	 * 표준 클레임: issuer(iss)
	 * - Resource Server 검증 시 "발급자" 일치 여부를 확인
	 */
	private String issuer = "busan-walker";

	/**
	 * 표준 클레임: audience(aud)
	 * - Resource Server 검증 시 "대상 서비스" 일치 여부를 확인
	 */
	private String audience = "web";

	/**
	 * Access Token TTL (기본 15분)
	 * - 노출 가능성이 상대적으로 높은 토큰이므로 짧게 유지
	 */
	private Duration accessTtl = Duration.ofMinutes(15);

	/**
	 * Refresh Token TTL (기본 14일)
	 * - 장기 세션 유지용
	 * - 서버 저장소에서 회전/재사용 탐지로 안전성 확보
	 */
	private Duration refreshTtl = Duration.ofDays(14);

}
