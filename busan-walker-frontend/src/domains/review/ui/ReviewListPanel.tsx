// src/domains/review/ui/ReviewListPanel.tsx

/**
 * ReviewListPanel.tsx (UI Layer - 리뷰 목록 레이아웃 패널 컴포넌트)
 *
 * 역할/목적:
 * - 리뷰 목록의 로딩/에러/빈 목록/더보기 상태를 처리하는 레이아웃 컨테이너 컴포넌트
 * - 실제 리뷰 카드는 children 슬롯으로 주입받아 관심사를 분리
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ReviewListPanelProps - ReviewListPanel 컴포넌트 props 타입
 *      · ReviewListPanel      - 리뷰 목록 레이아웃 컴포넌트
 *
 * 동작 방식:
 * - isLoading 상태이면 로딩 패널을 표시
 * - isError이고 isEmpty이면 전체 에러 패널을 표시(재시도 버튼 포함 가능)
 * - isEmpty이면 빈 목록 메시지를 표시
 * - 목록이 있으면 children을 렌더링하고, hasNextPage이면 더보기 버튼을 표시
 *
 * 운영 포인트:
 * - emptyMessage, errorMessage 기본값은 이 파일에서 관리
 * - showEndMessageButton 옵션으로 목록 끝에 도달했을 때 버튼 표시 여부를 제어
 */
import type { ReactNode } from "react";
import { Panel } from "@/shared/ui/Panel";

export type ReviewListPanelProps = {
    isLoading: boolean
    isEmpty: boolean
    isError?: boolean
    errorMessage?: string
    onRetry?: () => void
    isFetchingNext: boolean
    hasNextPage: boolean
    onLoadMore: () => void
    children: ReactNode
    emptyMessage?: string
    showEndMessageButton?: boolean
}

/**
 * 리뷰 목록 레이아웃 패널 컴포넌트.
 *
 * - 로딩/에러/빈 목록/더보기 UI를 처리하고, 실제 목록 내용은 children으로 주입받음
 * - isLoading/isError/isEmpty 상태에 따라 각각 다른 패널을 조건부 렌더링
 */
export function ReviewListPanel({
    isLoading,
    isEmpty,
    isError = false,
    errorMessage = "리뷰를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    onRetry,
    isFetchingNext,
    hasNextPage,
    onLoadMore,
    children,
    emptyMessage = "등록된 리뷰가 없습니다.",
    showEndMessageButton = false,
}: ReviewListPanelProps) {
    if (isLoading) {
        return (
            <Panel
                as="section"
                aria-live="polite"
                aria-label="리뷰 목록 로딩 중"
                className="p-4 text-sm text-white/80"
            >
                리뷰를 불러오는 중...
            </Panel>
        )
    }

    if (isError && isEmpty) {
        return (
            <Panel
                as="section"
                aria-live="polite"
                aria-label="리뷰 목록 오류 상태"
                className="space-y-3 border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100"
            >
                <div>{errorMessage}</div>
                {onRetry ? (
                    <button
                        type="button"
                        className="rounded-2xl border border-red-200/40 bg-red-300/15 px-3 py-2 text-sm font-semibold text-red-50 hover:bg-red-300/25"
                        onClick={onRetry}
                    >
                        다시 시도
                    </button>
                ) : null}
            </Panel>
        )
    }

    if (isEmpty) {
        return (
            <Panel as="section" aria-label="리뷰 목록 빈 상태" className="p-4 text-sm text-white/80">
                {emptyMessage}
            </Panel>
        )
    }

    return (
        <div className="space-y-3">
            {isError ? (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-200/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-50">
                    <span>{errorMessage}</span>
                    {onRetry ? (
                        <button
                            type="button"
                            className="shrink-0 rounded-xl border border-amber-200/40 bg-amber-200/15 px-2 py-1 font-semibold hover:bg-amber-200/25"
                            onClick={onRetry}
                        >
                        다시 시도
                    </button>
                    ) : null}
                </div>
            ) : null}

            {children}

            {hasNextPage || showEndMessageButton ? (
                <div className="pt-2">
                    <button
                        type="button"
                        className="w-full rounded-3xl border border-white/15 bg-white/15 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-white/20 disabled:opacity-50"
                        onClick={onLoadMore}
                        disabled={!hasNextPage || isFetchingNext}
                    >
                        {hasNextPage ? (isFetchingNext ? "불러오는 중..." : "더 보기") : "마지막 리뷰입니다."}
                    </button>
                </div>
            ) : null}
        </div>
    )
}
