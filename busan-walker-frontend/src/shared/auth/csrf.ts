// src/shared/auth/csrf.ts

/**
 * csrf.ts (Shared Auth - CSRF 헤더 주입 유틸)
 *
 * 역할/목적:
 * - Double Submit Cookie 방식으로 CSRF 공격을 방어하는 헤더 주입 유틸
 * - unsafe 요청(POST/PUT/PATCH/DELETE)에 X-CSRF-Token 헤더를 자동으로 주입
 *
 * 데이터 흐름:
 *   document.cookie (문자열)
 *      ↓  getCsrfTokenFromCookie()
 *   CSRF 토큰 값 (string | null)
 *      ↓  injectCsrfHeaderIfNeeded()
 *   InternalAxiosRequestConfig (헤더 주입 완료)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · injectCsrfHeaderIfNeeded  - unsafe 요청에 CSRF 헤더를 주입 (Axios 인터셉터에서 호출)
 *      · hasCsrfTokenCookie        - CSRF 쿠키 존재 여부 확인 (refresh 직전 검사에서 사용)
 * - 내부 헬퍼(readCookie, getCsrfTokenFromCookie 등)는 외부에 노출하지 않음
 *
 * 동작 방식:
 * - 서버 검증 규칙: unsafe 요청에서 cookie의 CSRF 값과 header의 CSRF 값이 동일해야 통과
 * - CSRF_COOKIE_CANDIDATES 우선순위로 쿠키를 탐색하여 첫 번째 유효한 값 사용
 *
 * 운영 포인트:
 * - CSRF_HEADER_NAME, CSRF_COOKIE_CANDIDATES는 서버 설정과 반드시 일치시켜야 함
 * - 새로운 쿠키 이름이 추가되면 CSRF_COOKIE_CANDIDATES에 추가
 */

import type { AxiosHeaders, InternalAxiosRequestConfig } from "axios";

// 서버가 검증에 사용하는 CSRF 헤더 이름 - 서버/클라이언트가 동일한 값을 써야 하므로 한 곳에서만 정의
const CSRF_HEADER_NAME = "X-CSRF-Token"

// CSRF 쿠키 후보 목록 - 프로젝트 기본값(bh_csrf) 우선, 외부 라이브러리 충돌 가능성을 고려해 순차 탐색
const CSRF_COOKIE_CANDIDATES = ["bh_csrf", "CSRF-Token", "CSRF_TOKEN", "XSRF-Token"] as const

/**
 * Axios 요청 config에서 이 유틸이 실제로 사용하는 필드만 최소 타입으로 정의
 *
 * - 전체 config 타입에 강하게 의존하면 결합도가 올라가므로 Pick으로 필요한 것만 추출
 * - headers/method만 다루므로 이 범위 내에서만 안전하게 mutate
 */
type MutableRequestConfig = Pick<InternalAxiosRequestConfig, "headers" | "method">

/**
 * Axios config의 method를 비교하기 쉬운 표준 형태로 정규화
 *
 * - method가 undefined인 경우 기본값을 "GET"으로 처리
 * - 비교 로직 단순화를 위해 항상 대문자로 통일
 */
function normalizeMethod(method: string | undefined): string {
    return (method ?? "GET").toUpperCase()
}

/**
 * CSRF 보호가 필요 없는 safe method인지 판별
 *
 * - GET/HEAD/OPTIONS는 서버 상태를 변경하지 않는 요청으로 간주(safe)
 * - 그 외(POST/PUT/PATCH/DELETE)는 unsafe로 보고 CSRF 헤더 주입 대상
 */
function isSafeMethod(method: string): boolean {
    return method === "GET" || method === "HEAD" || method === "OPTIONS"
}

/**
 * document.cookie 문자열에서 특정 쿠키(name)의 값을 추출
 *
 * - 값(value)에 '='가 포함될 수 있으므로 첫 '=' 기준으로만 분리
 * - decodeURIComponent 실패 시에도 동작을 유지(rawValue 그대로 반환)
 */
function readCookie(name: string): string | null {
    if (typeof document === "undefined") return null

    const cookieString = document.cookie
    if (!cookieString) return null

    const pairs = cookieString.split(";")
    for (const pair of pairs) {
        const trimmed = pair.trim()
        if (trimmed.length === 0) continue

        const eqIndex = trimmed.indexOf("=")
        if (eqIndex < 0) continue

        const key = trimmed.slice(0, eqIndex).trim()
        if (key !== name) continue

        const rawValue = trimmed.slice(eqIndex + 1)
        if (!rawValue) return null

        try {
            return decodeURIComponent(rawValue)
        } catch {
            return rawValue
        }
    }

    return null
}

/**
 * 후보 목록(CSRF_COOKIE_CANDIDATES)을 순서대로 탐색해 CSRF 토큰 값을 반환
 *
 * - 우선순위가 높은 후보부터 탐색하여 첫 번째 유효한 값 반환
 * - SSR/Node 환경에서는 document가 없으므로 null 반환
 */
function getCsrfTokenFromCookie(): string | null {
    if (typeof document === "undefined") return null

    for (const cookieName of CSRF_COOKIE_CANDIDATES) {
        const value = readCookie(cookieName)
        if (value) return value
    }
    return null
}

/**
 * AxiosHeaders / plain object 등 다양한 헤더 구현체를 흡수하여 name/value를 주입
 *
 * - AxiosHeaders 인스턴스이면 .set() 메서드를 사용
 * - 일반 Record 객체이면 직접 키에 값을 할당
 */
function setHeader(headers: unknown, name: string, value: string): void {
    if (!headers) return

    const maybeAxiosHeaders = headers as AxiosHeaders
    if (typeof maybeAxiosHeaders.set === "function") {
        maybeAxiosHeaders.set(name, value)
        return
    }

    const record = headers as Record<string, unknown>
    record[name] = value
}

/**
 * unsafe 요청(POST/PUT/PATCH/DELETE)에 한해 CSRF 헤더를 주입
 *
 * - safe method(GET/HEAD/OPTIONS)이면 아무 것도 하지 않고 종료
 * - 쿠키에서 CSRF 토큰을 찾지 못하면 헤더를 주입하지 않음
 * - Axios 요청 인터셉터에서 모든 요청에 대해 호출되도록 설계
 */
export function injectCsrfHeaderIfNeeded(config: MutableRequestConfig): void {
    const method = normalizeMethod(config.method)
    if (isSafeMethod(method)) return

    const token = getCsrfTokenFromCookie()
    if (!token) return

    if (!config.headers) {
        (config as { headers: Record<string, unknown> }).headers = {}
    }

    setHeader(config.headers, CSRF_HEADER_NAME, token)
}

/**
 * CSRF 토큰 쿠키가 존재하는지 여부를 반환
 *
 * - refresh 직전에 CSRF 쿠키가 비어 있는지 점검하는 흐름(refreshGate)에서 사용
 * - false이면 /auth/csrf를 호출해 쿠키를 재발급받아야 함
 */
export function hasCsrfTokenCookie(): boolean {
    return getCsrfTokenFromCookie() != null
}
