// src/shared/ui/Pagination.tsx

/**
 * Pagination.tsx (Shared UI - 페이지 이동 네비게이션 컴포넌트)
 *
 * 역할/목적:
 * - 목록 화면에서 페이지 이동 UI를 제공하는 공용 컴포넌트
 * - 처음/이전/다음/끝 버튼과 페이지 번호 버튼을 조합하여 긴 목록을 탐색
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · PaginationProps  - 컴포넌트 props 타입
 *      · Pagination       - 페이지네이션 컴포넌트
 * - page는 0-based(내부 모델)로 받고, 사용자에게 표시할 때만 1-based로 변환
 * - API/DB 응답이 0-based인 경우가 많아 표기용 보정 로직을 UI 레이어에 한정
 *
 * 동작 방식:
 * - totalPages <= 1이면 페이지 이동이 의미 없으므로 렌더링하지 않음
 * - buildPaginationItems로 페이지 버튼 목록 생성 — 총 페이지가 많으면 ellipsis로 중간 구간 축약
 * - requestPage에서 clamp를 적용하여 범위를 벗어난 요청을 방지
 *
 * 운영 포인트:
 * - 이미 현재 페이지면 onChange를 호출하지 않아 불필요한 재조회/리렌더를 줄임
 * - aria-current="page"로 스크린리더가 현재 위치를 인지하도록 지원
 * - NaN/Infinity 등 비정상 입력은 clampPage에서 안전하게 정규화
 */

import { useMemo } from "react";

/**
 * PaginationProps
 *
 * 모델 정책:
 * - page는 0-based(내부 모델)로 받음
 * - UI에서 사용자에게 보여줄 때만 1-based로 변환하여 표시
 *
 * 장점:
 * - API/DB/서버 응답이 0-based인 경우가 많아 일관된 데이터 흐름을 유지하기 쉬움
 * - 화면 표기만 1-based로 바꾸면 되므로 "표기용 보정 로직"이 UI에 한정
 */
export type PaginationProps = {
    /* 0-based 현재 페이지 */
    page: number
    /* 전체 페이지 수 (>= 0) */
    totalPages: number
    /* 페이지 이동 핸들러 (0-based) */
    onChange: (nextPage: number) => void
}

/**
 * PaginationItem
 * - 페이지 버튼 영역에 표시할 아이템 타입
 * - number: 특정 페이지 (0-based)
 * - "ellipsis": 중간 페이지 구간 생략 표시(...)
 */
type PaginationItem = number | "ellipsis"

/**
 * clampPage
 *
 * 목적:
 * - 페이지 인덱스가 범위를 벗어나거나, NaN/Infinity 같은 비정상 값이 들어와도
 *   안전한 정수 페이지로 정규화
 *
 * 정책:
 * - 유한 값이 아니면 min 반환
 * - 소수는 Math.floor로 내림(페이지 인덱스는 정수만 유효)
 * - 최종적으로 [min, max] 범위로 clamp
 */
function clampPage(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min
    return Math.min(max, Math.max(min, Math.floor(value)))
}

/**
 * buildPaginationItems
 *
 * 목적:
 * - totalPages와 현재 페이지를 기반으로 "페이지 버튼 목록"을 생성
 *
 * 노출 정책:
 * - totalPages가 작으면(<= 7) 전체 페이지를 모두 노출
 * - totalPages가 크면:
 *   1) 첫 페이지(0)와 마지막 페이지(last)는 항상 노출
 *   2) 현재 페이지 주변(siblings) 범위를 노출
 *   3) 그 외 중간 구간은 "ellipsis"로 축약
 *
 * UX 포인트:
 * - "ellipsis"는 연속해서 중복 노출되지 않도록 방지
 * - current가 리스트 범위를 벗어나더라도 clamp하여 안정적인 결과
 */
function buildPaginationItems(page: number, totalPages: number): PaginationItem[] {
    const safeTotalPages: number = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0
    if (safeTotalPages <= 0) return []
    if (safeTotalPages <= 7) return Array.from({ length: safeTotalPages }, (_, i) => i)

    const last: number = safeTotalPages - 1
    const safePage: number = clampPage(page, 0, last)

    /* 현재 페이지 주변에 보여줄 이웃 페이지 수(좌/우) */
    const siblings: number = 2

    /* 0, last는 항상 노출하므로, 중간 구간의 실제 후보 범위를 1..last-1로 제한 */
    const left: number = Math.max(1, safePage - siblings)
    const right: number = Math.min(last - 1, safePage + siblings)

    const items: PaginationItem[] = []

    /**
     * pushPage / pushEllipsis
     * - 동일 값이 연속으로 들어오는 것을 방지하여 결과 목록을 안정화
     * - 특히 ellipsis는 중복 표시가 UX를 해치므로 단일화
     */
    function pushPage(p: number): void {
        if (items[items.length - 1] === p) return
        items.push(p)
    }

    function pushEllipsis(): void {
        if (items[items.length - 1] === "ellipsis") return
        items.push("ellipsis")
    }

    /* 첫 페이지는 항상 노출 */
    pushPage(0)

    /**
     * 시작 구간 처리
     * - left가 1보다 크면(즉, 0 다음 페이지가 멀면) 중간을 ...로 축약
     * - left가 1이면 자연스럽게 1부터 이어서 노출
     */
    if (left > 1) {
        pushEllipsis()
    } else {
        for (let i = 1; i < left; i += 1) pushPage(i)
    }

    /* 현재 페이지 주변(왼쪽~오른쪽) 노출 */
    for (let i = left; i <= right; i += 1) pushPage(i)

    /**
     * 끝 구간 처리
     * - right가 last-1보다 작으면 중간 구간이 남으므로 ...로 축약
     * - right가 last-1이면 자연스럽게 last 전까지 이어서 노출
     */
    if (right < last - 1) {
        pushEllipsis()
    } else {
        for (let i = right + 1; i < last; i += 1) pushPage(i)
    }

    /* 마지막 페이지는 항상 노출 */
    pushPage(last)
    return items
}

