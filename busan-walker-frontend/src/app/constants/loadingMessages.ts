// src/app/constants/loadingMessages.ts

/**
 * LOADING_MESSAGE
 * 
 * 역할/목적:
 * - 애플리케이션 전역에서 사용하는 "로딩 상태 안내 문구"를 한 곳에 모아 관리
 * - 컴포넌트 내부에 문자열을 하드코딩하지 않고, 상수로 분리하여 일관성과 유지보수성을 확보
 * 
 * 설계 정책:
 * - UI 문구를 constants 레이어에 배치하여 컴포넌트 로직과 표시 텍스트를 분리(관심사 분리)
 * - 동일한 의미의 로딩 상태를 여러 화면에서 동일한 문구로 유지
 * 
 * 타입 안정성 정책:
 * - `as const`를 사용하여 각 값이 "string 리터럴 타입"으로 고정
 *   → keyof typeof LOADING_MESSAGE 등을 활용할 때
 *     값이 일반 string이 아닌 구체적 리터럴 타입으로 추론되어 타입 안전성이 향상
 * 
 * 사용 예:
 * - <LoadingState message={LOADING_MESSAGES.page}>
 * - 세션 초기화 중: LOADING_MESSAGES.session
 * 
 * 주의:
 * - 문구 변경은 이 파일에서만 수정하면 전역 반영
 * - 다국어(i18n) 체계로 확장할 경우, 이 상수는 번역 키로 대체되거나 locale 리소스로 이동 가능
 */
export const LOADING_MESSAGES = {
    generic: "불러오는 중...",
    page: "페이지를 불러오는 중...",
    session: "세션을 확인하는 중..."
} as const
