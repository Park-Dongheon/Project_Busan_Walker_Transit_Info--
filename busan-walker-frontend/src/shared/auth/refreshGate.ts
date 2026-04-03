// src/shared/auth/refreshGate.ts

/**
 * refreshGate.ts (Shared Auth - 토큰 갱신 단일 실행 게이트)
 *
 * 역할/목적:
 * - 동일 탭에서 401이 동시에 여러 번 발생해도 /auth/refresh는 1회만 실행(single-flight)
 * - refreshToken 만료 상황에서 중복 refresh 요청으로 인한 토큰 무효화 방지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · RefreshGate         - refreshOnce 메서드를 갖는 인터페이스
 *      · createRefreshGate   - baseURL을 받아 RefreshGate 인스턴스를 생성하는 팩토리
 * - authClient는 메인 api 인스턴스와 별도로 생성하여 인터셉터 간 순환 참조를 방지
 *
 * 동작 방식:
 * - refreshInflight(Promise)를 클로저로 보관하여 동시 다중 호출을 1회로 묶음
 * - CSRF_INVALID 오류: /auth/csrf 재발급 후 1회 재시도
 * - 재시도 가능 오류(네트워크/429/5xx): backoff 후 1회 재시도
 * - 그 외: 즉시 throw하여 상위(response interceptor)에서 처리
 *
 * 운영 포인트:
 * - "메인 api 인스턴스"와 "refresh 전용 authClient"를 분리하여 순환 참조 방지
 * - withCredentials/CSRF 헤더 설정을 refresh에만 적용하도록 별도 클라이언트 사용
 */

import axios, {
    isAxiosError,
    type AxiosInstance,
    type AxiosResponse,
    type InternalAxiosRequestConfig
} from "axios";
import type { BrowserTokens } from '@/domains/auth/types';
import { hasCsrfTokenCookie, injectCsrfHeaderIfNeeded } from "@/shared/auth/csrf";
import { normalizeApiBaseURL } from "@/shared/api/core/baseURL";
import { computeRetryAfterMs, sleep } from "@/shared/api/core/retryAfter";

/**
 * 서버 오류 응답(ApiError)에서 필요한 필드만 추출한 최소 타입
 *
 * - 오류 응답 스키마는 서버/버전에 따라 달라질 수 있으므로 optional 필드로 정의
 * - 현재는 code 기반 분기(CSRF_INVALID 등)를 위해 최소 필드만 정의
 */
type ApiErrorBody = {
    code?: string
    message?: string
    traceId?: string
    timestamp?: string
}

/**
 * refresh single-flight 게이트 인터페이스
 *
 * - 동일 탭에서 401이 동시에 발생해도 /auth/refresh를 1회만 실행(single-flight)
 * - refreshToken 만료 상황에서 중복 refresh 요청으로 인한 토큰 무효화 방지
 */
export type RefreshGate = {
    refreshOnce: () => Promise<BrowserTokens>
}

/**
 * AxiosError 응답 body에서 서버 error code 값을 최대한 안전하게 추출
 *
 * - AxiosError가 아니면 null
 * - response.data에서 code(string)가 유효하면 반환, 아니면 null
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
 * - CSRF 쿠키/헤더 불일치(만료 포함) 시 /auth/csrf 재발급 후 1회 재시도가 필요
 * - refresh는 POST(unsafe)이므로 서버에서 CSRF 검증 실패 시 이 오류가 발생
 * - 판별 조건: AxiosError + status === 403 + error body code === "CSRF_INVALID"
 */
function isCsrfInvalid(error: unknown): boolean {
    if (!isAxiosError(error)) return false
    if (error.response?.status !== 403) return false
    return getApiErrorCode(error) === "CSRF_INVALID"
}

/**
 * 1회 재시도가 가능한 오류 여부를 판별
 *
 * - 재시도 가능 대상: 네트워크 오류(response 없음), 429(Rate Limit), 5xx(서버 일시 장애)
 * - refresh 재시도는 "제한된 재시도가 없으면 실패를 감추는 부작용이 있으므로"
 *   횟수 제한(현재 1회) + 지수 백오프 + 제한 시간(maxMs)을 두는 것이 올바른 방향
 */
function isRetriableRefreshError(error: unknown): boolean {
    if (!isAxiosError(error)) return false

    const status: number | undefined = error.response?.status
    if (status == null) return true
    if (status === 429) return true
    return status >= 500 && status <= 599
}

/**
 * refresh 재시도 전 대기 시간(ms)을 계산
 *
 * - 429이면 Retry-After 헤더 기반으로 계산(상한 적용)
 * - 그 외 retriable이면 기본값(250ms)
 * - Retry-After의 초/HTTP-date 두 형식 파싱은 computeRetryAfterMs에 위임
 */
function computeBackoffMsForRefresh(error: unknown): number {
    if (!isAxiosError(error)) return 250

    const status: number | undefined = error.response?.status
    if (status === 429) {
        return computeRetryAfterMs(error.response?.headers, 250, 3000)
    }

    return 250
}

/**
 * 지정된 baseURL을 기반으로 refresh single-flight 게이트 인스턴스를 생성
 *
 * - authClient(별도 Axios 인스턴스)를 생성하여 refresh 전용 요청만 처리
 * - refreshInflight(Promise)를 클로저로 관리하여 동시 다중 호출을 1회로 묶음
 * - "메인 api 클라이언트"와 "refresh 전용 클라이언트"를 분리하면:
 *   - 인터셉터 루프(401 -> refresh -> 401 -> refresh ...) 방지
 *   - withCredentials/CSRF 헤더 설정을 refresh에만 독립적으로 적용 가능
 */
