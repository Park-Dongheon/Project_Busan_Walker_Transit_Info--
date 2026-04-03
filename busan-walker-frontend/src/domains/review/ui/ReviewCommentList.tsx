// src/domains/review/ui/ReviewCommentList.tsx

import { useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { isAxiosError } from "axios"
import { toast } from "sonner"
import { ROUTES } from "@/app/navigation/navigation"
import { toAuthRedirectFrom } from "@/app/navigation/authRedirect"
import { api as reviewApi, lib as reviewLib, ui as reviewUi } from "@/domains/review"
import type { ReviewCommentResponse } from "@/domains/review"
import { getErrorMessage } from "@/shared/lib/apiError"
import { model as authModel } from "@/domains/auth"

/**
 * ReviewCommentList.tsx (UI Layer - 리뷰 댓글 목록 컨테이너 컴포넌트)
 *
 * 역할/목적:
 * - 특정 리뷰의 댓글 목록 조회, 댓글 추가, 댓글 삭제를 처리하는 컨테이너 컴포넌트
 * - 인증 상태에 따라 입력/삭제 권한을 분기하고, 미인증 시 로그인으로 안내
 *
 * 공개 정책 / 설계 원칙:
 * - export: ReviewCommentList (named export), ReviewCommentListProps (type export)
 * - 댓글 목록 UI 렌더링은 ReviewCommentForm(입력) + CommentItem(단건) 로 분리
 * - 비즈니스 로직(인증 판단, 권한 체크, 에러 처리)은 이 컨테이너가 담당
 *
 * 동작 방식:
 * - useInfiniteReviewComments로 무한 스크롤(더보기 버튼) 방식으로 조회
 * - 댓글 추가 성공 시 목록/상세 캐시를 무효화해 최신 UI를 반영
 * - 삭제 권한: ADMIN은 전체, 일반 사용자는 본인 댓글만 삭제 가능
 *
 * 운영 포인트:
 * - 댓글 삭제는 소프트 삭제(hidden: true)로 처리 — "삭제됨" 배지로 표시
 * - 로그인 리다이렉트 시 복귀 경로(from)를 state에 담아 전달하여 로그인 후 복귀 가능
 */

export type ReviewCommentListProps = {
    keyId: string
    reviewId: number
}

type Viewer = {
    id: string | null
    role: "ADMIN" | "MEMBER" | null
}

/**
 * 댓글 목록 조회/생성/삭제를 처리하는 컨테이너 컴포넌트.
 */
export function ReviewCommentList({ keyId, reviewId }: ReviewCommentListProps) {
    const { user } = authModel.useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const viewer: Viewer = {
        id: user?.id ?? null,
        role: user?.role ?? null,
    }

    const isAuthenticated: boolean = Boolean(user)

    /**
     * 댓글 목록을 무한 스크롤(더보기 버튼) 방식으로 조회.
     */
    const q = reviewApi.useInfiniteReviewComments(keyId, reviewId, { size: 10, sort: "createdAt,asc" })

    /**
     * 댓글 생성 성공 후 목록/상세 캐시를 무효화해 최신 UI를 맞춤.
     */
    const addMut = reviewApi.useAddCommentMutation(keyId, reviewId)

    /**
     * InfiniteData 구조를 탐색해 아이템 배열로 변환.
     */
    const items = useMemo<ReviewCommentResponse[]>(() => {
        const pages = q.data?.pages ?? []
        return pages.flatMap((p) => p.content)
    }, [q.data])

    /**
     * 로그인 페이지로 이동하며, 복귀 경로를 state에 담아 전달.
     */
    function requestLogin(): void {
        toast.info("댓글 작성은 로그인이 필요합니다.")
        navigate(ROUTES.login, {
            state: { from: toAuthRedirectFrom(location) },
        })
    }

    function isUnauthorized(error: unknown): boolean {
        return isAxiosError(error) && error.response?.status === 401
    }

    async function add(body: string): Promise<void> {
        if (!isAuthenticated) {
            requestLogin()
            return
        }

        try {
            await addMut.mutateAsync({ body })
        } catch (err: unknown) {
            if (isUnauthorized(err)) {
                toast.info("인증이 만료되었습니다. 다시 로그인해 주세요.")
                requestLogin()
                throw err
            }
            toast.error(getErrorMessage(err, "댓글 등록에 실패했습니다."))
            throw err
        }
    }

    /**
     * 댓글 삭제 권한:
     * - ADMIN: 전체 삭제 가능
     * - 일반 사용자: 본인 댓글만 삭제 가능
     */
    function canDeleteComment(item: ReviewCommentResponse): boolean {
        if (viewer.role === "ADMIN") return true

        const authorId: string | null = item.authorId == null ? null : String(item.authorId)

        if (viewer.id == null || authorId == null) return false
        return viewer.id === authorId
    }

    return (
        <div className="space-y-3">
            <div className="text-sm font-bold text-white">댓글</div>

            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
                <reviewUi.ReviewCommentForm
                    onSubmit={add}
                    disabled={addMut.isPending}
                    isAuthenticated={isAuthenticated}
                    onRequestLogin={requestLogin}
                />
            </div>

            {q.isLoading ? (
                <div className="text-sm text-white/80">댓글을 불러오는 중.</div>
            ) : null}

            {q.isError ? (
                <div className="text-sm text-red-400">댓글을 불러오지 못했습니다.</div>
            ) : null}

            {items.length === 0 && !q.isLoading ? (
                <div className="text-sm text-white/80">아직 댓글이 없습니다.</div>
            ) : null}

            <div className="space-y-2">
                {items.map((it: ReviewCommentResponse) => (
                    <CommentItem
                        key={it.commentId}
                        keyId={keyId}
                        reviewId={reviewId}
                        item={it}
                        canDelete={canDeleteComment(it)}
                        isAuthenticated={isAuthenticated}
                        onRequestLogin={requestLogin}
                    />
                ))}
            </div>

            {q.hasNextPage ? (
                <div className="pt-2">
                    <button
                        type="button"
                        className="w-full rounded-2xl border border-white/15 bg-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        onClick={() => void q.fetchNextPage()}
                        disabled={q.isFetchingNextPage}
                        aria-label="댓글 더보기"
                    >
                        {q.isFetchingNextPage ? "불러오는 중..." : "더보기"}
                    </button>
                </div>
            ) : null}
        </div>
    )
}

type CommentItemProps = {
    keyId: string
    reviewId: number
    item: ReviewCommentResponse
    canDelete: boolean
    isAuthenticated: boolean
    onRequestLogin: () => void
}

function CommentItem({ keyId, reviewId, item, canDelete, isAuthenticated, onRequestLogin }: CommentItemProps) {
    const delMut = reviewApi.useDeleteCommentMutation(keyId, reviewId, item.commentId)

    function isUnauthorized(error: unknown): boolean {
        return isAxiosError(error) && error.response?.status === 401
    }

    async function onDelete(): Promise<void> {
        if (!isAuthenticated) {
            onRequestLogin()
            return
        }

        if (!canDelete) return

        const ok: boolean = window.confirm(
            "댓글을 삭제할까요? 다른 사람에게는 보이지 않으며, 본인 목록에서만 삭제됨으로 표시됩니다."
        )
        if (!ok) return

        try {
            await delMut.mutateAsync()
            toast.success("댓글이 삭제됐습니다.")
        } catch (err: unknown) {
            if (isUnauthorized(err)) {
                toast.info("인증이 만료되었습니다. 다시 로그인해 주세요.")
                onRequestLogin()
                return
            }
            toast.error(getErrorMessage(err, "댓글 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요."))
        }
    }

    const isDeleted: boolean = item.hidden

    return (
        <div
            className={`rounded-2xl border p-3 ${
                isDeleted ? "border-amber-500/30 bg-amber-950/20" : "border-white/10 bg-white/10"
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{item.authorName}</div>
                        <div className="text-xs text-white/70">{reviewLib.formatDateTime(item.createdAt)}</div>
                        {isDeleted ? (
                            <span
                                className="rounded bg-amber-500/30 px-1.5 py-0.5 text-xs font-medium text-amber-200"
                                aria-hidden
                            >
                                삭제됨
                            </span>
                        ) : null}
                    </div>

                    <div className="mt-1 whitespace-pre-wrap text-sm text-white/80">{item.body}</div>
                </div>

                {canDelete ? (
                    <button
                        type="button"
                        className="shrink-0 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                        onClick={() => void onDelete()}
                        disabled={delMut.isPending}
                        aria-label="댓글 삭제"
                    >
                        {delMut.isPending ? "삭제 중..." : "삭제"}
                    </button>
                ) : null}
            </div>
        </div>
    )
}
