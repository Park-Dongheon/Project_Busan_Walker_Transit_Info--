// src/domains/auth/ui/RequireAuth.tsx

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { ROUTES } from "@/app/navigation/navigation";
import { toAuthRedirectFrom } from "@/app/navigation/authRedirect";
import { LOADING_MESSAGES } from "@/app/constants/loadingMessages";
import { LoadingState } from "@/shared/ui/LoadingState";

import { isAuthGuardExemptPath, useAuth } from "@/domains/auth/model";
import type { AuthDenyReason, AuthGuardNavigationState, AuthUser } from '../types';

type RequireAuthProps = {
    children: ReactNode

    /**
     * requireActive
     * 
     * 역할/목적:
     * - "계정 활성 상태(active)"를 필수 조건으로 요구하는 보호 라우트에서만 활성화하는 옵션
     * 
     * 정책:
     * - 기본값은 false
     * - 전 라우트에 일괄 강제하지 않고, 실제로 필요한 화면(예: 사용자 기능/작성/등록)에서만 선택적으로 적용
     * 
     * 주의:
     * - 이 검사는 클라이언트 UX 분기를 위한 것으로, 최종 차단은 서버(403 등)가 강제
     */
    requireActive?: boolean

    /**
     * requireEmailVerified
     * 
     * 역할/목적:
     * - "이메일 인증 완료(emailVerified)"를 필수 조건으로 요구하는 보호 라우트에서만 활성화하는 옵션
     * 
     * 정책:
     * - 기본값은 false
     * - 이메일 인증이 필수인 기능(예: 리뷰 작성/즐겨찾기 저장 등)에만 적용하는 UX 혼란을 줄임
     */
    requireEmailVerified?: boolean

    /**
     * allowedRoles
     * 
     * 역할/목적:
     * - 특정 역할(role)만 접근 가능한 보호 라우터에 허용 역할 목록을 전달
     * 
     * 정책:
     * - undefined 또는 빈 배열이면 "역할 제한 없음"으로 해석
     * - 역할 제한이 필요한 경우에만 명시적으로 배열을 지정해 정책 의도를 드러냄
     * 
     * 주의:
     * - role 기반 접근 제어는 서버가 최종 강제해야 하며,
     *   클라이언트의 role 값은 UX 힌트일 뿐 신뢰 대상이 아님
     */
    allowedRoles?: ReadonlyArray<AuthUser["role"]>
}

/**
 * isRoleAllowed
 * 
 * 역할/목적:
 * - allowedRoles 정책에 따라 현재 사용자 role이 허용되는지 판정
 * 
 * 정책:
 * - allowedRoles가 없거나 빈 배열이면 제한 없음(true)으로 처리
 * 
 * 포인트:
 * - 역할 제한이 없는 라우터에서도 동일 컴포넌트를 재사용할 수 있게 하여 가드 적용을 단순화
 */
function isRoleAllowed(
    userRole: AuthUser["role"],
    allowedRoles?: ReadonlyArray<AuthUser["role"]>
): boolean {
    if (!allowedRoles || allowedRoles.length === 0) return true
    return allowedRoles.includes(userRole)
}

/**
 * createRedirectState
 * 
 * 역할/목적:
 * - 가드에 의해 리다이렉트할 때 전달할 router state payload를 구성
 * 
 * 동작:
 * - denyReason: 차단 사유 코드(페이지에서 안내 문구/다음 액션 결정을 위해 사용)
 * - from: 인증 완료 후 복귀할 원래 위치(pathname/search/hash)
 * 
 * 주의:
 * - state는 새로고침/직접 URL 진입 시 사라질 수 있는 "UX 보조 정보"
 * - 최종 인가/차단은 서버 API 정책이 강제해야 하며, 이 값만으로 보안을 구현x
 */
function createRedirectState(
    denyReason: AuthDenyReason,
    from: ReturnType<typeof toAuthRedirectFrom>
): AuthGuardNavigationState {
    return { denyReason, from }
}

