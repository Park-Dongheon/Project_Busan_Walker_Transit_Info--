package pnu.busan.walker.auth.jwt;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import pnu.busan.walker.auth.config.JwtProperties;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

/**
 * HS256 JWT 발급기 (kid 헤더 포함)
 *
 * 발급 규칙
 * - 헤더: alg=HS256, typ=JWT, kid=activeKid
 * - 표준 클레임: iss, aud, iat, exp, sub
 * - 커스텀 클레임: email, role
 *
 * 키 선택
 * - JwtProperties.activeKid로 현재 signing 키를 선택
 * - keys[activeKid]가 없으면 설정 오류로 간주(조기 실패)
 */
@Component
@RequiredArgsConstructor
public class JwtIssuer {
	
	private final JwtProperties props;
	private final Clock clock;
	
	public String issueAccessToken(long userId, String email, String role) {
		Instant now = Instant.now(clock);
		Instant exp = now.plus(props.getAccessTtl());
		
		String kid = props.getActiveKid();
		String b64 = props.getKeys().get(kid);
		if (b64 == null) {
			/* 잘못된 설정 조기 탐지 */
			throw new IllegalStateException("Active kid not found: " + kid);
		}
		SecretKey key = toHmacKey(b64);
		
		try {
			JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.HS256)
					.keyID(kid)
					.type(JOSEObjectType.JWT)
					.build();
			
			JWTClaimsSet claims = new JWTClaimsSet.Builder()
					.issuer(props.getIssuer())
					.audience(props.getAudience())
					.issueTime(Date.from(now))
					.expirationTime(Date.from(exp))
					.subject(Long.toString(userId))
					.claim("email", email)
					.claim("role", role)		// "ADMIN" / "MEMBER"
					.build();
			
			JWSObject jws = new JWSObject(header, new Payload(claims.toJSONObject()));
			jws.sign(new MACSigner(key));
			
			return jws.serialize();
		} catch (JOSEException e) {
			throw new IllegalStateException("JWT signing failed", e);
		}
	}
	
	private static SecretKey toHmacKey(String base64url) {
		byte[] key = Base64.getUrlDecoder().decode(base64url.getBytes(StandardCharsets.US_ASCII));
		return new SecretKeySpec(key, "HmacSHA256");
	}

}
