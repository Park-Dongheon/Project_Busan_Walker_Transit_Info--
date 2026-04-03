package pnu.busan.walker.auth.jwt;

import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.util.Base64URL;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.*;
import pnu.busan.walker.auth.config.JwtProperties;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * kid 헤더로 키를 선택해 검증하는 Decoder (HMAC/HS256)
 *
 * 키 선택 규칙
 * - JWT 헤더의 kid 값을 추출
 * - properties.keys[kid]에 정의된 base64url secret으로 서명 검증
 *
 * 검증 정책
 * - issuer(iss) 검증: createDefaultWithIssuer
 * - audience(aud) 검증: aud가 String 또는 Collection 모두 허용
 *
 * 캐시 정책(중요)
 * - kid 단위로 NimbusJwtDecoder를 캐시하면 성능상 유리
 * - 단, 동일 kid의 secret 값이 변경될 수 있으므로 "kid + secret" 조합이 바뀌면 캐시를 갱신
 */
public class RotatingJwtDecoder implements JwtDecoder {
	
	private final JwtProperties props;

	/**
	 * kid -> (keyB64, decoder)
	 * - 동일 kid라도 keyB64가 바뀌면 decoder 재생성
	 */
	private final Map<String, CachedDecoder> cache = new ConcurrentHashMap<>();	// kid -> (keyB64, decoder)

	private record CachedDecoder(String keyB64, JwtDecoder decoder) {}

	public RotatingJwtDecoder(JwtProperties props) {
		this.props = props;
	}

	@Override
	public Jwt decode(String token) throws JwtException {
		String kid = JwtUtils.peekKid(token);
		if (kid == null) {
			throw new BadJwtException("Missing kid header");
		}
		
		String keyB64 = props.getKeys().get(kid);
		if (keyB64 == null) {
			throw new BadJwtException("Unknown kid: " + kid);
		}

		CachedDecoder cd = cache.compute(kid, (k, existing) -> {
			if (existing == null || !keyB64.equals(existing.keyB64)) {
				return new CachedDecoder(keyB64, buildDecoder(keyB64));
			}

			return existing;
		});
		
		return cd.decoder.decode(token);
	}

	private JwtDecoder buildDecoder(String keyB64) {
		SecretKey key = toHmacKey(keyB64);

		NimbusJwtDecoder d = NimbusJwtDecoder.withSecretKey(key).build();

		OAuth2TokenValidator<Jwt> withIssuer = JwtValidators.createDefaultWithIssuer(props.getIssuer());
		OAuth2TokenValidator<Jwt> withAudience = tokenAudValidator(props.getAudience());

		d.setJwtValidator(new DelegatingOAuth2TokenValidator<>(withIssuer, withAudience));
		return d;
	}
	
	private static SecretKey toHmacKey(String base64url) {
		byte[] key = Base64.getUrlDecoder().decode(base64url.getBytes(StandardCharsets.US_ASCII));
		return new SecretKeySpec(key, "HmacSHA256");
	}

	/**
	 * aud 클레임 검증기
	 * - aud가 문자열(단일) 또는 배열(JSON array) 모두 허용
	 */
	private static OAuth2TokenValidator<Jwt> tokenAudValidator(String requiredAudience) {
		return jwt -> {
			Object aud = jwt.getClaims().get(JwtClaimNames.AUD);
			boolean ok = false;

			if (aud instanceof String s) {
				ok = requiredAudience.equals(s);
			} else if (aud instanceof java.util.Collection<?> c) {
				ok = c.contains(requiredAudience);
			}
			
			return ok
					? OAuth2TokenValidatorResult.success()
					: OAuth2TokenValidatorResult.failure(
							new OAuth2Error("invalid_token", "Missing required audience: " + requiredAudience, null)
					);
		};
	}

}

/**
 * 내부 유틸: kid 헤더만 안전하게 추출
 *
 * 처리 방식
 * - JOSE Header(Base64URL) 구간만 디코딩하여 JSON에서 kid 값을 찾음
 * - 서명 검증은 JwtDecoder가 수행하므로, 여기서는 "kid 추출"만 담당
 */
final class JwtUtils {
	static String peekKid(String token) {
		try {
			/* JOSE Header(Base64URL)만 파싱: { "alg":"HS256","kid":"..." } */
			String[] parts = token.split("\\.");
			if (parts.length != 3) return null;
			
			JWSHeader header = JWSHeader.parse(Base64URL.from(parts[0]));
			return header.getKeyID();
		} catch (Exception e) {
			return null;
		}
	}
}
