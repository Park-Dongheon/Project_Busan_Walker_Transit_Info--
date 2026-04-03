package pnu.busan.walker.auth.domain;

/**
 * 소셜 로그인 제공자
 *
 * 데이터 모델(oauth_accounts.provider)
 * - ENUM('NAVER', 'KAKAO', 'GOOGLE', 'APPLE') 등의 문자열 값을 저장하고,
 * 	 애플리케이션에서는 EnumType.STRING으로 안전하게 매핑
 */
public enum OAuthProvider {
	NAVER, KAKAO, GOOGLE, APPLE
}
