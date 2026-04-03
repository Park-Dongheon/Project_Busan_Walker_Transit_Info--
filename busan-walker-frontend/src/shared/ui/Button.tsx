// src/shared/ui/Button.tsx

/**
 * Button.tsx (Shared UI - 공통 버튼 컴포넌트)
 *
 * 역할/목적:
 * - 프로젝트 전역에서 재사용하는 표준 버튼 컴포넌트
 * - variant/size/fullWidth/loading 같은 UI 정책을 props로 통일해,
 *   화면마다 클래스 문자열을 복붙하지 않고 일관된 스타일/동작을 유지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ButtonProps  - 버튼 컴포넌트 props 타입 (외부 확장/타입 참조용)
 *      · Button       - forwardRef 버튼 컴포넌트 (전역 재사용)
 * - 스타일은 BASE/VARIANT/SIZE 세 레이어로 분리하여 변경 영향을 최소화
 * - type 기본값을 "button"으로 고정해 폼 내 의도치 않은 submit 방지
 *
 * 동작 방식:
 * - loading=true이면 disabled 상태로 간주하고 aria-busy를 활성화
 * - className prop으로 호출 측에서 스타일 확장/덮어쓰기 가능
 * - forwardRef로 부모가 button DOM을 직접 참조 가능
 *
 * 운영 포인트:
 * - loading 중 onClick은 disabled로 인해 발생하지 않음(중복 요청 방지 의도)
 * - loadingText 미지정 시 children을 그대로 표시하므로,
 *   스피너/문구가 필요하다면 호출 측에서 loadingText를 반드시 전달
 */

import { forwardRef, type ButtonHTMLAttributes } from "react"

/**
 * Button (Design System Component)
 *
 * 역할/목적:
 * - 프로젝트 전역에서 재사용하는 표준 버튼 컴포넌트
 * - variant/size/fullWidth/loading 같은 UI 정책을 props로 통일해,
 *   화면마다 클래스 문자열을 복붙하지 않고 일관된 스타일/동작을 유지
 *
 * 스타일 정책:
 * - BASE_CLASS_NAME: 공통 레이아웃(정렬/라운드/폰트/전환) + 접근성(focus-visible ring) + disabled 처리
 * - VARIANT_CLASS_NAME: 색상/테두리/호버 정책을 variant 단위로 분리
 * - SIZE_CLASS_NAME: 패딩/폰트 크기를 size 단위로 분리
 * - className: 호출 측에서 추가 스타일을 "마지막에" 합쳐 덮어쓰기/확장이 가능
 *
 * 동작 정책:
 * - type 기본값을 "button"으로 강제해, 폼 내부에서 의도치 않은 submit을 방지
 * - loading=true이면 사용자 입력을 막기 위해 disabled 상태로 간주
 * - loading 상태에서는 aria-busy를 제공해 스크린리더가 "처리 중" 상태를 인지
 *
 * 주의:
 * - loading 중에도 onClick 등 이벤트는 disabled로 인해 발생하지 않음(의도적 UX/중복 요청 방지)
 * - loadingText가 없으면 children을 그대로 보여주므로,
 *   UX 요구가 "항상 로딩 문구/스피너 표시"라면 호출 측에서 loadingText를 넘기거나 children을 구성
 * - button에 전달되는 표준 속성(ButtonHTMLAttributes)은 ...props로 그대로 전달되며, aria-* / data-* 등도 함께 내려갈 수 있음
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ButtonSize = "sm" | "md" | "lg"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    /**
     * 버튼 시각 스타일 프리셋
     * - primary/secondary/ghost/danger 중 선택
     */
    variant?: ButtonVariant

    /**
     * 버튼 크기 프리셋
     * - 패딩/폰트 크기를 제어
     */
    size?: ButtonSize

    /**
     * 컨테이너 폭을 가득 채우는지 여부
     */
    fullWidth?: boolean

    /**
     * 로딩 상태(요청 진행 중)
     * - true이면 disabled와 동일하게 동작하며 aria-busy가 활성화
     */
    loading?: boolean

    /**
     * 로딩 상태에서 표시할 텍스트(선택)
     * - 미지정 시 children을 그대로 렌더링
     */
    loadingText?: string
}

/**
 * 공통 클래스
 * - focus-visible: 키보드 포커스 UX를 개선(마우스 클릭 시 불필요한 링을 줄임)
 * - disabled: 클릭 불가 + 시각적 비활성화
 */
const BASE_CLASS_NAME =
    "inline-flex items-center justify-center rounded-2xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-60"

/**
 * variant 별 클래스 매핑
 * - "색상/테두리/호버" 정책을 버튼 외부로 분리해 재사용성과 일관성을 확보
 */
const VARIANT_CLASS_NAME: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border border-white/20 bg-white/10 text-white hover:bg-white/20",
    ghost: "border border-white/15 bg-white/15 text-white hover:bg-white/20",
    danger: "bg-red-600 text-white hover:bg-red-700",
}

/**
 * size 별 클래스 매핑
 * - 패딩/폰트 크기를 통일하여 버튼 크기 규격을 일정하게 유지
 */
const SIZE_CLASS_NAME: Record<ButtonSize, string> = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-4 py-3 text-base",
}

/**
 * forwardRef
 * - 부모 컴포넌트에서 button DOM ref가 필요할 때(포커스 제어/측정 등) 사용 가능
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = "primary",
        size = "md",
        className = "",
        type = "button",
        disabled,
        fullWidth = false,
        loading = false,
        loadingText,
        children,
        ...props
    },
    ref
) {
    /**
     * 비활성화 정책
     * - disabled가 명시되었거나 loading 중이면 버튼을 비활성화
     * - 로딩 중 중복 클릭/중복 요청을 막는 것이 주 목적
     */
    const isDisabled = Boolean(disabled || loading)

    /**
     * 클래스 조합 정책
     * - 공통(BASE) → 크키(SIZE) → 변형(VARIANT) → 옵션(fullWidth) → 추가 className 순으로 결합
     * - 마지막에 className을 붙여 호출 측에서 일부 스타일을 덮어쓸 수 있게 함
     */
    const combined = [
        BASE_CLASS_NAME,
        SIZE_CLASS_NAME[size],
        VARIANT_CLASS_NAME[variant],
        fullWidth ? "w-full" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ")

    return (
        <button
            ref={ref}
            type={type}
            disabled={isDisabled}
            className={combined}
            aria-busy={loading || undefined}
            {...props}
        >
            {/* 로딩 상태에서는 loadingText가 있으면 우선 표시하고, 없으면 기존 children을 유지 */}
            {loading ? loadingText ?? children : children}
        </button>
    )
})
