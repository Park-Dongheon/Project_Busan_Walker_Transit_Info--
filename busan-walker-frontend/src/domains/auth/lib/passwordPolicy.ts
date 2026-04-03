// src/domains/auth/lib/passwordPolicy.ts

import { z } from "zod";

/**
 * passwordPolicy (Client-side Password Validation SSOT)
 *
 * 역할/목적:
 * - 회원가입/비밀번호 변경/재설정 등 "비밀번호 입력"이 필요한 모든 화면에서
 *   동일한 검증 규칙과 안내 메시지를 재사용하기 위한 단일 출처(SSOT)
 *
 * 정책(클라이언트-서버 책임 분리):
 * - 클라이언트 검증: UX를 위한 1차 방어선
 *   → 입력 즉시 피드백, 불필요한 서버 왕복 감소
 * - 서버 검증: 최종 정책 강제(저장 거부/차단)
 *   → 클라이언트는 우회/조작 가능하므로 신뢰할 수 없음, 보안 정책의 단일 기준은 서버
 *
 * 포인트:
 * - "정책 값(길이)"과 "정책 문구(안내/에러)"를 모듈 내부에서 고정하면 화면마다 규칙/문구가 달라지는 품질 문제 방지 가능
 */
export const PASSWORD_MIN_LENGTH = 8 as const
export const PASSWORD_MAX_LENGTH = 100 as const

/**
 * PASSWORD_ALLOWED_CHAR_REGEX (Allowlist)
 *
 * 역할/목적:
 * - 비밀번호에 허용되는 문자 집합을 "허용 목록(allowlist)" 방식으로 제한
 *
 * 정책:
 * - 허용: 영문 대소문자(A-Z, a-z) + 숫자(0-9) + 지정된 ASCII 특수문자
 * - 불허: 공백, 한글, 이모지, 전각문자 등 ASCII 외 문자
 *
 * 포인트:
 * - blacklist는 예외 케이스가 계속 늘어나 예측 가능성이 떨어짐
 * - allowlist는 파서/인코딩/정규화(유니코드) 관련 예외를 줄여, 정책을 "고정된 규칙"으로 유지하기 유리
 *
 * 주의(국제화/사용성):
 * - 국제 사용자/IME 입력/이모지 사용 요구가 있는 서비스라면 정책 재검토 필요
 * - 정책 변경 시, 서버/클라이언트/안내 문구를 동시에 동기화
 */
const PASSWORD_ALLOWED_CHAR_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]+$/

/**
 * PASSWORD_SPECIAL_CHAR_REGEX
 *
 * 역할/목적:
 * - "특수문자 포함(최소 1개)" 요건을 검사하기 위한 패턴
 *
 * 동작:
 * - 문자열에 지정된 ASCII 특수문자 집합 중 1개 이상이 포함되면 매칭
 *
 * 일관성 정책:
 * - 특수문자 집합은 반드시 PASSWORD_ALLOWED_CHAR_REGEX의 허용 집합과 일치
 *   - 허용되지 않는 문자를 "특수문자 포함 요건"이 요구하면 UX가 모순
 *   - 반대로 허용 집합에는 있으나 요건 집합에는 없으면, 사용자 입장에서 "특수문자 넣었는데 왜 안 되지?" 의문 발생
 */
const PASSWORD_SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/

/**
 * PASSWORD_ALLOWED_SPECIAL_CHAR_SET
 *
 * 역할/목적:
 * - 사용자 안내 메시지에 "허용되는 특수문자 목록"을 명시하기 위한 표시 문자열
 *
 * 주의:
 * - 문자열은 "UI 표시 목적"이며, 실제 판정은 정규식이 담당
 * - 표시 문자열/정규식이 불일치하면 정책 안내가 거짓이 되므로 항상 함께 관리
 */
const PASSWORD_ALLOWED_SPECIAL_CHAR_SET = "!@#$%^&*()_+-=[]{};':\"\\\\|,.<>/?`~"

