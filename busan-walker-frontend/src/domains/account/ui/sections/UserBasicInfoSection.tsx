// src/domains/account/ui/sections/UserBasicInfoSection.tsx

/**
 * UserBasicInfoSection (기본 계정 정보 섹션 컴포넌트)
 *
 * 역할/목적:
 * - 이메일·역할·이메일 인증 상태를 읽기 전용으로 표시하는 마이페이지 섹션
 * - 표시 이름 수정 폼 등 추가 UI는 children으로 주입받아 확장
 *
 * 공개 정책 / 설계 원칙:
 * - Presentational 컴포넌트: 데이터 표시만 담당하고 수정 요청 로직은 상위 컨테이너가 처리
 *
 * 동작 방식:
 * - emailVerified 값에 따라 "완료" / "미완료" 문자열로 분기하여 표시
 * - Panel 공유 컴포넌트를 사용해 섹션 레이아웃을 일관되게 유지
 *
 * 운영 포인트:
 * - 이메일 인증 관련 문구나 역할 표시 방식 변경은 이 파일에서 수정
 */
import type { ReactNode } from "react";
import { Panel } from "@/shared/ui/Panel";

type UserBasicInfoSectionProps = {
    /** 계정 이메일 주소 (읽기 전용) */
    email: string
    /** 계정 역할 문자열 (예: "ADMIN", "MEMBER") */
    role: string
    /** 이메일 인증 완료 여부 */
    emailVerified: boolean
    /** 표시 이름 수정 폼 등 추가 UI를 주입하는 슬롯 */
    children: ReactNode
}

/**
 * 기본 계정 정보(이메일/역할/이메일 인증 상태)를 표시하는 마이페이지 섹션.
 *
 * - 이메일, 역할, 이메일 인증 상태는 읽기 전용으로 표시
 * - 표시 이름 수정 폼 등 추가 UI는 children 슬롯으로 주입
 */
export function UserBasicInfoSection({
    email,
    role,
    emailVerified,
    children,
}: UserBasicInfoSectionProps) {
    return (
        <Panel as="section" aria-label="기본 정보" className="p-5 shadow-sm">
            <h3 className="text-base font-semibold text-white">기본 정보</h3>
            <p className="mt-1 text-xs text-white/70">
                이메일은 변경할 수 없으며, 표시 이름은 수정할 수 있습니다.
            </p>

            <div className="mt-4 space-y-3">
                <div>
                    <p className="text-xs text-white/60">이메일</p>
                    <p className="text-sm font-medium text-white">{email}</p>
                </div>
                <div>
                    <p className="text-xs text-white/60">역할</p>
                    <p className="text-sm text-white">{role}</p>
                </div>
                <div>
                    <p className="text-xs text-white/60">이메일 인증</p>
                    <p className="text-sm text-white">{emailVerified ? "완료" : "미완료"}</p>
                </div>
            </div>

            {children}
        </Panel>
    )
}