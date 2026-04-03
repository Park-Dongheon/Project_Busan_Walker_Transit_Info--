// src/domains/account/ui/sections/UserAccountStatusSection.tsx

/**
 * UserAccountStatusSection (계정 활성/비활성 전환 섹션 컴포넌트)
 *
 * 역할/목적:
 * - 계정의 현재 활성 상태를 표시하고, 활성/비활성 전환 버튼을 제공하는 마이페이지 섹션
 *
 * 공개 정책 / 설계 원칙:
 * - Presentational 컴포넌트: 버튼 클릭 이벤트를 onToggle로 위임하며 상태 전환 로직은 담당 x
 * - 확인 다이얼로그·상태 변경 API 호출·로그아웃 정책은 상위 컨테이너에서 처리
 *
 * 동작 방식:
 * - active 값에 따라 버튼 색상(위험/보조)과 라벨("계정 비활성화" / "계정 활성화")을 전환
 * - isPending이 true이면 버튼을 로딩 상태로 표시하여 중복 클릭을 방지
 *
 * 운영 포인트:
 * - 비활성화 시 즉시 로그아웃 등 정책 안내 문구는 이 파일의 description 텍스트를 수정
 */
import { Panel } from "@/shared/ui/Panel";
import { Button } from "@/shared/ui/Button";

type UserAccountStatusSectionProps = {
    /** 현재 계정 활성 상태 */
    active: boolean
    /** 상태 변경 API 요청이 진행 중인지 여부 (로딩 표시 및 중복 클릭 차단에 사용) */
    isPending: boolean
    /** 활성/비활성 전환 버튼 클릭 시 호출되는 콜백 */
    onToggle: () => void
}

/**
 * 계정 활성/비활성 전환 섹션 컴포넌트.
 *
 * - 현재 상태와 전환 버튼을 표시
 * - 확인 다이얼로그·API 요청·로그아웃 정책은 상위 컨테이너에서 처리
 */
export function UserAccountStatusSection({
    active,
    isPending,
    onToggle,
}: UserAccountStatusSectionProps) {
    return (
        <Panel as="section" aria-label="계정 상태" className="p-5 shadow-sm">
            <h3 className="text-base font-semibold text-white">계정 상태</h3>
            <p className="mt-1 text-xs text-white/70">
                계정을 비활성화하면 바로 로그아웃됩니다. 사용자가 직접 비활성화한 경우 다시 로그인하면 자동으로 활성화되고,
                관리자에 의한 비활성화인 경우 별도의 확인이 필요합니다.
            </p>

            <div className="mt-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-white">
                        계정 상태: {active ? "활성" : "비활성"}
                    </p>
                </div>
                <Button
                    type="button"
                    onClick={onToggle}
                    variant={active ? "danger" : "secondary"}
                    loading={isPending}
                    loadingText="처리 중..."
                    className={
                        active
                            ? "border border-red-300/40 bg-red-500/30 hover:bg-red-500/40"
                            : "border border-emerald-300/40 bg-emerald-500/25 hover:bg-emerald-500/35"
                    }
                >
                    {active ? "계정 비활성화" : "계정 활성화"}
                </Button>
            </div>
        </Panel>
    )
}