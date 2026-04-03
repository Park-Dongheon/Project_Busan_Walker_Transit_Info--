// src/domains/review/api/mutations.ts

/**
 * mutations.ts (API Layer - 리뷰/댓글 변이 훅)
 *
 * 역할/목적:
 * - 리뷰 생성/수정/삭제, 좋아요 토글, 댓글 추가/삭제를 처리하는 React Query 뮤테이션 훅 제공
 * - 좋아요 토글은 Optimistic Update 패턴으로 즉각적인 UI 반응을 보장하고,
 *   실패 시 스냅숏으로 롤백
 *
 * 데이터 흐름:
 * - 컴포넌트 → useXxxMutation → mutateAsync → API 호출 → onSuccess 캐시 무효화
 *   (좋아요 토글: onMutate 낙관적 업데이트 → API 호출 → onError 롤백 / onSettled 재검증)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useCreateReviewMutation  - 리뷰 생성 뮤테이션 훅
 *      · useUpdateReviewMutation  - 리뷰 수정 뮤테이션 훅
 *      · useDeleteReviewMutation  - 리뷰 삭제 뮤테이션 훅
 *      · useToggleLikeMutation    - 좋아요 토글 뮤테이션 훅 (Optimistic Update 포함)
 *      · useAddCommentMutation    - 댓글 추가 뮤테이션 훅
 *      · useDeleteCommentMutation - 댓글 삭제 뮤테이션 훅
 *
 * 동작 방식:
 * - 리뷰 생성/삭제는 관광지 목록 캐시까지 무효화하여 평점/리뷰 수 집계를 갱신
 * - isAttractionsListQueryKey는 관광지 목록 관련 쿼리를 식별하는 내부 헬퍼
 * - patchCardList / patchAnyListData는 좋아요 낙관적 업데이트용 불변 패치 함수
 *
 * 운영 포인트:
 * - 좋아요 토글 실패 시 onError에서 스냅숏을 복원하고 onSettled에서 서버 상태로 재검증
 * - 관광지 목록 쿼리 키 구조 변경 시 isAttractionsListQueryKey도 함께 수정
 */
import {
    useMutation,
    useQueryClient,
    type InfiniteData,
    type QueryKey,
} from '@tanstack/react-query'
import type { AxiosError } from 'axios'

import { api as attractionApi } from '@/domains/attraction'
import { api } from '@/shared/api/core/client'

import type {
    ApiPage,
    ReviewCardResponse,
    ReviewCommentCreateRequest,
    ReviewCreateRequest,
    ReviewDetailResponse,
    ReviewUpdateRequest,
} from '../types'
import { reviewKeys } from './queryKeys'
import {
    normalizeCommentCreatePayload,
    normalizeReviewWritePayload,
    toSafeInteger,
} from './normalizers'

/**
 * 리뷰를 생성하고 서버가 반환한 reviewId 반환.
 */
async function createReview(keyId: string, payload: ReviewCreateRequest): Promise<number> {
    const body = normalizeReviewWritePayload(payload)
    const response = await api.post<number>(`/attractions/${keyId}/reviews`, body)

    return toSafeInteger(response.data, 'createReview.reviewId')
}

/**
 * 리뷰 수정.
 */
async function updateReview(
    keyId: string,
    reviewId: number,
    payload: ReviewUpdateRequest,
): Promise<void> {
    const body = normalizeReviewWritePayload(payload)

    await api.put<void>(`/attractions/${keyId}/reviews/${reviewId}`, body)
}

/**
 * 리뷰 삭제.
 */
async function deleteReview(keyId: string, reviewId: number): Promise<void> {
    await api.delete<void>(`/attractions/${keyId}/reviews/${reviewId}`)
}

/**
 * 리뷰 좋아요 추가.
 */
async function likeReview(keyId: string, reviewId: number): Promise<void> {
    await api.post<void>(`/attractions/${keyId}/reviews/${reviewId}/likes`)
}

/**
 * 리뷰 좋아요 취소.
 */
async function unlikeReview(keyId: string, reviewId: number): Promise<void> {
    await api.delete<void>(`/attractions/${keyId}/reviews/${reviewId}/likes`)
}

/**
 * 댓글을 추가하고 서버가 반환한 commentId 반환.
 */
async function addComment(
    keyId: string,
    reviewId: number,
    payload: ReviewCommentCreateRequest,
): Promise<number> {
    const body = normalizeCommentCreatePayload(payload)
    const response = await api.post<number>(
        `/attractions/${keyId}/reviews/${reviewId}/comments`,
        body,
    )

    return toSafeInteger(response.data, 'addComment.commentId')
}

/**
 * 댓글 삭제.
 */
async function deleteComment(
    keyId: string,
    reviewId: number,
    commentId: number,
): Promise<void> {
    await api.delete<void>(`/attractions/${keyId}/reviews/${reviewId}/comments/${commentId}`)
}

/**
 * 쿼리 키가 관광지 목록 관련인지 판별.
 *
 * - 리뷰 변이(생성/삭제) 후 관광지 목록의 평점/리뷰 수 집계 갱신을 위해 사용
 * - 관광지 소개 목록(intros)은 리뷰 집계와 무관하므로 제외
 */
