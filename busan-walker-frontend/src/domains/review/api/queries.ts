// src/domains/review/api/queries.ts

/**
 * queries.ts (API Layer - 리뷰 조회 훅)
 *
 * 역할/목적:
 * - 리뷰 목록, 리뷰 상세, 댓글 목록을 서버에서 조회하는 React Query 훅 제공
 * - 무한 스크롤 방식의 페이지 로딩 지원
 *
 * 데이터 흐름:
 * - 컴포넌트 → useInfiniteReviewList / useReviewDetail / useInfiniteReviewComments
 *   → fetchXxx (내부 fetch 함수) → api.get → 서버 응답 → normalizer → 캐시
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useInfiniteReviewList     - 리뷰 목록 무한 스크롤 쿼리 훅
 *      · useReviewDetail           - 리뷰 상세 단건 쿼리 훅
 *      · useInfiniteReviewComments - 댓글 목록 무한 스크롤 쿼리 훅
 *
 * 동작 방식:
 * - 내부 fetch 함수는 파라미터를 normalizer로 보정한 뒤 API를 호출하고 응답을 정규화
 * - getNextPageParam은 서버의 totalPages를 우선 사용하고, 없으면 content 길이로 판단
 * - reviewId가 null이면 useReviewDetail은 enabled: false로 비활성화
 *
 * 운영 포인트:
 * - staleTime은 리뷰 목록 10초, 댓글 5초로 설정되어 있으며 필요 시 조정
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'

import { api } from '@/shared/api/core/client'

import type {
    ApiPage,
    ReviewCardResponse,
    ReviewCommentListParams,
    ReviewCommentResponse,
    ReviewDetailResponse,
    ReviewListParams,
} from '../types'
import { reviewKeys } from './queryKeys'
import {
    REVIEW_COMMENT_SORT_DEFAULT,
    REVIEW_PAGE_DEFAULT,
    REVIEW_SIZE_DEFAULT,
    REVIEW_SORT_DEFAULT,
    normalizeApiPage,
    normalizeCommentParams,
    normalizeListParams,
    normalizePage,
    normalizeReviewCardResponse,
    normalizeReviewCommentResponse,
    normalizeReviewDetailResponse,
    normalizeSize,
    normalizeSort,
} from './normalizers'

/**
 * 리뷰 목록 단일 페이지를 서버에서 조회.
 *
 * - 파라미터를 정규화한 뒤 요청하고, 응답을 normalizeApiPage로 검증 후 반환
 */
async function fetchReviewList(
    keyId: string,
    params: ReviewListParams,
    signal?: AbortSignal,
): Promise<ApiPage<ReviewCardResponse>> {
    const normalized = normalizeListParams(params)
    const response = await api.get<ApiPage<ReviewCardResponse>>(`/attractions/${keyId}/reviews`, {
        params: normalized,
        signal,
    })

    return normalizeApiPage(response.data, normalizeReviewCardResponse, 'reviewList')
}

/**
 * 리뷰 상세를 서버에서 조회.
 *
 * - 응답을 normalizeReviewDetailResponse로 검증 후 반환
 */
async function fetchReviewDetail(
    keyId: string,
    reviewId: number,
    signal?: AbortSignal,
): Promise<ReviewDetailResponse> {
    const response = await api.get<ReviewDetailResponse>(
        `/attractions/${keyId}/reviews/${reviewId}`,
        { signal },
    )

    return normalizeReviewDetailResponse(response.data)
}

/**
 * 댓글 목록 단일 페이지를 서버에서 조회.
 *
 * - 응답을 normalizeApiPage로 검증 후 반환
 */
async function fetchComments(
    keyId: string,
    reviewId: number,
    params: ReviewCommentListParams,
    signal?: AbortSignal,
): Promise<ApiPage<ReviewCommentResponse>> {
    const normalized = normalizeCommentParams(params)
    const response = await api.get<ApiPage<ReviewCommentResponse>>(
        `/attractions/${keyId}/reviews/${reviewId}/comments`,
        {
            params: normalized,
            signal,
        },
    )

    return normalizeApiPage(response.data, normalizeReviewCommentResponse, 'reviewComments')
}