/**
 * RequireAuth (Route Guard for UX)
 * 
 * 역할/목적:
 * - 보호 라우터 접근을 "클라이언트 UX 관점"에서 제어하는 인증/정책 가드 컴포넌트
 * - 세션 복구가 끝나기 전에는 대기(로딩)하고, 확정 이후에는 사용자 상태/정책에 따라 로그인 페이지 또는 접근 거부 페이지로 일관되게 라우팅
 * 
 * 검사 순서(정책):
 * 1) exempt path(인증 플로우 라우터)는 가드를 우회하여 리다이렉트 루프를 방지
 * 2) isLoading 동안은 세션 복구(silent refresh + /me 확정)가 완료될 때까지 로딩 UI를 표시
 * 3) user가 null이면 로그인 페이지로 이동(unauthenticated)
 * 4) 로그인 상태라도 active/email/role 정책을 위반하면 접근 거부 페이지로 이동
 * 
 * 포인트:
 * - 비로그인(로그인 필요)과 정책 위반(접근 거부)을 분리하면,
 *   "무억을 해야 다음으로 갈 수 있는지" 사용자가 이해하기 쉬운 UX를 만들 수 있음
 * 
 * 주의(보안):
 * - 이 가드는 클라이언트 측 라우팅 제어일 뿐이며, 보안 경계가 아님
 * - 최종 인가(권한/활성/인증 여부)는 서버가 401/403으로 강제
 * 
 * 주의(적용 범위):
 * - RequireAuth는 보호 라우터에만 적용하는 것을 전제
 * - 인증 플로우 라우터(login/register 등)에 잘못 감싸면, 우회 정책으로 인해 의도치 않은 렌더가 발생 가능
 */
export default function RequireAuth({
    children,
    requireActive = false,
    requireEmailVerified = false,
    allowedRoles,
}: RequireAuthProps) {
    const { user, isLoading } = useAuth()
    const location = useLocation()

    /**
     * 예외 경로 우회
     *
     * 역할/목적:
     * - 로그인/회원가입/비밀번호 재설정/접근 거부 등 "인증 플로우 자체"가
     *   다시 가드에 막혀 무한 리다이렉트 루프가 생기는 것을 방지
     */
    if (isAuthGuardExemptPath(location.pathname)) {
        return <>{children}</>
    }

    /**
     * 세션 확정 전 로딩 처리
     *
     * 역할/목적:
     * - silent refresh + `/me` 확정이 끝나기 전에 성급하게 로그인/거부로 보내지 않게 함
     * - "로그인 상태 복구 가능성"이 있는 구간에서 UX가 흔들리지 않도록 함
     */
    if (isLoading) {
        return <LoadingState message={LOADING_MESSAGES.session} />
    }

    /**
     * 리다이렉트 복귀 경로 구성
     *
     * 역할/목적:
     * - 현재 위치(pathname/search/hash)를 복귀 정보로 구성, 로그인 또는 인증 완료 후 원래 페이지로 복귀
     */
    const from = toAuthRedirectFrom(location)

    /**
     * 비로그인 차단 → 로그인 페이지 이동
     * 
     * 정책:
     * - denyReason=unauthenticated를 전달하여 로그인 화면에서 "복귀 플로우"를 구성 가능
     */
    if (!user) {
        return (
            <Navigate
                to={ROUTES.login}
                state={createRedirectState("unauthenticated", from)}
                replace
            />
        )
    }

    /**
     * 활성 계정 요구 정책 위반 → 접근 거부 페이지 이동
     */
    if (requireActive && !user.active) {
        return (
            <Navigate
                to={ROUTES.accessDenied}
                state={createRedirectState("inactive_account", from)}
                replace
            />
        )
    }

    /**
     * 이메일 인증 요구 정책 위반 → 접근 거부 페이지 이동
     */
    if (requireEmailVerified && !user.emailVerified) {
        return (
            <Navigate
                to={ROUTES.accessDenied}
                state={createRedirectState("email_unverified", from)}
                replace
            />
        )
    }

    /**
     * 역할 제한 정책 위반 → 접근 거부 페이지 이동
     */
    if (!isRoleAllowed(user.role, allowedRoles)) {
        return (
            <Navigate
                to={ROUTES.accessDenied}
                state={createRedirectState("insufficient_role", from)}
                replace
            />
        )
    }

    /**
     * 모든 조건 통과 → 보호된 콘텐츠 렌더링
     */
    return <>{children}</>
}