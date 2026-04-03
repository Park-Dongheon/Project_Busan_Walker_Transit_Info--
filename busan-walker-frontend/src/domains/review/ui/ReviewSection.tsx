// src/domains/review/ui/ReviewSection.tsx

/**
 * ReviewSection.tsx (UI Layer - 리뷰 섹션 오케스트레이션 컴포넌트)
 *
 * 역할/목적:
 * - 리뷰 목록/정렬/상세 모달/작성 모달을 한 곳에서 조합하는 오케스트레이션 컴포넌트
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ReviewSectionProps - ReviewSection 컴포넌트 props 타입
 *      · ReviewSection      - 리뷰 섹션 컴포넌트
 *
 * 동작 방식:
 * - 서버 데이터/캐시는 react-query 훅이 담당
 * - UI 상태(정렬값, 어떤 모달이 열렸는지)는 이 컴포넌트의 로컬 상태로만 관리
 * - 내 리뷰를 별도 섹션으로 분리하여 상단 강조 표시
 * - 좋아요 토글은 중복 방지를 위해 reviewId별 pending 상태를 로컬에서 관리
 *
 * 운영 포인트:
 * - UI 상태는 이 컴포넌트에서만 관리하여 다른 페이지/기능을 오염시키지 않도록 스코프를 고정
 * - 리뷰 생성/수정 후 목록은 react-query 캐시 무효화로 자동 갱신
 */
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { ROUTES } from "@/app/navigation/navigation";
import { toAuthRedirectFrom } from "@/app/navigation/authRedirect";

import { getErrorMessage } from "@/shared/lib/apiError";
import { model as authModel } from "@/domains/auth";
import { api as reviewApi, ui as reviewUi } from "@/domains/review";
import type { ReviewCardResponse } from "@/domains/review";

export type ReviewSectionProps = {
    keyId: string
}

/**
 * 리뷰 섹션 오케스트레이션 컴포넌트.
 *
 * - 리뷰 목록/정렬/작성 모달을 하나의 섹션으로 조합
 * - 서버 상태 관리는 react-query 훅에 위임하고, UI 상태만 로컬에서 관리
 */