/**
 * 무한 스크롤의 다음 페이지 번호를 계산.
 *
 * - totalPages가 유효하면 이를 기준으로 판단하고, 없으면 content 길이와 requestSize를 비교
 * - 마지막 페이지이면 undefined를 반환하여 더 이상 로딩하지 않도록 처리
 */
function getNextPageParam<T>(
    lastPage: ApiPage<T>,
    requestSize: number,
): number | undefined {
    const currentPage = normalizePage(lastPage.page, REVIEW_PAGE_DEFAULT)
    const totalPagesRaw = Number(lastPage.totalPages)
    const hasValidTotalPages = Number.isFinite(totalPagesRaw) && totalPagesRaw > 0

    if (hasValidTotalPages) {
        const totalPages = Math.max(0, Math.floor(totalPagesRaw))
        const nextPage = currentPage + 1

        return nextPage < totalPages ? nextPage : undefined
    }

    return lastPage.content.length < requestSize ? undefined : currentPage + 1
}

/**
 * 리뷰 목록 무한 스크롤 쿼리 훅
 *
 * - page를 제외한 size/sort를 파라미터로 받아 초기 페이지(0)부터 로딩 시작
 * - 쿼리 키에 정규화된 파라미터가 포함되어 sort/size 변경 시 별도 캐시로 분리
 */
export function useInfiniteReviewList(
    keyId: string,
    params: Omit<ReviewListParams, 'page'>,
) {
    const size = normalizeSize(params.size, REVIEW_SIZE_DEFAULT)
    const sort = normalizeSort(params.sort, REVIEW_SORT_DEFAULT)

    return useInfiniteQuery<ApiPage<ReviewCardResponse>, AxiosError>({
        queryKey: reviewKeys.listInfinite(keyId, { size, sort }),
        initialPageParam: 0,
        queryFn: ({ pageParam, signal }) =>
            fetchReviewList(
                keyId,
                {
                    page: normalizePage(pageParam, REVIEW_PAGE_DEFAULT),
                    size,
                    sort,
                },
                signal,
            ),
        getNextPageParam: (lastPage) => getNextPageParam(lastPage, size),
        staleTime: 10_000,
    })
}

/**
 * 리뷰 상세 단건 쿼리 훅
 *
 * - reviewId가 null이면 쿼리가 비활성화되어 서버 요청이 발생하지 않음
 * - 모달 오픈 전 reviewId가 결정되지 않은 상태를 안전하게 처리하기 위한 설계
 *
 * @param keyId - 관광지 식별자
 * @param reviewId - 조회할 리뷰 ID (null이면 쿼리 비활성화)
 */
export function useReviewDetail(keyId: string, reviewId: number | null) {
    return useQuery<ReviewDetailResponse, AxiosError>({
        queryKey:
            reviewId == null
                ? (['reviews', 'detail', keyId, 'none'] as const)
                : reviewKeys.detail(keyId, reviewId),
        enabled: reviewId != null,
        queryFn: ({ signal }) => {
            if (reviewId == null) throw new Error('reviewId is null')

            return fetchReviewDetail(keyId, reviewId, signal)
        },
        staleTime: 10_000,
    })
}

/**
 * 댓글 목록 무한 스크롤 쿼리 훅
 *
 * - 댓글은 오래된 순(createdAt,asc)을 기본 정렬로 활용
 * - staleTime을 5초로 짧게 설정하여 다른 사용자의 댓글을 비교적 빠르게 반영
 */
export function useInfiniteReviewComments(
    keyId: string,
    reviewId: number,
    params: Omit<ReviewCommentListParams, 'page'>,
) {
    const size = normalizeSize(params.size, REVIEW_SIZE_DEFAULT)
    const sort = normalizeSort(params.sort, REVIEW_COMMENT_SORT_DEFAULT)

    return useInfiniteQuery<ApiPage<ReviewCommentResponse>, AxiosError>({
        queryKey: reviewKeys.commentsInfinite(keyId, reviewId, { size, sort }),
        initialPageParam: 0,
        queryFn: ({ pageParam, signal }) =>
            fetchComments(
                keyId,
                reviewId,
                {
                    page: normalizePage(pageParam, REVIEW_PAGE_DEFAULT),
                    size,
                    sort,
                },
                signal,
            ),
        getNextPageParam: (lastPage) => getNextPageParam(lastPage, size),
        staleTime: 5_000,
    })
}
