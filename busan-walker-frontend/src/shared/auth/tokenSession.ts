// src/shared/auth/tokenSession.ts

/**
 * tokenSession.ts (Shared Auth - 인메모리 토큰 단일 진실 공급원)
 *
 * 역할/목적:
 * - accessToken을 localStorage/sessionStorage 없이 모듈 변수(in-memory)에 보관
 * - 앱 관점의 "현재 유효한 accessToken"을 관리하는 SSOT(Single Source of Truth)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · getAccessToken      - 현재 메모리에 저장된 accessToken 조회
 *      · setAccessToken      - accessToken을 직접 설정 (갱신/초기화)
 *      · applyTokens         - BrowserTokens를 메모리에 적용하고 이벤트 발행
 *      · clearTokens         - 토큰을 null로 초기화하고 이벤트 발행
 *      · disposeTokenSession - 이벤트 구독 해제 (HMR/테스트 정리용)
 * - setAccessToken는 직접 사용보다 applyTokens/clearTokens를 우선 사용하도록 권장
 *
 * 동작 방식:
 * - authEvents가 BroadcastChannel로 다른 탭에 이벤트를 전파
 * - tokenSession은 window 이벤트를 구독하여 다른 탭의 토큰 변경을 현재 탭 상태로 반영
 *
 * 운영 포인트:
 * - accessToken을 스토리지에 저장하지 않으면 XSS로 인한 탈취 위험이 크게 줄어듦
 * - 새로고침/탭 재열기 시 메모리가 초기화되므로 "최초 1회 refresh" 흐름(bootstrapRefreshTokens)이 필수
 */

import type { BrowserTokens } from "@/domains/auth";
import {
    dispatchTokensCleared,
    dispatchTokensUpdated,
    onTokensCleared,
    onTokensUpdated,
    type AuthTokens,
    type TokensClearedReason
} from "@/shared/auth/authEvents";

/**
 * 현재 탭의 인메모리 accessToken 상태 (모듈 레벨 단일 상태)
 *
 * - 모듈 변수로 관리하여 앱 전체에서 공유되는 단일 상태(SSOT)로 동작
 * - 초기값 null은 "토큰 없음/로그인 전" 상태를 의미
 * - 새로고침/탭 재열기 시 null로 초기화되므로 silent refresh(bootstrapRefreshTokens)가 필요
 */
let accessToken: string | null = null

/**
 * 현재 메모리에 저장된 accessToken을 반환
 *
 * - Axios 요청 인터셉터에서 Authorization: Bearer 헤더 주입 시 호출
 * - 토큰이 있으면 string, 없으면 null 반환
 */
export function getAccessToken(): string | null {
    return accessToken
}

/**
 * accessToken을 메모리에 직접 설정(갱신/초기화)
 *
 * - 외부에서 이벤트 발행 없이 "직접" 상태만 변경할 때 사용
 * - 일반적인 외부 호출에서는 applyTokens/clearTokens를 사용하여
 *   "상태 변경 + 이벤트 발행"이 함께 이루어지도록 하는 것이 올바른 사용법
 */
export function setAccessToken(token: string | null): void {
    accessToken = token
}

/**
 * 서버에서 받은 BrowserTokens를 메모리에 적용하고 "토큰 갱신" 이벤트를 발행
 *
 * - tokens에서 accessToken을 추출하여 module state를 최신 값으로 갱신
 * - AuthTokens payload로 이벤트 발행(dispatchTokensUpdated)하여 다른 탭과 동기화
 * - "상태 변경"과 "이벤트 발행"이 항상 함께 이루어지도록 단일 함수로 묶음
 */
export function applyTokens(tokens: BrowserTokens): void {
    const nextAccessToken: string = tokens.accessToken
    accessToken = nextAccessToken

    const payload: AuthTokens = { accessToken: nextAccessToken }
    dispatchTokensUpdated(payload)
}

/**
 * 토큰을 null로 초기화하고 "토큰 제거" 이벤트를 발행
 *
 * - module state(accessToken)를 null로 초기화
 * - 토큰 제거 사유(reason)를 포함한 이벤트 발행(dispatchTokensCleared)
 * - reason 기본값을 MANUAL로 두면, 명시적 사유 없이 제거해도 기본 로그/UX 분기가 동작
 */
export function clearTokens(reason: TokensClearedReason = "MANUAL"): void {
    accessToken = null
    dispatchTokensCleared({ reason })
}

/**
 * 다른 탭에서 발생한 토큰 변경 이벤트를 수신하여 현재 탭의 메모리 상태로 반영
 *
 * - tokensUpdated 이벤트 수신: accessToken을 최신 값으로 갱신
 * - tokensCleared 이벤트 수신: accessToken을 null로 초기화
 * - SPA 앱 수명 동안 모듈이 1회만 로드되는 것을 전제로 동작
 * - 이 함수는 사이드이펙트(이벤트 구독)가 있으므로 HMR/테스트 종료 시 disposeTokenSession()으로 정리 필요
 */
const unsubscribeUpdated: () => void = onTokensUpdated((token: AuthTokens) => {
    accessToken = token.accessToken
})

const unsubscribeCleared: () => void = onTokensCleared(() => {
    accessToken = null
})

/**
 * tokenSession이 등록한 이벤트 구독을 해제(unsubscribe)
 *
 * - HMR(핫 리로드) 환경에서 모듈이 재로드될 때 중복 구독 방지
 * - 테스트 환경에서 전역 상태를 정리(clean up)할 때 사용
 * - unsubscribe 함수를 모듈 변수에 미리 저장해두고, dispose에서 한 번에 해제하는 패턴
 */
export function disposeTokenSession(): void {
    unsubscribeUpdated()
    unsubscribeCleared()
}
