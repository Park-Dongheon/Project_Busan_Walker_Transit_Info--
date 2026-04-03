package pnu.busan.walker.common.security.csrf;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.Base64;


/**
 * CSRF 토큰 생성 전용 컴포넌트
 *
 * 구현 의도
 * - 컨트롤러가 난수 생성/인코딩을 직접 다루지 않도록 역할 분리
 * - 토큰 길이/포맷을 한 곳에서 통제하여 정책 변경이 쉬움
 */
@Component
public class CsrfTokenService {

    private static final int TOKEN_BYTES = 32;

    private final SecureRandom secureRandom = new SecureRandom();
    private final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();

    /**
     * generateToken
     * - URL-safe 문자열로 CSRF 토큰을 생성
     * - 쿠키/헤더 모두에 안전하게 실리 수 있는 포맷
     */
    public String generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return encoder.encodeToString(bytes);
    }

}