export function ReviewSection({ keyId }: ReviewSectionProps) {
    const { user } = authModel.useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const isAuthenticated: boolean = Boolean(user)

    // UI 상태는 이 섹션에서만 관리. 다른 페이지/기능을 오염시키지 않도록 스코프를 고정
    const [sort, setSort] = useState<reviewUi.ReviewSortValue>("createdAt,desc")
    const [formMode, setFormMode] = useState<reviewUi.ReviewFormMode | null>(null)
    const [likePendingByReviewId, setLikePendingByReviewId] = useState<Record<number, true>>({})

    const listQuery = reviewApi.useInfiniteReviewList(keyId, { size: 10, sort })
    const toggleLikeMut = reviewApi.useToggleLikeMutation(keyId)
    const reviewListErrorMessage: string = listQuery.isError
        ? getErrorMessage(listQuery.error, "리뷰 목록을 불러오지 못했습니다.")
        : ""

    const items = useMemo<ReviewCardResponse[]>(() => {
        const pages = listQuery.data?.pages ?? []

        return pages.flatMap((p) => p.content)
    }, [listQuery.data])

    // 내 리뷰 필터링(현재 로그인한 모든 리뷰)
    const myReviews = useMemo<ReviewCardResponse[]>(() => {
        if (!user) return []
        return items.filter((r) => r.authorId != null && String(r.authorId) === user.id)
    }, [items, user])

    // 내 리뷰를 제외한 나머지 리뷰
    const otherReviews = useMemo<ReviewCardResponse[]>(() => {
        if (!user) return items
        return items.filter((r) => r.authorId == null || String(r.authorId) !== user.id)
    }, [items, user])

    function isLikePending(reviewId: number): boolean {
        return Boolean(likePendingByReviewId[reviewId])
    }

    /**
     * 로그인 페이지 이동 처리 — 로그인 완료 후 현재 페이지로 복귀할 수 있도록 from 정보를 state에 담아 전달
     * - LoginPage는 state.from.pathname / state.from.search 형태를 받아 복귀 라우팅 수행
     */
    function requestLogin(message?: string): void {
        toast.info(message ?? "로그인이 필요합니다.")
        navigate(ROUTES.login, {
            state: { from: toAuthRedirectFrom(location) },
        })
    }

    /**
     * 서버 응답이 401(Unauthorized)인지를 식별.
     * - 비로그인/세션 만료/토큰 무효 등 인증 실패 케이스를 UI에서 일관된 흐름으로 처리
     */
    function isUnauthorized(error: unknown): boolean {
        return isAxiosError(error) && error.response?.status === 401
    }

    /**
     * "리뷰 작성" 진입 처리
     * - 비로그인 상태에서는 모달을 열지 않고 로그인 페이지로 유도
     * - 로그인 상태에서만 작성 모달을 열어 서버 401 메시지가 UI에 노출되는 상황을 차단
     */
    function openCreate(): void {
        if (!isAuthenticated) {
            requestLogin("리뷰 작성은 로그인 후 가능합니다.")
            return
        }

        setFormMode({ type: "create" })
    }

    /**
     * 좋아요 토글 처리
     * - 비로그인: 즉시 로그인 유도
     * - 로그인 상태에도 401: 세션 만료 케이스로 보고 로그인 유도
     * - 그 외 에러: 서버 메시지를 사용자 친화적으로 토스트로 출력
     */
    async function toggleLike(reviewId: number, nextLiked: boolean): Promise<void> {
        if (!isAuthenticated) {
            requestLogin("좋아요는 로그인 후 가능합니다.")
            return
        }

        // 같은 리뷰에 대해 현재 요청이 완료되기 전 중복 클릭을 차단
        if (isLikePending(reviewId)) return
        setLikePendingByReviewId((prev) => ({ ...prev, [reviewId]: true }))

        try {
            await toggleLikeMut.mutateAsync({ reviewId, nextLiked })
        } catch (err: unknown) {
            if (isUnauthorized(err)) {
                requestLogin("인증이 만료되었습니다. 다시 로그인해 주세요.")
                return
            }

            // getErrorMessage는 (error, fallbackMessage) 2개 인자를 요구
            toast.error(getErrorMessage(err, "좋아요 처리에 실패했습니다."))
        } finally {
            setLikePendingByReviewId((prev) => {
                if (!prev[reviewId]) return prev

                const next = { ...prev }
                delete next[reviewId]
                return next
            })
        }

    }

    return (
        <section className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">리뷰</h2>
            </div>

            <reviewUi.ReviewToolbar
                sort={sort}
                onChangeSort={(v: reviewUi.ReviewSortValue) => {
                    setSort(v)
                }}
                onOpenCreate={openCreate}
            />

            <div className="mt-4 space-y-4">
                {myReviews.length > 0 ? (
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-white/70">내 리뷰</h3>
                        <div className="space-y-3">
                            {myReviews.map((review) => (
                                <div key={review.reviewId} className="rounded-3xl border-2 border-blue-500/30 bg-blue-500/10 p-3">
                                    <reviewUi.ReviewCard
                                        item={review}
                                        keyId={keyId}
                                        isLikePending={isLikePending(review.reviewId)}
                                        onToggleLike={(reviewId: number, nextLiked: boolean) => void toggleLike(reviewId, nextLiked)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div>
                    {myReviews.length > 0 ? <h3 className="mb-2 text-sm font-semibold text-white/70">다른 리뷰</h3> : null}
                    <reviewUi.ReviewList
                        items={otherReviews}
                        keyId={keyId}
                        isLoading={listQuery.isLoading}
                        isError={listQuery.isError}
                        errorMessage={reviewListErrorMessage}
                        onRetry={() => void listQuery.refetch()}
                        isFetchingNext={listQuery.isFetchingNextPage}
                        hasNextPage={Boolean(listQuery.hasNextPage)}
                        onLoadMore={() => void listQuery.fetchNextPage()}
                        isLikePendingById={isLikePending}
                        onToggleLike={(reviewId: number, nextLiked: boolean) => void toggleLike(reviewId, nextLiked) }
                    />
                </div>
            </div>

            <reviewUi.ReviewFormModal
                keyId={keyId}
                mode={formMode}
                onClose={() => setFormMode(null)}
                onCreatedOrUpdated={() => {
                    // 리뷰 생성/수정 후 목록은 react-query 캐시 무효화로 자동 갱신
                    // 댓글은 ReviewCard 내부에서 인라인으로 펼쳐지므로 별도 상세 뷰가 필요하지 않음
                }}
            />
        </section>
    )

}
