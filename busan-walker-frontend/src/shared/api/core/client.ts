// src/shared/api/core/client.ts

/**
 * client.ts (Shared API Core - 공용 HTTP 클라이언트)
 *
 * 역할/목적:
 * - 모든 도메인 레이어에서 사용하는 공용 Axios 인스턴스(api)를 생성 및 설정
 * - 요청/응답 인터셉터를 통해 CSRF, 인증 헤더 주입, 토큰 갱신, 세션 종료를 자동 처리
 *
 * 데이터 흐름:
 *   외부 API 호출 (도메인/피처 레이어)
 *      ↓  request interceptor
 *   CSRF 헤더 주입 + public/protected 분류 + Bearer 토큰 주입
 *      ↓  HTTP 요청 실행
 *   응답 수신
 *      ↓  response interceptor
 *   403 CSRF 재발급 / 401 토큰 갱신 / 세션 종료 처리
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · api                   - 공용 Axios 인스턴스 (모든 API 요청에 사용)
 *      · isTerminalAuthError   - 최종 인증 실패(401) 여부 판별 (세션 종료 판단)
 *      · clearAuthTokens       - 로그아웃 시 토큰 상태를 정리
 *      · bootstrapRefreshTokens - 앱 초기화 시 refreshToken으로 accessToken 복원
 * - RetryConfig, ApiErrorBody 등 내부 타입은 외부에 노출하지 않음
 *
 * 동작 방식:
 * - _csrfRetry / _retry 플래그로 최대 1회씩 재시도를 제한하여 인터셉터 무한 루프 방지
 * - refreshGate(single-flight)로 동시 다중 401 발생 시 refresh를 1회만 실행
 * - public 요청(/auth/**, GET /attractions 등)은 Authorization 헤더를 제거하여 정책 강제
 *
 * 운영 포인트:
 * - baseURL이 변경되면 refreshGate도 동일한 baseURL을 공유해야 쿠키/라우팅이 일관됨
 * - withCredentials=true 설정은 refresh/logout 등 쿠키 기반 세션에 필수
 */

import axios, {
    isAxiosError,
    type AxiosError,
    type AxiosInstance,
    type AxiosResponse,
    type InternalAxiosRequestConfig
} from "axios";
import type { BrowserTokens } from "@/domains/auth";

import { isPublicRequest, setBearerToken, stripAuthHeader } from "@/shared/auth/requestPolicy";
import { applyTokens, clearTokens, getAccessToken } from "@/shared/auth/tokenSession";
import { createRefreshGate } from "@/shared/auth/refreshGate";
import { resolveApiBaseURL } from "@/shared/api/core/baseURL";
import { injectCsrfHeaderIfNeeded } from "@/shared/auth/csrf";

/**
 * 모든 API 요청이 사용하는 API 서버 기본 URL
 *
 * - api 인스턴스와 refreshGate가 동일한 baseURL을 사용해야 쿠키/라우팅이 일관됨
 * - baseURL이 달라지면 refreshToken 쿠키가 다른 경로로 전송되지 않아 refresh가 실패할 수 있음
 */
const baseURL: string = resolveApiBaseURL()

/**
 * 서버 오류 응답(JSON)에서 code를 추출하기 위한 최소 타입
 *
 * - 서버 오류 응답 스키마는 서버/버전에 따라 달라질 수 있으므로 optional로 정의
 * - 현재는 code 기반 분기(CSRF_INVALID 등)를 위해 최소 필드만 정의
 */
type ApiErrorBody = {
    code?: string
    message?: string
    traceId?: string
    timestamp?: string
}

/**
 * 재시도 없이 최종 세션 종료 상태로 전환해야 하는 인증 오류 여부를 판별
 *
 * - refreshToken 만료(만료/삭제/재시도 한계 초과) 시 서버가 401로 응답하는 경우를 대상
 * - 403은 CSRF_INVALID 등 재시도 가능한 경우가 있으므로 code 기반 분기가 필요하며 terminal로 처리하지 않음
 * - refresh 실패 후 "세션 종료(clearTokens)" 여부를 결정하는 분기에서 사용
 */
export function isTerminalAuthError(error: unknown): boolean {
    if (!isAxiosError(error)) return false

    const status: number | undefined = error.response?.status
    return status === 401
}

