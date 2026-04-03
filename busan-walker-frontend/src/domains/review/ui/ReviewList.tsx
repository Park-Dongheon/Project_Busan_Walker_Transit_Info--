// src/domains/review/ui/ReviewList.tsx

/**
 * ReviewList.tsx (UI Layer - 리뷰 목록 컴포넌트)
 *
 * 역할/목적:
 * - ReviewCard 목록과 ReviewListPanel(로딩/에러/더보기 레이아웃)을 조합하는 합성 컴포넌트
 * - 목록 데이터와 페이징 이벤트를 외부에서 주입받아 화면에 렌더링
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ReviewListProps  - ReviewList 컴포넌트 props 타입
 *      · ReviewList       - 리뷰 목록 컴포넌트
 *
 * 동작 방식:
 * - 데이터/상태 관리는 상위 컴포넌트(ReviewSection 등)가 담당하고,
 *   이 컴포넌트는 렌더링만 책임
 * - 각 ReviewCard에 좋아요 pending 상태와 토글 핸들러를 전달
 */

import type { ReviewCardResponse } from "@/domains/review";
import { ui as reviewUi } from "@/domains/review";

export type ReviewListProps = {
    items: ReviewCardResponse[]
    keyId: string
    isLoading: boolean
    isError?: boolean
    errorMessage?: string
    onRetry?: () => void
    isFetchingNext: boolean
    hasNextPage: boolean
    onLoadMore: () => void
    isLikePendingById: (reviewId: number) => boolean
    onToggleLike: (reviewId: number, nextLiked: boolean) => void
}

/**
 * 리뷰 카드 목록을 렌더링하는 컴포넌트
 *
 * - ReviewListPanel로 로딩/에러/빈 목록/더보기 UI를 처리하고,
 *   children으로 ReviewCard를 주입하여 관심사를 분리
 */
export function ReviewList({
    items,
    keyId,
    isLoading,
    isError = false,
    errorMessage,
    onRetry,
    isFetchingNext,
    hasNextPage,
    onLoadMore,
    isLikePendingById,
    onToggleLike,
}: ReviewListProps) {
    return (
        <reviewUi.ReviewListPanel
            isLoading={isLoading}
            isEmpty={items.length === 0}
            isError={isError}
            errorMessage={errorMessage}
            onRetry={onRetry}
            isFetchingNext={isFetchingNext}
            hasNextPage={hasNextPage}
            onLoadMore={onLoadMore}
            showEndMessageButton={false}
        >
            {items.map((r) => (
                <reviewUi.ReviewCard
                    key={r.reviewId}
                    item={r}
                    keyId={keyId}
                    isLikePending={isLikePendingById(r.reviewId)}
                    onToggleLike={onToggleLike}
                />
            ))}
        </reviewUi.ReviewListPanel>
    )
}
