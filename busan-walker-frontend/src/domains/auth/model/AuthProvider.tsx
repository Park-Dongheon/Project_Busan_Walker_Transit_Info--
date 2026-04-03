// src/domains/auth/model/AuthProvider.tsx

import {
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef,
    type ReactNode,
    type ReactElement
} from "react";
import type { QueryKey } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { bootstrapRefreshTokens } from "@/shared/api/core/client";
import * as accountApi from '@/domains/account/api';
import * as authApi from '../api';
import type { AuthState, AuthUser, LoginParams } from '../types';
import { parseAuthUserSnapshot } from '../lib';
import { queryClient } from "@/app/query/queryClient";
import { applyTokens, clearTokens } from "@/shared/auth/tokenSession";
import { onTokensCleared, type TokensClearedReason } from "@/shared/auth/authEvents";
import { ROUTES } from "@/app/navigation/navigation";
import { AuthContext } from "./AuthContext";

/**
 * AUTH_SCOPED_QUERY_ROOTS
 * 
 * 역할/목적:
 * - "인증 상태에 의존하는 캐시"만 세션 종료 시 선택적으로 제거하기 위한 루트 목록
 * - 공개 데이터(예: 관광지 목록/지도 데이터)까지 지우면 UX(재로딩)와 성능이 불필요하게 악화될 수 있으므로,
 *   인증 의존 쿼리만 정리하는 것을 정책
 * 
 * 정책 전제(queryKey 컨벤션):
 * - React Query queryKey의 첫 요소(queryKey[0])는 "문자열 루트"로 운영
 * - 인증 의존 쿼리는 루트가 아래 중 하나가 되도록 컨벤션을 유지:
 *   - "me" / "favorites" / "favorite-exists" / "reviews"
 * 
 * 주의:
 * - queryKey 컨벤션이 깨지면 정리 대상 누락
 *   따라서 인증 의존 쿼리는 반드시 이 루트 정책을 따르도록 프로젝트 규칙으로 유지
 */
const AUTH_SCOPED_QUERY_ROOTS = new Set<string>(["me", "favorites", "favorite-exists", "reviews"])

function isAuthScopedQueryKey(queryKey: QueryKey): boolean {
    const root = queryKey[0]
    return typeof root === "string" && AUTH_SCOPED_QUERY_ROOTS.has(root)
}

/**
 * bootstrapInFlight (모듈 스코프 공유 Promise)
 * 
 * 역할/목적:
 * - 앱 부팅 시 수행되는 "세션 복구(silent refresh + /me 확정)" 흐름의 중복 호출을 방지
 * 
 * 배경(React 18 Strict Mode):
 * - 개발 환경 Strict Mode에서는 mount → unmount → mount가 연속 발생 가능
 * - 이때 부트스트랩 로직이 순수하게 effect 기반이면, refresh + /me 요청이 중복으로 나가 UX/서버 부하 증가
 * 
 * 동작:
 * - 최초 호출자가 Promise를 생성하고, 이후 호출자는 동일 Promise를 공유
 * - 완료/실패 후에는 null로 되돌려 다음 부팅 흐름에서 다시 실행 가능
 */
let bootstrapInFlight: Promise<AuthUser | null> | null = null

/**
 * runBootstrapSession
 * 
 * 역할/목적:
 * - 앱 초기 부팅에서 "세션 복구"를 수행하고 AuthUser를 확정
 * 
 * 동작(부트스트랩 단계):
 * 1) silent refresh 시도
 *    - 실패하면 로그인 상태 복구 불가로 판단하고 게스트(null)로 시작
 *    - terminal 에러에서의 토큰 정리 정책은 bootstrapRefreshTokens 내부 정책에 위임
 * 
 * 2) /me 조회로 사용자 확정
 *    - refresh는 성공했는데 /me 확정에 실패하면 토큰/사용자 상태 불일치가 발생 가능
 *    - 이를 방지하기 위해 로컬 세션을 롤백(clearLocalAuth)하고 게스트로 시작
 * 
 * 포인트:
 * - fetchMe / clearLocalAuth를 외부 주입, 네트워크/스토리지 구현과 부트스트랩 흐름을 느슨하게 결합
 */
function runBootstrapSession(
    fetchMe: () => Promise<AuthUser>,
    clearLocalAuth: (reason: TokensClearedReason) => void,
): Promise<AuthUser | null> {
    if (bootstrapInFlight) return bootstrapInFlight

    bootstrapInFlight = (async (): Promise<AuthUser | null> => {
        /* 1) silent refresh 시도 */
        try {
            await bootstrapRefreshTokens()
        } catch {
            return null
        }

        /* 2) /me로 사용자 확정 */
        try {
            return await fetchMe()
        } catch {
            // refresh 성공 후 /me 확정 실패 시 토큰과 user 상태가 어긋나지 않도록 롤백
            clearLocalAuth("MANUAL")
            return null
        }
    })()

    void bootstrapInFlight.finally(() => {
        bootstrapInFlight = null
    })

    return bootstrapInFlight
}