/**
 * 응답 인터셉터에서 최대 1회 재시도를 제한하기 위한 내부 플래그 타입
 *
 * - _retry: 401 처리(refresh 후 재시도) 실행 여부
 * - _csrfRetry: CSRF_INVALID 처리(CSRF 재발급 후 재시도) 실행 여부
 * - Axios config 객체에 런타임에 mutate하는 방식이므로 InternalAxiosRequestConfig를 확장
 */
type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean; _csrfRetry?: boolean }

/**
 * AxiosError의 response.data에서 서버 오류 code를 안전하게 추출
 *
 * - AxiosError가 아니면 null
 * - response.data.code가 비어있지 않은 string이면 반환, 그 외는 null
 * - data 구조가 앱에서 보장되지 않으므로 최소 타입(ApiErrorBody)으로 캐스팅
 */
function getApiErrorCode(error: unknown): string | null {
    if (!isAxiosError(error)) return null

    const data = error.response?.data as ApiErrorBody | undefined
    const code = data?.code
    return typeof code === "string" && code.length > 0 ? code : null
}

/**
 * CSRF_INVALID(403) 오류 여부를 판별
 *
 * - CSRF 재발급(/auth/csrf) 후 1회 재시도를 위한 분기 처리에 사용
 * - 판별 조건: AxiosError + status === 403 + error body code === "CSRF_INVALID"
 */
function isCsrfInvalid(error: unknown): boolean {
    if (!isAxiosError(error)) return false
    if (error.response?.status !== 403) return false
    return getApiErrorCode(error) === "CSRF_INVALID"
}

/**
 * refresh single-flight 게이트 인스턴스 생성
 *
 * - 동일 탭에서 401이 동시에 발생해도 refresh를 1회만 실행(refreshOnce)
 * - refreshToken 만료 상황에서 중복 refresh 요청으로 인한 토큰 무효화 방지
 */
const { refreshOnce } = createRefreshGate(baseURL)

/**
 * 인증 토큰 상태를 정리하여 로그아웃 상태로 전환
 *
 * - 로그아웃 버튼 클릭 시 또는 세션 종료로 처리할 때 호출
 * - 이 함수는 "토큰 상태 정리"만 수행
 * - 호출 후 UI 상태 초기화나 로그인 페이지 이동 등은 상위 레이어에서 처리
 */
export function clearAuthTokens(): void {
    clearTokens("LOGOUT")
}

/**
 * 앱 초기화 시 refreshToken 쿠키로 accessToken을 복원
 *
 * - refreshOnce()로 서버에서 새 accessToken을 발급받아 tokenSession에 적용
 * - 이후 발생하는 모든 API 요청이 정상 동작할 수 있도록 메모리 상태를 준비
 * - terminal(401) 실패 시 토큰을 정리하여 로그인 전 상태로 전환
 * - App 시작 시점(AuthProvider 등)에서 1회 호출하여 "세션 복원" 흐름을 실행
 * - 복원 실패 시에는 상위에서 로그인 페이지 이동/공지 등 UX 처리가 필요
 */
export async function bootstrapRefreshTokens(): Promise<BrowserTokens> {
    try {
        const tokens: BrowserTokens = await refreshOnce()
        applyTokens(tokens)
        return tokens
    } catch (error: unknown) {
        if (isTerminalAuthError(error)) {
            clearTokens("REFRESH_FAILED")
        }
        throw error
    }
}

/**
 * 모든 도메인 레이어에서 사용하는 공용 HTTP 클라이언트
 *
 * - baseURL: resolveApiBaseURL() 결과 사용
 * - withCredentials=true: refresh/logout 등 쿠키 기반 인증에서 HttpOnly 쿠키가 자동 전송되도록 설정
 * - 쿠키 기반 세션(로그인/바이패스 토큰)에서는 withCredentials가 반드시 필요
 */
export const api: AxiosInstance = axios.create({
    baseURL,
    withCredentials: true,
})