function isAttractionsListQueryKey(queryKey: QueryKey): boolean {
    const [root, second] = queryKey

    if (root === 'attractionsAll') return true
    if (root === 'attractions') return second !== 'intros'

    return false
}

type ToggleLikeContext = {
    listSnapshots: Array<
        [
            QueryKey,
            ApiPage<ReviewCardResponse> | InfiniteData<ApiPage<ReviewCardResponse>> | undefined,
        ]
    >
    detailSnapshot: ReviewDetailResponse | undefined
    reviewId: number
}

/**
 * InfiniteData 구조인지 판별.
 *
 * - 좋아요 낙관적 업데이트 시 페이지드 캐시와 무한 캐시를 구분하기 위한 헬퍼
 */
function isInfiniteData<T>(data: unknown): data is InfiniteData<T> {
    return (
        typeof data === 'object' &&
        data != null &&
        'pages' in data &&
        Array.isArray((data as { pages: unknown }).pages)
    )
}

/**
 * 리뷰 카드 목록 단일 페이지의 좋아요 상태를 불변으로 패치.
 *
 * - likeCount는 0 미만이 되지 않도록 클램핑 처리
 */
function patchCardList(
    page: ApiPage<ReviewCardResponse>,
    reviewId: number,
    nextLiked: boolean,
): ApiPage<ReviewCardResponse> {
    const delta = nextLiked ? 1 : -1

    return {
        ...page,
        content: page.content.map((review) =>
            review.reviewId !== reviewId
                ? review
                : {
                      ...review,
                      likedByMe: nextLiked,
                      likeCount: Math.max(0, review.likeCount + delta),
                  },
        ),
    }
}

/**
 * 페이지드/무한 캐시 모두에서 좋아요 상태를 불변으로 패치.
 *
 * - InfiniteData 여부에 따라 분기하여 일관된 패치 적용
 */
function patchAnyListData(
    data: ApiPage<ReviewCardResponse> | InfiniteData<ApiPage<ReviewCardResponse>>,
    reviewId: number,
    nextLiked: boolean,
): ApiPage<ReviewCardResponse> | InfiniteData<ApiPage<ReviewCardResponse>> {
    if (isInfiniteData<ApiPage<ReviewCardResponse>>(data)) {
        return {
            ...data,
            pages: data.pages.map((page) => patchCardList(page, reviewId, nextLiked)),
        }
    }

    return patchCardList(data, reviewId, nextLiked)
}

/**
 * 리뷰 생성 뮤테이션 훅
 *
 * - 성공 시 해당 관광지의 리뷰 목록, 무한 목록, 관광지 상세, 관광지 목록 캐시 무효화
 */
export function useCreateReviewMutation(keyId: string) {
    const qc = useQueryClient()

    return useMutation<number, AxiosError, ReviewCreateRequest>({
        mutationFn: (payload) => createReview(keyId, payload),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            void qc.invalidateQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
            void qc.invalidateQueries({
                queryKey: attractionApi.attractionDetailQueryKey(keyId),
                exact: true,
            })
            void qc.invalidateQueries({
                predicate: (query) => isAttractionsListQueryKey(query.queryKey),
            })
        },
    })
}

/**
 * 리뷰 수정 뮤테이션 훅
 *
 * - 성공 시 목록 및 해당 리뷰 상세 캐시 무효화
 */
export function useUpdateReviewMutation(keyId: string, reviewId: number) {
    const qc = useQueryClient()

    return useMutation<void, AxiosError, ReviewUpdateRequest>({
        mutationFn: (payload) => updateReview(keyId, reviewId, payload),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            void qc.invalidateQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
            void qc.invalidateQueries({ queryKey: reviewKeys.detail(keyId, reviewId), exact: true })
            void qc.invalidateQueries({
                queryKey: attractionApi.attractionDetailQueryKey(keyId),
                exact: true,
            })
        },
    })
}

/**
 * 리뷰 삭제 뮤테이션 훅
 *
 * - 성공 시 목록, 관광지 상세, 관광지 목록 캐시 무효화
 */
export function useDeleteReviewMutation(keyId: string, reviewId: number) {
    const qc = useQueryClient()

    return useMutation<void, AxiosError, void>({
        mutationFn: () => deleteReview(keyId, reviewId),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            void qc.invalidateQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
            void qc.invalidateQueries({
                queryKey: attractionApi.attractionDetailQueryKey(keyId),
                exact: true,
            })
            void qc.invalidateQueries({
                predicate: (query) => isAttractionsListQueryKey(query.queryKey),
            })
        },
    })
}

/**
 * 좋아요 토글 뮤테이션 훅 (Optimistic Update)
 *
 * - onMutate: 기존 캐시를 스냅숏으로 저장하고 즉시 UI 패치
 * - onError: API 실패 시 스냅숏으로 캐시를 복원하여 잘못된 UI 롤백
 * - onSettled: 성공/실패 무관하게 관련 쿼리를 재검증하여 서버 상태와 동기화
 */