/**
 * AuthProvider
 * 
 * 역할/목적:
 * - AuthContext(AuthState)의 상태(user/isLoading)와 동작(login/logout)을 제공하는 전역 Provider
 * 
 * 핵심 정책:
 * - 앱 부팅 시 "silent refresh + /me 확정"으로 세션 복구
 * - 세션 종료는 clearTokens(reason) 호출을 단일 트리거로 삼음
 *   - clearTokens → onTokensCleared 이벤트 발생
 *   - user 초기화 + 인증 의존 query 캐시 정리는 onTokensCleared 구독 지점에서 일괄 처리
 * 
 * 경합/안정성 정책:
 * - 진행 중인 인증 플로우(bootstrap/login)가 있는 상태에서 토큰 제거 이벤트가 발생 가능
 * - 이를 안전하게 처리하기 위해 "세션 버전(authStateVersion)"을 사용
 *   - 토큰 제거 이벤트 발생 시 버전을 증가
 *   - 이후 도착하는 stale 완료 결과는 버전 비교로 무시
 * 
 * 주의(보안/인가)
 * - 프론트의 인증 상태는 UX를 위한 상태이며, 최종 인가(권한 판정)는 서버 책임
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
    const navigate = useNavigate()

    /**
     * user
     * - 현재 로그인 사용자(최소 모델: AuthUser)
     * - null이면 비로그인(게스트) 상태
     */
    const [user, setUser] = useState<AuthUser | null>(null)

    /**
     * isLoading
     * - 앱 부팅 시 "세션 복구/확정"이 완료되기 전까지 true
     * - 개별 액션(로그인 버튼 클릭 등)의 진행 상태를 의미하지 않음
     */
    const [isLoading, setIsLoading] = useState<boolean>(true)

    /**
     * authStateVersionRef (세션 버전)
     * 
     * 역할/목적:
     * - 토큰 제거(세션 종료) 이벤트를 기준으로 "현재 인증 컨텍스트의 세대(generation)"를 식별
     * 
     * 동작:
     * - 세션이 종료되면 버전을 증가시켜, 이전 세대에서 시작된 bootstrap/login 완료 결과를 무효화
     */
    const authStateVersionRef = useRef<number>(0)

    const markAuthStateChanged = useCallback((): void => {
        authStateVersionRef.current += 1
    }, [])

    /**
     * clearLocalAuth
     * 
     * 역할/목적:
     * - 로컬 세션 종료를 "단일 API(clearTokens)"로 표준화
     * 
     * 동작:
     * - clearTokens(reason)는 토큰을 비우고, onTokensCleared 이벤트를 발생
     * - 실제 user/query 정리는 "토큰 제거 이벤트 구독(useEffect)"에서 일괄 처리
     * 
     * 포인트:
     * - 세션 종료의 진입점을 단일화하면,
     *   로그아웃/만료/강제 로그아웃(다른 탭) 등 모든 종료 케이스를 동일 정책으로 처리 가능
     */
    const clearLocalAuth = useCallback((reason: TokensClearedReason): void => {
        clearTokens(reason)
    }, [])

    /**
     * fetchMe
     * 
     * 역할/목적:
     * - /me 응답(MyAccount)을 AuthContext가 사용하는 최소 모델(AuthUser)로 매핑
     * 
     * 정책:
     * - /me 응답은 런타임 파싱(parseAuthUserSnapshot) 후에만 AuthContext에 반영
     * - 핵심 권한 필드(role/active/emailVerified)의 계약이 깨지면 즉시 예외 처리하여,
     *   "잘못된 인증 상태"가 전역에 퍼지지 않도록 차단
     */
    const fetchMe = useCallback(async (): Promise<AuthUser> => {
        const me = await accountApi.getMyAccount()
        return parseAuthUserSnapshot(me)
    }, [])

    /**
     * 토큰 제거 이벤트 구독(onTokensCleared)
     * 
     * 역할/목적:
     * - 같은 탭/다른 탭에서 세션이 종료되면 현재 탭도 동일한 정책으로 정리
     * 
     * 동작:
     * - 세션 버전 증가(진행 중 플로우 무효화)
     * - user를 null로 초기화
     * - 인증 의존 query 캐시만 취소/제거하여, "사용자 컨텍스트가 섞이는 문제"를 예방
     * 
     * 주의:
     * - removeQueries는 캐시 정리이며, 진행 중 네트워크 취소는 transport/adapter 정책에 의존
     * - cancel 후 remove 순서로 수행하여, 늦게 도착하는 응답이 캐시를 다시 채우는 경합을 줄임
     */
    useEffect((): (() => void) => {
        const unsubCleared: () => void = onTokensCleared(() => {
            markAuthStateChanged()
            setUser(null)

            void queryClient
                .cancelQueries({
                    predicate: (query) => isAuthScopedQueryKey(query.queryKey),
                })
                .finally(() => {
                    queryClient.removeQueries({
                        predicate: (query) => isAuthScopedQueryKey(query.queryKey),
                    })
                })
        })

        return () => {
            unsubCleared()
        }
    }, [markAuthStateChanged])

    /**
     * 부트스트랩(앱 초기 세션 복구)
     * 
     * 역할/목적:
     * - 앱 시작 시 silent refresh 1회 시도 후 /me로 사용자 정보를 확정
     * 
     * 안정성 정책:
     * - runBootstrapSession은 StrictMode에서도 중복 호출을 막기 위해 in-flight Promise를 공유
     * - 세션 버전이 바뀐 경우(토큰 제거 이벤트 발생) 완료 결과를 무시
     * 
     * 주의:
     * - alive 플래그는 언마운트 이후 setState 호출을 방지하기 위한 안전장치
     */
    useEffect((): (() => void) => {
        let alive = true
        const bootstrapVersion = authStateVersionRef.current

        const boot = async (): Promise<void> => {
            try {
                const meUser: AuthUser | null = await runBootstrapSession(fetchMe, clearLocalAuth)
                if (!alive) return
                if (authStateVersionRef.current !== bootstrapVersion) return
                setUser(meUser)
            } catch {
                if (!alive) return
                setUser(null)
            } finally {
                if (alive) setIsLoading(false)
            }
        }

        void boot()

        return () => {
            alive = false
        }
    }, [fetchMe, clearLocalAuth])

    /**
     * login
     * 
     * 역할/목적:
     * - 로그인 성공 후 토큰을 적용(applyTokens)하고, /me 조회로 사용자 정보를 확정(setUser)
     * 
     * 동작(흐름):
     * 1) authApi.login(params) 호출로 토큰 발급
     * 2) applyTokens로 클라이언트 세션에 토큰 적용
     * 3) fetchMe(/me)로 사용자 확정 후 setUser
     * 4) 인증 의존 쿼리를 invalidate 하여, "새 사용자 컨텍스트" 기준으로 재평가
     * 
     * 안정성 정책:
     * - 진행 중 토큰 제거 이벤트로 세션 버전이 바뀌면 완료 결과를 무효화
     * - /me 확정 실패 시 토큰을 롤백(clearLocalAuth)하여 "부분 로그인 상태"를 남기지 않음
     */
    const login = useCallback(async (params: LoginParams): Promise<AuthUser> => {
        const flowVersion = authStateVersionRef.current

        const response = await authApi.login(params)
        if (authStateVersionRef.current !== flowVersion) {
            throw new Error("AUTH_FLOW_INVALIDATED")
        }

        /**
         * 로그인 성공 시점부터는 현재 플로우를 "최신 세대"로 승격
         * - 진행 중인 bootstrap의 지연 완료 결과가 뒤늦게 user를 덮어쓰지 못하도록 차단
         * - 이후 완료 단계에서는 이 loginVersion과 현재 세대를 비교해 stale 결과를 무시
         */
        markAuthStateChanged()
        const loginVersion = authStateVersionRef.current

        applyTokens(response.tokens)

        try {
            const meUser: AuthUser = await fetchMe()
            if (authStateVersionRef.current !== loginVersion) {
                throw new Error("AUTH_FLOW_INVALIDATED")
            }

            setUser(meUser)

            void queryClient.invalidateQueries({
                predicate: (query) => isAuthScopedQueryKey(query.queryKey),
            })

            return meUser
        } catch (error: unknown) {
            clearLocalAuth("MANUAL")
            throw error
        }
    }, [fetchMe, clearLocalAuth, markAuthStateChanged])

    /**
     * logout
     * 
     * 역할/목적:
     * - 서버 로그아웃 요청과 로컬 세션 종료를 수행
     * 
     * 정책:
     * - 서버 로그아웃이 네트워크/일시 오류로 실패하더라도, 로컬 세션 종료를 우선하여 UX 상 "즉시 로그아웃" 보장
     *
     * 동작:
     * - clearLocalAuth가 토큰 제거 이벤트를 트리거하며, user/query 정리는 토큰 제거 이벤트 구독 지점에서 일괄 처리
     */
    const logout = useCallback(async (): Promise<void> => {
        try {
            await authApi.logout()
        } catch {
            // 네트워크/일시 실패가 있어도 로컬 세션 정리를 우선
        }

        clearLocalAuth("LOGOUT")
        navigate(ROUTES.home, { replace: true })
    }, [clearLocalAuth, navigate])

    /**
     * Context value 메모이제이션
     * 
     * 역할/목적:
     * - Provider value 객체의 불필요한 재생성을 줄여 리렌더를 최소화
     * - AuthState 계약(user/isLoading/login/logout)을 안정적으로 제공
     */
    const value = useMemo<AuthState>(() => ({
        user,
        isLoading,
        login,
        logout
    }), [user, isLoading, login, logout])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}