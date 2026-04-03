// src/domains/account/ui/sections/UserPasswordSection.tsx

/**
 * UserPasswordSection (비밀번호 변경 섹션 컴포넌트)
 *
 * 역할/목적:
 * - 비밀번호 정책 설명을 표시하고, 비밀번호 변경 폼을 children으로 주입받는 마이페이지 섹션
 *
 * 공개 정책 / 설계 원칙:
 * - Presentational 컴포넌트: 정책 문구 표시 및 슬롯 레이아웃만 담당
 * - 비밀번호 변경 요청/검증/로그아웃 정책은 상위 컨테이너에서 처리
 *
 * 동작 방식:
 * - passwordPolicyDescription prop으로 정책 설명 문구를 외부에서 주입받아 표시
 * - 비밀번호 변경 폼은 children 슬롯으로 주입
 *
 * 운영 포인트:
 * - 비밀번호 정책 문구 변경은 이 컴포넌트를 호출하는 상위에서 prop 값을 수정
 */
import type { ReactNode } from "react";
import { Panel } from "@/shared/ui/Panel";

type UserPasswordSectionProps = {
    /** 비밀번호 정책 설명 문구 (예: "영문 대소문자, 숫자, 특수문자 포함 8자 이상") */
    passwordPolicyDescription: string
    /** 비밀번호 변경 폼 등 입력 UI를 주입하는 슬롯 */
    children: ReactNode
}

/**
 * 비밀번호 변경 섹션 컴포넌트.
 *
 * - 비밀번호 정책 설명을 표시하고, 입력 폼은 children 슬롯으로 주입
 * - 변경 요청/검증/로그아웃 정책은 상위 컨테이너에서 처리
 */
export function UserPasswordSection({
    passwordPolicyDescription,
    children,
}: UserPasswordSectionProps) {
    return (
        <Panel as="section" aria-label="비밀번호 변경" className="p-5 shadow-sm">
            <h3 className="text-base font-semibold text-white">비밀번호 변경</h3>
            <p className="mt-1 text-xs text-white/70">{passwordPolicyDescription}</p>
            {children}
        </Panel>
    )
}