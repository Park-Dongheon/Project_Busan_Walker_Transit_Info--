package pnu.busan.walker.auth.domain;

/**
 * 이메일 인증 토큰 목적 구분
 *
 * 데이터 모델(email_verifications)
 * - purpose 컬럼(ENUM/STRING)을 통해 "가입 인증"과 "이메일 변경 인증" 등을 동일 테이블에서 분리 관리
 *
 * 장점
 * - 서로 다른 목적의 인증 링크가 섞여 들어와도 검증/재발송 정책을 안전하게 분리 가능
 */
public enum EmailVerificationPurpose {
    SIGNUP,
    CHANGE_EMAIL,
}