export function useToggleLikeMutation(keyId: string) {
    const qc = useQueryClient()

    return useMutation<
        void,
        AxiosError,
        { reviewId: number; nextLiked: boolean },
        ToggleLikeContext
    >({
        mutationFn: async ({ reviewId, nextLiked }) => {
            if (nextLiked) {
                await likeReview(keyId, reviewId)
                return
            }

            await unlikeReview(keyId, reviewId)
        },

        onMutate: async ({ reviewId, nextLiked }) => {
            await qc.cancelQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            await qc.cancelQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
            await qc.cancelQueries({ queryKey: reviewKeys.detail(keyId, reviewId), exact: true })

            const pagedSnapshots = qc.getQueriesData<ApiPage<ReviewCardResponse>>({
                queryKey: reviewKeys.listBase(keyId),
                exact: false,
            })
            const infiniteSnapshots = qc.getQueriesData<
                InfiniteData<ApiPage<ReviewCardResponse>>
            >({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })

            const listSnapshots: ToggleLikeContext['listSnapshots'] = [
                ...pagedSnapshots.map(([queryKey, data]) => [
                    queryKey,
                    data,
                ] as [
                    QueryKey,
                    ApiPage<ReviewCardResponse> | InfiniteData<ApiPage<ReviewCardResponse>> | undefined,
                ]),
                ...infiniteSnapshots.map(([queryKey, data]) => [
                    queryKey,
                    data,
                ] as [
                    QueryKey,
                    ApiPage<ReviewCardResponse> | InfiniteData<ApiPage<ReviewCardResponse>> | undefined,
                ]),
            ]

            const detailSnapshot = qc.getQueryData<ReviewDetailResponse>(
                reviewKeys.detail(keyId, reviewId),
            )

            for (const [queryKey, data] of listSnapshots) {
                if (!data) continue

                qc.setQueryData(queryKey, patchAnyListData(data, reviewId, nextLiked))
            }

            if (detailSnapshot) {
                const delta = nextLiked ? 1 : -1

                qc.setQueryData<ReviewDetailResponse>(reviewKeys.detail(keyId, reviewId), {
                    ...detailSnapshot,
                    likedByMe: nextLiked,
                    likeCount: Math.max(0, detailSnapshot.likeCount + delta),
                })
            }

            return { listSnapshots, detailSnapshot, reviewId }
        },

        onError: (_error, _variables, context) => {
            if (!context) return

            for (const [queryKey, data] of context.listSnapshots) {
                qc.setQueryData(queryKey, data)
            }

            if (context.detailSnapshot) {
                qc.setQueryData(
                    reviewKeys.detail(keyId, context.reviewId),
                    context.detailSnapshot,
                )
            }
        },

        onSettled: (_data, _error, variables) => {
            void qc.invalidateQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            void qc.invalidateQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
            void qc.invalidateQueries({
                queryKey: reviewKeys.detail(keyId, variables.reviewId),
                exact: true,
            })
        },
    })
}

/**
 * 댓글 추가 뮤테이션 훅
 *
 * - 성공 시 댓글 목록, 리뷰 상세(commentCount 갱신), 리뷰 목록 캐시 무효화
 */
export function useAddCommentMutation(keyId: string, reviewId: number) {
    const qc = useQueryClient()

    return useMutation<number, AxiosError, ReviewCommentCreateRequest>({
        mutationFn: (payload) => addComment(keyId, reviewId, payload),
        onSuccess: () => {
            void qc.invalidateQueries({
                queryKey: reviewKeys.commentsBase(keyId, reviewId),
                exact: false,
            })
            void qc.invalidateQueries({
                queryKey: reviewKeys.commentsInfiniteBase(keyId, reviewId),
                exact: false,
            })
            void qc.invalidateQueries({ queryKey: reviewKeys.detail(keyId, reviewId), exact: true })
            void qc.invalidateQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            void qc.invalidateQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
        },
    })
}

/**
 * 댓글 삭제 뮤테이션 훅
 *
 * - 성공 시 댓글 목록, 리뷰 상세, 리뷰 목록 캐시 무효화
 */
export function useDeleteCommentMutation(
    keyId: string,
    reviewId: number,
    commentId: number,
) {
    const qc = useQueryClient()

    return useMutation<void, AxiosError, void>({
        mutationFn: () => deleteComment(keyId, reviewId, commentId),
        onSuccess: () => {
            void qc.invalidateQueries({
                queryKey: reviewKeys.commentsBase(keyId, reviewId),
                exact: false,
            })
            void qc.invalidateQueries({
                queryKey: reviewKeys.commentsInfiniteBase(keyId, reviewId),
                exact: false,
            })
            void qc.invalidateQueries({ queryKey: reviewKeys.detail(keyId, reviewId), exact: true })
            void qc.invalidateQueries({ queryKey: reviewKeys.listBase(keyId), exact: false })
            void qc.invalidateQueries({
                queryKey: reviewKeys.listInfiniteBase(keyId),
                exact: false,
            })
        },
    })
}
