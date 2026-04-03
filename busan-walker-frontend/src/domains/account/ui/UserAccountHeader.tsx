// src/domains/account/ui/UserAccountHeader.tsx

/**
 * UserAccountHeader (마이페이지 헤더 UI 컴포넌트)
 *
 * 역할/목적:
 * - 마이페이지 최상단에 표시되는 헤더로, 계정 활성/비활성 상태를 배지로 시각화
 *
 * 공개 정책 / 설계 원칙:
 * - Presentational 컴포넌트: 상태 표현만 담당하고 계정 데이터 조회/변경 로직은 상위 컨테이너에서 처리
 *
 * 동작 방식:
 * - active prop에 따라 배지 색상(에메랄드/로즈)을 조건부 클래스로 전환
 *
 * 운영 포인트:
 * - 배지 문구나 스타일 변경은 이 파일에서만 수정
 */

type UserAccountHeaderProps = {
    /** true이면 "계정 활성" 배지(에메랄드), false이면 "계정 비활성" 배지(로즈)를 표시 */
    active: boolean
}

/**
 * 마이페이지 상단 헤더 컴포넌트.
 *
 * - 계정 활성/비활성 상태를 색상 배지로 표시
 * - 계정 데이터 조회/변경 로직은 상위 컨테이너가 담당
 */
export function UserAccountHeader({ active }: UserAccountHeaderProps) {
    return (
        <header className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-white">마이페이지</h2>
                    <p className="mt-1 text-sm text-white/75">
                        계정 정보, 비밀번호, 계정 상태를 관리할 수 있습니다.
                    </p>
                </div>
                <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        active
                            ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                            : "border-rose-300/40 bg-rose-500/20 text-rose-100"
                    }`}
                >
                    계정 {active ? "활성" : "비활성"}
                </span>
            </div>
        </header>
    )
}