const PASSWORD_ALLOWED_CHAR_MESSAGE =
    `비밀번호는 영문 대소문자, 숫자, 다음 특수문자만 사용할 수 있습니다: ${PASSWORD_ALLOWED_SPECIAL_CHAR_SET}`

/**
 * PASSWORD_COMPLEXITY_MESSAGE
 *
 * 역할/목적:
 * - 폼에서 "비밀번호 규칙을 한 문장으로 안내"할 때 사용하는 정책 요약 문구
 *
 * 정책:
 * - 길이 범위 + 필수 포함(대문자/소문자/숫자/특수문자) 규칙을 한 번에 설명
 *
 * 주의:
 * - 이 문구는 서버 정책과 불일치하면 사용자 혼란을 유발하므로 정책 변경 시 동기화 필요
 */
const PASSWORD_COMPLEXITY_MESSAGE =
    `비밀번호는 8~100자이며 영문 대소문자, 숫자, 특수문자(${PASSWORD_ALLOWED_SPECIAL_CHAR_SET})를 모두 포함해야 합니다.`

/**
 * passwordSchema (Zod)
 *
 * 역할/목적:
 * - 비밀번호 입력값을 검증하기 위한 Zod 스키마
 * - "클라이언트 1차 검증(UX)"을 담당하며, 최종 강제는 서버에서 수행된다는 전제 하에 동작
 *
 * 동작/검증 순서:
 * - 길이: [PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]
 * - 허용 문자셋: PASSWORD_ALLOWED_CHAR_REGEX(allowlist)
 * - 포함 규칙(각 1개 이상):
 *   - 숫자: [0-9]
 *   - 영문 소문자: [a-z]
 *   - 영문 대문자: [A-Z]
 *   - 특수문자: PASSWORD_SPECIAL_CHAR_REGEX
 *
 * 에러 메시지 정책:
 * - 메시지는 사용자 입력 교정을 돕는 수준으로 제공
 * - 보안상 "정책을 너무 과도하게 노출"하는 것이 문제가 되는 환경이라면,
 *   서버/클라이언트 모두에서 메시지 상세도를 조정하는 정책이 필요
 *
 * 주의(문자 정규화):
 * - 이 스키마는 ASCII allowlist 전제이므로, 유니코드 정규화(NFC/NFD) 이슈를 직접 다루지 않음
 * - 정책이 확정되어 유니코드를 허용하게 되면, 입력 정규화/동일성 비교 정책을 별도 정의
 */
export const passwordSchema = z
    .string()
    .min(PASSWORD_MIN_LENGTH, `비밀번호 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
    .max(PASSWORD_MAX_LENGTH, `비밀번호 최대 ${PASSWORD_MAX_LENGTH}자 이하이어야 합니다.`)
    .regex(PASSWORD_ALLOWED_CHAR_REGEX, PASSWORD_ALLOWED_CHAR_MESSAGE)
    .regex(/[0-9]/, "숫자를 최소 1개 포함해야 합니다.")
    .regex(/[a-z]/, "영문 소문자를 최소 1개 포함해야 합니다.")
    .regex(/[A-Z]/, "영문 대문자를 최소 1개 포함해야 합니다.")
    .regex(PASSWORD_SPECIAL_CHAR_REGEX, "ASCII 특수문자를 최소 1개 포함해야 합니다.")

/**
 * passwordComplexityMessage
 *
 * 역할/목적:
 * - 폼 레벨에서 "구성요건 요약 안내"가 필요할 때 사용하는 헬퍼
 * - 필드별 상세 에러 대신, 정책 전체를 한 문장으로 노출하고 싶을 때 사용
 *
 * 포인트:
 * - UI에서 동일 문구를 재사용하여 안내의 일관성 확보
 */
export function passwordComplexityMessage(): string {
    return PASSWORD_COMPLEXITY_MESSAGE
}