/**
 * Pagination
 *
 * 역할/목적:
 * - 목록 화면에서 페이지 이동 UI를 제공하는 공용 컴포넌트
 *
 * 동작 정책:
 * - page는 0-based로 받되, 버튼 라벨은 1-based로 표시
 * - "처음/이전/다음/끝" 버튼을 제공해 긴 목록에서도 빠르게 이동 가능
 * - totalPages <= 1이면 페이지 이동 자체가 의미 없으므로 렌더링하지 않음
 *
 * 접근성 포인트:
 * - nav에 aria-label로 영역 의미를 제공
 * - 현재 페이지 버튼에 aria-current="page"를 부여해 스크린리더가 현재 위치를 인지
 *
 * 안전성 포인트:
 * - requestPage에서 clamp를 적용해 범위를 벗어난 요청을 방지
 * - 이미 현재 페이지면 onChange를 호출하지 않아 불필요한 재조회/리렌더를 줄임
 */
export function Pagination({ page, totalPages, onChange }: PaginationProps) {
    const safeTotalPages: number = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0
    const lastPage: number = Math.max(0, safeTotalPages - 1)
    const safePage: number = clampPage(page, 0, lastPage)
    const canPrev: boolean = safePage > 0
    const canNext: boolean = safePage < lastPage

    /**
     * requestPage
     * - 외부로 페이지 이동을 요청하는 단일 엔트리 포인트
     * - clamp + 동일 페이지 요청 무시 정책으로 안정적인 동작을 보장
     */
    function requestPage(nextPage: number): void {
        const next = clampPage(nextPage, 0, lastPage)
        if (next === safePage) return
        onChange(next)
    }

    /**
     * items
     * - 현재 페이지/전체 페이지 수가 바뀔 때만 페이지 버튼 목록을 재계산
     */
    const items: PaginationItem[] = useMemo(() => {
        return buildPaginationItems(safePage, safeTotalPages)
    }, [safePage, safeTotalPages])

    /* 페이지가 0~1개면 네비게이션 자체가 의미가 없으므로 렌더링하지 않음 */
    if (safeTotalPages <= 1) return null

    return (
        <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="페이지네이션">
            <button type="button"
                    className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 backdrop-blur disabled:opacity-50"
                    onClick={() => requestPage(0)}
                    disabled={!canPrev}
                    aria-label="첫 페이지">
                처음
            </button>

            <button type="button"
                    className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 backdrop-blur disabled:opacity-50"
                    onClick={() => requestPage(safePage - 1)}
                    disabled={!canPrev}
                    aria-label="이전 페이지">
                이전
            </button>

            {items.map((it, idx) => {
                if (it === "ellipsis") {
                    return (
                        <span key={`ellipsis-${idx}`}
                              className="px-2 text-sm text-white/60">
                            ...
                        </span>
                    )
                }

                const p: number = it
                const active: boolean = p === safePage

                return (
                    <button key={p}
                            type="button"
                            className={[
                                "rounded-lg border px-3 py-2 text-sm backdrop-blur",
                                active ? "border-white/35 bg-white/20 text-white"
                                       : "border-white/15 bg-white/10 text-white/80 hover:bg-white/15",
                            ].join(" ")}
                            onClick={() => requestPage(p)}
                            aria-current={active ? "page" : undefined}>
                        {p + 1}
                    </button>
                )
            })}

            <button type="button"
                    className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 backdrop-blur disabled:opacity-50"
                    onClick={() => requestPage(safePage + 1)}
                    disabled={!canNext}
                    aria-label="다음 페이지">
                다음
            </button>

            <button type="button"
                    className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 backdrop-blur disabled:opacity-50"
                    onClick={() => requestPage(lastPage)}
                    disabled={!canNext}
                    aria-label="마지막 페이지">
                끝
            </button>
        </nav>
    )

}
