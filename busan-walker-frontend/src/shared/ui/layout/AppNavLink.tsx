// src/shared/ui/layout/AppNavLink.tsx

/**
 * AppNavLink.tsx (Shared UI Layout - 네비게이션 링크 컴포넌트)
 *
 * 역할/목적:
 * - 헤더/모바일 메뉴 등 전역 네비게이션에서 재사용되는 활성 상태 링크 컴포넌트
 * - 활성화(isActive) 스타일 규칙을 공통화하여 네비게이션의 시각적 일관성을 유지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AppNavLinkProps  - 컴포넌트 props 타입
 *      · AppNavLink       - 네비게이션 링크 컴포넌트
 * - React Router의 NavLink를 래핑하여 isActive 판단 로직을 컴포넌트에 한정
 *   → pathname 비교 로직이 사용처로 분산되는 것을 방지
 *
 * 동작 방식:
 * - isActive 시 bg-white/20 text-white, 비활성 시 text-white/80 hover:text-white 적용
 * - end=true이면 경로가 정확히 일치할 때만 활성 처리(중첩 라우트에서의 오활성화 방지)
 * - className prop으로 호출 측에서 추가 스타일 적용 가능
 *
 * 운영 포인트:
 * - aria-label에 label을 그대로 사용하므로, label은 사용자가 이해하기 쉬운 메뉴명으로 작성
 */

import { NavLink } from "react-router-dom";

export type AppNavLinkProps = {
    to: string
    label: string
    end?: boolean
    className?: string
}

/**
 * AppNavLink
 * - 활성화(isActive) 스타일 규칙을 공통화하여 네비게이션의 시각적 일관성을 유지
 * - NavLink의 isActive 판단을 활용해, pathname 비교 로직을 컴포넌트에 분산시키지 않음
 */
export function AppNavLink({ to, label, end = false, className }: AppNavLinkProps) {
    return(
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) => {
                const base =
                    "rounded-full px-3 py-2 text-sm font-semibold transition" +
                    "focus:outline-none focus:ring-2 focus:ring-white/30"
                const active = isActive ? "bg-white/20 text-white" : "text-white/80 hover:text-white hover:bg-white/10"

                return [base, active, className].filter(Boolean).join(" ")
            }}
            aria-label={label}
        >
            {label}
        </NavLink>
    )
}
