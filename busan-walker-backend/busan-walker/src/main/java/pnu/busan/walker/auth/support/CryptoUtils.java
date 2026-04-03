package pnu.busan.walker.auth.support;

import lombok.SneakyThrows;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 보안 유틸
 *
 * 제공 기능
 * - 랜덤 토큰 생성(Base64URL, padding 없음)
 * - SHA-256 해시(바이너리 32바이트)
 * - Base64URL 토큰 원문을 SHA-256 해시로 변환
 *
 * 사용 패턴
 * - 원문 토큰(raw)은 외부로만 전달(메일 링크/응답)
 * - DB에는 sha256OfB64Url(raw) 결과만 저장
 */
public final class CryptoUtils {

	private static final SecureRandom RNG = new SecureRandom();

	/**
	 * 32바이트(256비트) 랜덤 -> Base64URL 문자열(패딩 없음)
	 * - Refresh Token 원문 / 이메일 인증 토큰 원문 등의 후보
	 */
	public static String randomB64Url32() {
		byte[] b = new byte[32];
		RNG.nextBytes(b);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
	}
	
	/* SHA-256 해시(바이너리 32바이트) */
	@SneakyThrows
	public static byte[] sha256(byte[] input) {
		MessageDigest md = MessageDigest.getInstance("SHA-256");
		return md.digest(input);
	}

	/**
	 * Base64URL 문자열을 디코딩한 원시 바이트를 SHA-256 해시로 변환
	 * - DB의 token_hash(BINARY(32))와 직접 비교 가능한 형태
	 */
	public static byte[] sha256OfB64Url132OrNull(String base64Url) {
		if (base64Url == null || base64Url.isBlank()) return null;

		/* 입력 길이 상한(DoS 방어). 32바이트 raw의 Base64URL은 보통 43자 내외 */
		if (base64Url.length() > 128) return null;

		try {
			byte[] raw = Base64.getUrlDecoder().decode(base64Url);
			if (raw.length != 32) return null;
			return sha256(raw);
		} catch (IllegalArgumentException e) {
			return null;
		}
	}
	
}