export function createRefreshGate(baseURL: string): RefreshGate {
    /**
     * 입력된 baseURL을 trailing slash가 없는 정규화 형태로 변환
     *
     * - 환경변수/런타임 상황에 따라 baseURL이 다를 수 있으므로 normalize 함수를 거쳐 일관된 값 보장
     */
    const normalizedBaseURL: string = normalizeApiBaseURL(baseURL)

    /**
     * /auth/csrf, /auth/refresh 등 인증 전용 요청에 사용하는 Axios 인스턴스
     *
     * - withCredentials: refreshToken(HttpOnly cookie)을 자동으로 전송하기 위해 true로 설정
     */
    const authClient: AxiosInstance = axios.create({
        baseURL: normalizedBaseURL,
        withCredentials: true,
    })

    /**
     * refresh 요청의 CSRF 헤더 자동 주입 인터셉터
     *
     * - refresh 요청은 POST(unsafe)이므로 CSRF 헤더가 없으면 서버에서 CSRF 검증 실패
     * - 요청 직전 injectCsrfHeaderIfNeeded로 cookie 기반 CSRF 토큰을 헤더에 주입
     */
    authClient.interceptors.request.use((config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
        injectCsrfHeaderIfNeeded(config)
        return config
    })

    /**
     * refresh 직전에 CSRF 쿠키 존재를 보장
     *
     * - 최초 방문이나 쿠키 만료 시에는 CSRF 쿠키가 없을 수 있음
     * - refresh는 POST이므로 CSRF 토큰이 없으면 요청 실패로 이어짐
     * - 이미 CSRF 쿠키가 있으면 즉시 종료, 없으면 GET /auth/csrf로 쿠키를 재발급
     */
    const ensureCsrfCookie = async (): Promise<void> => {
        if (hasCsrfTokenCookie()) return
        await authClient.get<void>("/auth/csrf")
    }

    /**
     * 현재 탭에서 실행 중인 refresh Promise를 보관하는 클로저 상태 (single-flight)
     *
     * - null이면 "실행 중인 refresh 없음"
     * - 값이 있으면 "이미 refresh가 진행 중"으로, 동일 Promise를 공유하여 결과를 재사용
     * - 동시에 10개의 401이 발생해도 refresh 요청은 1회만 실행하고 동일한 결과를 공유
     */
    let refreshInflight: Promise<BrowserTokens> | null = null

    /**
     * 실제 /auth/refresh 요청을 실행하고 BrowserTokens를 반환
     *
     * - ensureCsrfCookie로 CSRF 쿠키 존재를 보장한 뒤 POST /auth/refresh 호출
     * - 응답 body의 tokens(accessToken)를 반환
     * - refresh의 "실제 API 호출" 로직만 담당하며, 재시도 로직은 refreshOnce에서 처리
     */
    const postRefresh = async (): Promise<BrowserTokens> => {
        await ensureCsrfCookie()

        const response: AxiosResponse<BrowserTokens> = await authClient.post<BrowserTokens>("/auth/refresh", undefined)
        return response.data
    }

    /**
     * 동일 탭에서의 refresh를 1회만 실행하도록 single-flight 패턴을 적용
     *
     * - refreshInflight가 없으면 새 refresh 작업을 생성
     * - 생성된 Promise를 refreshInflight에 저장하여 이후 동시 호출은 동일 Promise를 재사용
     * - 완료/실패 후 finally에서 refreshInflight를 null로 초기화하여 다음 refresh를 허용
     *
     * 재시도 전략(횟수 제한 1회):
     * - CSRF_INVALID: /auth/csrf 재발급 후 1회 재시도
     * - 재시도 가능(네트워크/429/5xx): backoff 후 1회 재시도
     *
     * 주의:
     * - refresh 실패는 최종 호출자(response interceptor)에서 처리하도록 상위로 throw
     *   현재 함수에서는 "재시도 가능한 오류"만 처리하고 그 외는 즉시 상위에서 로그아웃/리다이렉트로 처리
     */
    async function refreshOnce(): Promise<BrowserTokens> {
    if (!refreshInflight) {
        refreshInflight = (async (): Promise<BrowserTokens> => {
            try {
                return await postRefresh()
            } catch (error: unknown) {
                /* 1) CSRF 토큰 불일치/만료: CSRF 재발급 후 1회 재시도 */
                if (isCsrfInvalid(error)) {
                    await authClient.get<void>("/auth/csrf")
                    return await postRefresh()
                }

                /* 2) 일시 오류(네트워크/429/5xx): backoff 후 1회 재시도 */
                if (isRetriableRefreshError(error)) {
                    const backoffMs: number = computeBackoffMsForRefresh(error)
                    await sleep(backoffMs)
                    return await postRefresh()
                }

                /* 3) 그 외는 상위 호출자에서 세션 종료 처리하도록 그대로 throw */
                throw error
            }
        })().finally(() => {
            /* refresh 완료 후 gate 초기화 (다음 refresh 요청 허용) */
            refreshInflight = null
        })
    }

    return refreshInflight
    }

    return { refreshOnce }
}
