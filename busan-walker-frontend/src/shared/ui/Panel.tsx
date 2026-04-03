// src/shared/ui/Panel.tsx

/**
 * Panel.tsx (Shared UI - 다형성 카드/섹션 컨테이너 컴포넌트)
 *
 * 역할/목적:
 * - 화면에서 카드/섹션 컨테이너로 재사용되는 표준 패널 컴포넌트
 * - 라운드/보더/반투명 배경/블러(backdrop) 같은 공통 스타일을 한 곳에서 관리하여
 *   화면 전반의 시각적 일관성을 유지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · PanelProps  - 컴포넌트 props 타입 (외부 타입 참조용)
 *      · Panel       - 다형성 패널 컴포넌트 (전역 재사용)
 * - `as` prop으로 렌더링 태그(div/section/article/aside 등)를 상황에 맞게 선택 가능
 * - className prop으로 추가 스타일 확장/오버라이드 가능 — 기본 스타일은 항상 포함
 *
 * 동작 방식:
 * - as 기본값은 "div"; 레이아웃 역할에 맞는 시맨틱 태그를 선택해 문서 구조와 접근성을 개선
 * - ComponentPropsWithoutRef<T>를 통해 선택된 태그의 표준 props(aria-*, onClick 등)를 그대로 지원
 * - 기본 클래스(baseClassName) → 추가 className 순으로 결합하여 외부 스타일 덮어쓰기를 허용
 *
 * 운영 포인트:
 * - Panel은 "레이아웃 컨테이너" 역할만 담당
 *   → 내부 패딩/간격/헤더 구조는 화면 요구사항에 따라 상위에서 구성
 * - 기본 외형(baseClassName) 변경 시 모든 Panel 사용처에 영향이 있으므로 주의
 */

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"

/**
 * Panel
 *
 * 역할/목적:
 * - 화면에서 카드/섹션 컨테이너로 재사용되는 "표준 패널" 컴포넌트
 * - 라운드/보더/반투명 배경/블러(backdrop) 같은 공통 스타일을 한 곳에서 관리하여
 *   화면 전반의 시각적 일관성을 유지
 *
 * Polymorphic(as) 정책:
 * - `as` props로 렌더링할 HTML 태그(또는 컴포넌트)를 선택 가능
 *   예) div(기본), section, article, aside 등
 * - 레이아웃 동일하지만 의미(시맨틱)를 상황에 맞게 선택할 수 있어 접근성과 문서 구조에 유리
 *
 * 타입 설계:
 * - PanelProps는 "선택된 as 타입의 props"를 그대로 받을 수 있도록 구성
 *   - ComponentPropsWithoutRef<T>: T 요소가 받을 수 있는 표준 props(aria-*, onClick 등 포함)
 *   - Omit<..., keyof PanelOwnProps>: Panel이 자체적으로 소유한 props(as/children/className)와 충돌 방지
 * - 결과적으로 <Panel as="section" id="..." aria-label="..."> 같은 사용이 타입 레벨에서 자연스럽게 지원
 *
 * 클래스 결합 정책:
 * - baseClassName: Panel의 기본 스타일(테두리/배경/블러)을 강제 적용
 * - className: 호출 측에서 추가 확장/오버라이드가 가능하도록 base 뒤에 붙임
 *
 * 주의:
 * - Panel은 "레이아웃 컨테이너" 역할만 담당하며,
 *   내부 패딩/간격/헤더 구조 등은 화면 요구사항에 따라 상위에서 구성
 */
type PanelOwnProps<T extends ElementType> = {
    /**
     * 렌더링할 요소 타입
     * - 기본값 "div"
     */
    as?: T

    /* 패널 내부 콘텐츠 */
    children: ReactNode

    /* 추가 스타일(확장/덮어쓰기) */
    className?: string
}

export type PanelProps<T extends ElementType = "div"> = PanelOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof PanelOwnProps<T>>

export function Panel<T extends ElementType = "div">({
    as,
    children,
    className = "",
    ...rest
}: PanelProps<T>) {
    /**
     * Component
     * - as가 있으면 해당 요소로 렌더링하고, 없으면 div로 렌더링
     */
    const Component = as ?? "div"

    /**
     * baseClassName
     * - 프로젝트 전역에서 통일되는 Panel 기본 외형
     */
    const baseClassName = "rounded-3xl border border-white/15 bg-white/10 backdrop-blur"

    /**
     * 클래스 결합
     * - 기본 스타일을 항상 포함하고, className이 있으면 뒤에 추가
     */
    const combined = className ? `${baseClassName} ${className}` : baseClassName

    return (
        <Component {...rest} className={combined}>
            {children}
        </Component>
    )
}
