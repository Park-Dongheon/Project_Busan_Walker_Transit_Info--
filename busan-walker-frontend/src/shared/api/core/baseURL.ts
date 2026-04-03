// src/shared/api/core/baseURL.ts

/**
 * baseURL.ts (Shared API Core - API Base URL 결정 유틸)
 *
 * 역할/목적:
 * - 프론트엔드가 호출할 API baseURL을 단일 규칙(SSOT)으로 결정
 * - 쿠키 Path(/api/v1/auth)와 호환되도록 기본 prefix를 /api/v1로 고정
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · normalizeApiBaseURL    - 입력값을 baseURL로 안전하게 정규화
 *      · resolveApiBaseURL      - Vite 환경변수에서 baseURL을 읽어 반환
 *      · resolveBackendAssetUrl - 백엔드가 반환한 에셋 경로를 절대 URL로 변환
 * - 내부 헬퍼(isAbsoluteUrl, isBrowserLocalAssetUrl, resolveApiOrigin)는 외부에 노출하지 않음
 *
 * 동작 방식:
 * - VITE_API_BASE 환경변수가 없으면 DEFAULT_API_PREFIX(/api/v1)를 기본값으로 사용
 * - trailing slash를 제거하여 Axios baseURL + 경로 결합 시 이중 슬래시 방지
 *
 * 운영 포인트:
 * - refresh 쿠키(bh_rt)가 Path=/api/v1/auth로 내려오는 경우, baseURL이 /api/v1과 맞지 않으면
 *   쿠키가 전송되지 않아 refresh가 실패할 수 있으므로 VITE_API_BASE 설정 시 주의 필요
 * - baseURL 변경 시 refreshGate, CSRF 재발급 호출 등도 동일한 baseURL을 공유하는지 확인 필요
 */

// 기본 API 경로 prefix - 쿠키 Path(/api/v1/auth)와 일치시켜야 refresh 쿠키가 정상 전송됨
const DEFAULT_API_PREFIX = "/api/v1"

/**
 * 입력값을 Axios baseURL로 안전하게 정규화
 *
 * - 값이 비어있으면 DEFAULT_API_PREFIX(/api/v1)를 사용
 * - trailing slash 제거: "/api/v1/" -> "/api/v1"
 * - 환경변수 외에도 문자열을 직접 전달할 수 있으므로 raw: unknown 타입으로 받음
 */
export function normalizeApiBaseURL(raw: unknown): string {
    const asString: string = typeof raw === "string" ? raw.trim() : ""
    const chosen: string = asString.length > 0 ? asString : DEFAULT_API_PREFIX
    return chosen.replace(/\/+$/, "")
}

/**
 * Vite 환경변수(VITE_API_BASE)에서 baseURL을 읽어 정규화된 API baseURL을 반환
 *
 * - /api/v1 suffix가 아닌 경우 콘솔 경고를 발생시켜 잘못된 설정을 조기에 감지
 * - refresh 쿠키(bh_rt)가 Path=/api/v1/auth로 내려오는 경우 baseURL prefix가 맞지 않으면
 *   쿠키가 전송되지 않아 refresh가 실패할 수 있음
 */
export function resolveApiBaseURL(): string {
    const rawEnv: unknown = import.meta.env.VITE_API_BASE
    const normalized: string = normalizeApiBaseURL(rawEnv)

    if (!normalized.endsWith("/api/v1") && normalized !== "/api/v1") {
        console.warn(
            `[API_BASE_URL] baseURL="${normalized}" is unusual. Recommended suffix is "/api/v1" to match refresh cookie path`
        )
    }

    return normalized
}

// http:// 또는 https://로 시작하는 절대 URL 여부를 판별 (프로토콜 상대 URL인 //도 포함)
function isAbsoluteUrl(value: string): boolean {
    return /^(?:https?:)?\/\//i.test(value)
}

// blob: 또는 data: URL 여부를 판별 - 브라우저 로컬 에셋이므로 origin 결합 없이 그대로 사용
function isBrowserLocalAssetUrl(value: string): boolean {
    return /^(?:blob:|data:)/i.test(value)
}

/**
 * API origin(scheme + host)을 추출
 *
 * - baseURL이 절대 URL이면 URL 파싱으로 origin 추출
 * - 상대 경로이면 브라우저의 window.location.origin을 사용
 * - window가 없으면 null 반환 (SSR/Node 환경)
 */
function resolveApiOrigin(): string | null {
    const baseURL = resolveApiBaseURL()

    if (isAbsoluteUrl(baseURL)) {
        return new URL(baseURL).origin
    }

    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin
    }

    return null
}

/**
 * 백엔드가 반환한 에셋 경로를 절대 URL로 변환
 *
 * - 이미 절대 URL이거나 blob:/data: URL이면 그대로 반환
 * - 상대 경로이면 API origin과 결합하여 절대 URL로 변환
 * - origin을 알 수 없는 경우(SSR 등)에는 상대 경로 그대로 반환
 * - null/undefined/빈 문자열이면 null 반환
 */
export function resolveBackendAssetUrl(raw: string | null | undefined): string | null {
    if (typeof raw !== "string") return null

    const trimmed = raw.trim()
    if (trimmed.length === 0) return null
    if (isAbsoluteUrl(trimmed) || isBrowserLocalAssetUrl(trimmed)) {
        return trimmed
    }

    const origin = resolveApiOrigin()
    if (!origin) return trimmed

    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
    return `${origin}${normalizedPath}`
}