/**
 * 요청 인터셉터
 *
 * 처리 순서:
 * 1) unsafe 요청(POST/PUT/PATCH/DELETE)에 CSRF 헤더를 주입 (쿠키가 유효한 경우)
 * 2) public 요청은 Authorization 헤더를 강제 제거 (정책 충돌 방지)
 * 3) protected 요청에는 accessToken이 있을 때만 Bearer 헤더를 주입
 *
 * 설계 포인트:
 * - public 요청(/auth/**, GET /attractions 등) Authorization이 붙어 있으면
 *   서버 정책과 충돌하거나 불필요한 토큰 노출이 생기므로 강제로 제거
 * - protected 요청에 accessToken이 없으면 헤더 없이 전송하여 서버가 401로 응답하도록 처리
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    /* 1) CSRF 쿠키가 유효한 경우 unsafe 요청(POST/PUT/PATCH/DELETE)에 CSRF 헤더 주입 */
    injectCsrfHeaderIfNeeded(config)

    /* 2) public 요청은 Authorization 헤더를 제거 (서버 정책과 충돌 방지) */
    if (isPublicRequest(config)) {
        stripAuthHeader(config)
        return config
    }

    /* 3) protected 요청: accessToken이 있을 때만 Bearer 헤더를 주입 */
    const token: string | null = getAccessToken()
    if (!token) {
        stripAuthHeader(config)
        return config
    }

    setBearerToken(config, token)
    return config
})

/**
 * 응답 인터셉터
 *
 * 처리 순서:
 * 1) 403 CSRF_INVALID: CSRF 쿠키 재발급 후 1회 재시도 (logout 등 상태 전환 없이 필요)
 * 2) 401 처리: refresh 후 원본 요청 재시도
 *
 * 재시도 제한:
 * - _csrfRetry / _retry 플래그로 최대 1회 재시도를 제한하여 인터셉터 무한 루프 방지
 *
 * 처리 우선순위:
 * 1) CSRF_INVALID(403) 분기 먼저 처리
 * 2) 그 다음 401 처리 (공용/보호 요청 구분)
 */
api.interceptors.response.use(
    (response: AxiosResponse): AxiosResponse => response,
    async (error: AxiosError): Promise<AxiosResponse | never> => {
        const status : number | undefined = error.response?.status
        const config: RetryConfig | undefined = error.config as RetryConfig | undefined
        if (!config) return Promise.reject(error)

        /**
         * 1) CSRF_INVALID(403) 분기
         *
         * - CSRF 쿠키/헤더 불일치 시 /auth/csrf 재발급 후 1회 재시도
         * - _csrfRetry가 이미 true이면 더 이상 재시도하지 않고 실패로 종료
         */
        if (status === 403 && isCsrfInvalid(error)) {
            if (!config._csrfRetry) {
                config._csrfRetry = true
                await api.get<void>("/auth/csrf")
                return api.request(config)
            }
            return Promise.reject(error)
        }

        /**
         * 2) 401 분기
         *
         * public 요청:
         *   - 재시도하지 않고 그대로 실패 (쿠키 없는 요청 시도 등 정상 흐름)
         * protected 요청:
         *   - refreshGate(refreshOnce)로 accessToken 갱신
         *   - 갱신 성공 후 원본 요청에 Bearer 토큰을 재주입하고 1회 재시도
         *
         * 재시도 제한: _retry 플래그로 최대 1회 재시도
         */
        if (status !== 401) return Promise.reject(error)

        /* 2-1) public 요청은 재시도하지 않고 실패 반환 (쿠키 없는 요청 등 정상 흐름) */
        if (isPublicRequest(config)) {
            stripAuthHeader(config)
            return Promise.reject(error)
        }

        /* 2-2) protected 요청: 이미 재시도한 요청이면 더 이상 재시도하지 않고 실패 반환 */
        if (config._retry) return Promise.reject(error)
        config._retry = true

        try {
            /* refresh single-flight: 동시에 여러 요청이 401을 받아도 refresh는 1회만 실행 */
            const tokens: BrowserTokens = await refreshOnce()
            applyTokens(tokens)

            /* 원본 요청에 최신 accessToken을 재주입하고 재시도 */
            setBearerToken(config, tokens.accessToken)
            return api.request(config)
        } catch (refreshError: unknown) {
            /* refresh가 401로 응답하면 "세션 종료"로 전환 (토큰 정리) */
            if (isTerminalAuthError(refreshError)) {
                clearTokens("REFRESH_FAILED")
            }
            return Promise.reject(refreshError)
        }
    }
)
