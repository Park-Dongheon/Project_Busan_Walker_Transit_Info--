// src/domains/auth/model/authGuard.ts

import { ROUTES, type RoutePath } from "@/app/navigation/navigation";

export type {
    AuthDenyReason,
    AccessDeniedReason,
    AuthGuardNavigationState
} from '../types';

/**
 * authGuard (Exempt Path Matcher)
 * 
 * 역할/목적:
 * - 인증 가드(auth guard)가 적용되는 라우팅 흐름에서, 
 *   "가드를 우회해야 하는 경로(예외 경로)"인지 빠르게 판별하는 유틸 모듈
 * 
 * 사용 맥락:
 * - 라우트 진입 시 인증 상태에 따라 로그인/권한없음 페이지로 리다이렉트하는 흐름에서,
 *   로그인/회원가입/비밀번호 재설정 같은 "인증 플로우 자체"는 항상 접근 가능
 * 
 * 핵심 정책:
 * - 예외 경로는 반드시 가드 검사(bypass) 대상
 *   - 인증이 없으면 접근 불가한 페이지로 이동시키는 가드 로직이 로그인 페이지/권한없음 페이지에까지 적용되면 리다이렉트 루프가 발생
 *   - 예외 경로 목록은 "인증/부트스트랩/에러 처리"에 속한 페이지들로 제한
 * 
 * 성능 포인트:
 * - 예외 경로 판별은 페이지 전환마다 호출될 수 있으므로, Set 기반 membership 체크(O(1))로 수행
 * 
 * 주의:
 * - ROUTES 값이 바뀌면 예외 목록도 함께 갱신
 * - 예외 경로를 과도하게 늘리면 "가드 적용 범위"가 약해져 보안/정책 품질이 떨어질 수 있음
 */

/**
 * AUTH_GUARD_EXEMPT_LIST
 * 
 * 역할/목적:
 * - auth guard 검사에서 제외해야 하는 "절대 경로 목록(SSOT)"을 정의
 * 
 * 정책:
 * - 인증/부트스트랩 플로우에 속한 라우터는 반드시 예외 처리
 * - 예외 처리의 1차 목적은 "접근 가능성 보장"과 "리다이렉트 루프 방지"
 * 
 * 타입 안전성 포인트:
 * - `satisfies readonly RoutePath[]`로 강제하여, 
 *   목록에 ROUTES 외 임의 문자열이 들어가는 실수를 컴파일 단계에서 차단
 */
const AUTH_GUARD_EXEMPT_LIST = [
    ROUTES.login,
    ROUTES.register,
    ROUTES.passwordForgot,
    ROUTES.authPasswordReset,
    ROUTES.authEmailVerify,
    ROUTES.accessDenied
] as const satisfies readonly RoutePath[]

/**
 * AUTH_GUARD_EXEMPT_PATHS
 * 
 * 역할/목적:
 * - 예외 경로 목록을 Set으로 구성하여 membership 체크를 O(1)로 수행
 * 
 * 주의:
 * - Set에는 "정규화된 pathname"이 들어간다고 가정하므로, 조회 전에 normalizePathnameForMatch를 항상 적용
 */
const AUTH_GUARD_EXEMPT_PATHS: ReadonlySet<string> = new Set(AUTH_GUARD_EXEMPT_LIST)

/**
 * normalizePathnameForMatch
 * 
 * 역할/목적:
 * - pathname 문자열을 "안정적인 비교 형태"로 정규화하여 경로 매칭의 흔들림을 제거
 * 
 * 동작:
 * - 앞뒤 공백 제거(trim)
 * - 선행 슬래시("/") 강제
 * - 루트("/")를 제외하고 후행 슬래시들을 제거
 * 
 * 포인트:
 * - 라우터/링크/외부 딥링크 유입 등 다양한 입력 형태에서 "/login", "login", "/login/" 같은 변형을 동일 경로로 취급
 * 
 * 주의:
 * - 이 함수는 pathname(경로)만 정규화
 *   query string("?a=b")이나 hash("#/...")가 섞여 들어오는 입력은 상위에서 분리
 */
function normalizePathnameForMatch(pathname: string): string {
    const trimmed = pathname.trim()
    if (trimmed.length === 0) return ""

    const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
    if (withLeadingSlash === ROUTES.home) return ROUTES.home

    return withLeadingSlash.replace(/\/+$/, "")
}

/**
 * isAuthGuardExemptPath
 * 
 * 역할/목적:
 * - 입력 pathname이 auth guard 예외 경로인지 판별
 * 
 * 동작:
 * - pathname을 정규화한 뒤, 예외 Set에서 membership 체크
 * 
 * 반환 의미:
 * - true: 가드 적용을 우회해야 하는 경로(로그인/회원가입/재설정/권한없음 등)
 * - false: 일반 보호 경로(인증/권한 정책 적용 대상)
 */
export function isAuthGuardExemptPath(pathname: string): boolean {
    return AUTH_GUARD_EXEMPT_PATHS.has(normalizePathnameForMatch(pathname))
}