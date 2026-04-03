// src/domains/review/ui/ReviewToolbar.tsx

/**
 * ReviewToolbar.tsx (UI Layer - 리뷰 정렬/작성 툴바 컴포넌트)
 *
 * 역할/목적:
 * - 리뷰 목록 화면 상단에 정렬 선택 드롭다운과 리뷰 작성 버튼을 제공하는 툴바 컴포넌트
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ReviewSortValue    - 리뷰 정렬 기준 유니온 타입
 *      · ReviewToolbarProps - ReviewToolbar 컴포넌트 props 타입
 *      · ReviewToolbar      - 리뷰 툴바 컴포넌트
 *
 * 동작 방식:
 * - Presentational 컴포넌트: 정렬 변경 및 작성 버튼 클릭 이벤트를 콜백으로 위임
 * - 작성 버튼 클릭 정책(로그인 여부 확인 등)은 상위 컨테이너에서 처리
 *
 * 운영 포인트:
 * - REVIEW_SORT_OPTIONS 배열에 정렬 옵션을 추가/삭제하여 드롭다운 목록을 관리
 * - ReviewSortValue에 새 정렬 기준을 추가할 경우 백엔드 정렬 파라미터와 일치하는지 확인
 */
import { Button } from "@/shared/ui/Button";
import { Listbox, type ListboxOption } from "@/shared/ui/Listbox";

/** 리뷰 목록 정렬 기준 유니온 타입 */
export type ReviewSortValue = "createdAt,desc" | "createdAt,asc" | "rating,desc"

export type ReviewToolbarProps = {
    /** 현재 선택된 정렬 기준 */
    sort: ReviewSortValue
    /** 정렬 기준 변경 시 호출되는 콜백 */
    onChangeSort: (v: ReviewSortValue) => void
    /** 리뷰 작성 버튼 클릭 시 호출되는 콜백 (로그인 여부 등 정책은 상위에서 처리) */
    onOpenCreate: () => void
}

const REVIEW_SORT_OPTIONS: readonly ListboxOption<ReviewSortValue>[] = [
    { label: "최신순", value: "createdAt,desc" },
    { label: "오래된순", value: "createdAt,asc" },
    { label: "평점 높은순", value: "rating,desc" },
]

/**
 * 리뷰 정렬/작성 툴바 컴포넌트.
 *
 * - 정렬 드롭다운과 리뷰 작성 버튼을 표시
 * - 정렬 변경 및 작성 클릭 이벤트는 콜백으로 위임하며, 정책 처리는 상위 컨테이너가 담당
 */
export function ReviewToolbar({ sort, onChangeSort, onOpenCreate }: ReviewToolbarProps) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <label htmlFor="reviewSort" className="text-sm text-white/80">정렬</label>

                <div>
                    <Listbox<ReviewSortValue>
                        id="reviewSort"
                        value={sort}
                        onChange={onChangeSort}
                        options={REVIEW_SORT_OPTIONS}
                        buttonClassName="appearance-none pr-8 rounded-xl border border-white/15 bg-white/15 px-3 py-2 text-sm text-white text-left w-40"
                        listClassName="absolute mt-2 w-40 max-h-52 overflow-auto rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur z-50"
                    />
                </div>
            </div>

            <Button variant="primary" size="md" className="rounded-xl" onClick={onOpenCreate}>리뷰 작성</Button>
        </div>
    )
}
