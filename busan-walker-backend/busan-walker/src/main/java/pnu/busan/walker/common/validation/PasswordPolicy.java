package pnu.busan.walker.common.validation;

/**
 * 비밀번호 입력 정책 상수(프론트와 동기화용)
 *
 * 정책:
 * - 길이: 8 ~ 100
 * - 허용 문자: 영문 대소문자/숫자/ASCII 특수문자
 * - 포함: 숫자 1개 이상, 영문 소문자 1개 이상, 영문 대문자 1개 이상, ASCII 특수문자 1개 이상
 *
 * 주의:
 * - Bean Validation @Pattern 은 "전체 문자열 matches"로 평가되므로
 *   "포함(contains)" 의미를 위해 정규식 앞뒤에 .* 를 붙인다.
 */
public final class PasswordPolicy {

    private PasswordPolicy() {
    }

    public static final int PASSWORD_MIN_LENGTH = 8;
    public static final int PASSWORD_MAX_LENGTH = 100;

    public static final String PASSWORD_LENGTH_MESSAGE = "비밀번호는 8자 이상 100자 이하여야 합니다.";
    public static final String PASSWORD_DIGIT_MESSAGE = "숫자를 최소 1개 포함해야 합니다.";
    public static final String PASSWORD_LOWERCASE_MESSAGE = "영문 소문자를 최소 1개 포함해야 합니다.";
    public static final String PASSWORD_UPPERCASE_MESSAGE = "영문 대문자를 최소 1개 포함해야 합니다.";
    public static final String PASSWORD_SPECIAL_ASCII_MESSAGE = "ASCII 특수문자를 최소 1개 포함해야 합니다.";
    public static final String PASSWORD_ALLOWED_SPECIAL_ASCII_SET = "!@#$%^&*()_+-=[]{};':\"\\\\|,.<>/?`~";
    public static final String PASSWORD_ALLOWED_CHARSET_MESSAGE =
            "비밀번호는 영문 대소문자, 숫자, 다음 특수문자만 사용할 수 있습니다: " + PASSWORD_ALLOWED_SPECIAL_ASCII_SET;

    public static final String PASSWORD_ALLOWED_CHARSET_REGEX = "^[A-Za-z0-9!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?`~]+$";
    public static final String PASSWORD_DIGIT_REGEX = ".*[0-9].*";
    public static final String PASSWORD_LOWERCASE_REGEX = ".*[a-z].*";
    public static final String PASSWORD_UPPERCASE_REGEX = ".*[A-Z].*";
    /*
     * ASCII 특수문자 포함 여부 검사.
     * - Java regex 문자클래스에서 [ 와 ] 를 리터럴로 쓰기 위해 각각 \[ \] 로 이스케이프한다.
     * - 역슬래시는 문자클래스 안에서도 리터럴 처리가 필요하므로 \\\\ 로 이스케이프한다.
     */
    public static final String PASSWORD_SPECIAL_ASCII_REGEX = ".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?`~].*";
}
