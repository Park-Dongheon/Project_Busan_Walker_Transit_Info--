// src/pages/AccessDeniedPage.tsx

import { Link, useLocation } from "react-router-dom"
import { ROUTES } from "@/app/navigation/navigation"
import type { AccessDeniedReason, AuthGuardNavigationState } from "@/domains/auth"

/**
 * AccessDeniedPage.tsx (Page - 접근 거부 페이지)
 *
 * 역할/목적:
 * - 인증 가드(RequireAuth 등)가 접근을 차단했을 때 표시하는 "접근 거부" 페이지
 * - location.state에서 denyReason을 읽어 차단 이유에 맞는 메시지를 표시
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · AccessDeniedPage  - 접근 거부 페이지 컴포넌트
 *
 * 동작 방식:
 * - location.state?.denyReason이 알려진 AccessDeniedReason이면 사유에 맞는 메시지를 표시
 * - 알 수 없는 denyReason이면 DEFAULT_MESSAGE(일반 접근 거부)로 폴백
 * - 홈 / 로그인 페이지로 이동하는 복구 링크를 제공
 *
 * 운영 포인트:
 * - 클라이언트 측 가드는 UX 개선 목적임을 명시하는 안내 문구 포함
 *   (최종 인가 권한은 백엔드 API가 담당해야 함을 개발자에게 상기)
 * - ACCESS_DENY_REASON_TEXT: 이유 코드별 제목/설명을 중앙에서 관리하여 일관성 유지
 */

const DEFAULT_MESSAGE = {
    title: "Access denied",
    description: "You do not have permission to access this page.",
}

const ACCESS_DENY_REASON_TEXT: Record<AccessDeniedReason, { title: string; description: string }> = {
    inactive_account: {
        title: "Account is inactive",
        description: "This account is currently inactive. Contact support or an administrator.",
    },
    email_unverified: {
        title: "Email verification required",
        description: "Verify your email address before using this feature.",
    },
    insufficient_role: {
        title: "Insufficient permissions",
        description: "Your current role does not have access to this page.",
    },
}

/**
 * isKnownDenyReason
 *
 * - location.state에서 읽은 denyReason이 알려진 AccessDeniedReason인지 타입 가드로 확인
 * - 알 수 없는 값이면 기본 메시지로 폴백하여 예외 상황에서도 안전하게 렌더링
 */
function isKnownDenyReason(value: unknown): value is AccessDeniedReason {
    return value === "inactive_account" || value === "email_unverified" || value === "insufficient_role"
}

/**
 * AccessDeniedPage
 *
 * 역할/목적:
 * - 접근 거부 시 사유에 맞는 메시지와 복구 링크를 표시하는 컴포넌트
 */
export default function AccessDeniedPage() {
    const location = useLocation() as { state?: AuthGuardNavigationState }
    const denyReason = location.state?.denyReason

    // 알려진 사유면 사유별 메시지, 그 외 unknown 상태면 기본 메시지로 폴백
    const message = isKnownDenyReason(denyReason)
        ? ACCESS_DENY_REASON_TEXT[denyReason]
        : DEFAULT_MESSAGE

    return (
        <div className="mx-auto max-w-2xl space-y-4 py-12 text-white">
            <h1 className="text-2xl font-black tracking-tight">{message.title}</h1>
            <p className="text-sm text-white/80">{message.description}</p>

            <p className="text-xs text-white/60">
                Client-side guard improves UX only. Final authorization must be enforced by backend APIs.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
                <Link
                    to={ROUTES.home}
                    className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
                >
                    Go Home
                </Link>
                <Link
                    to={ROUTES.login}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15"
                >
                    Go Login
                </Link>
            </div>
        </div>
    )
}
