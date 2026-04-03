// src/domains/review/api/queryKeys.ts

/**
 * queryKeys.ts (API Layer - 리뷰 쿼리 키 팩토리)
 *
 * 역할/목적:
 * - React Query에서 사용하는 리뷰 관련 쿼리 키를 한 곳에서 생성하고 관리
 * - 쿼리 키에 파라미터를 포함시켜 캐시 무효화/공유 범위를 정밀하게 제어
 *
 * 데이터 흐름:
 * - queries.ts / mutations.ts → reviewKeys.xxx() → React Query 캐시 식별자
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · reviewKeys  - 리뷰/댓글 쿼리 키 팩토리 객체
 *
 * 동작 방식:
 * - listBase / listInfiniteBase 등 "Base" 키는 exact: false 무효화용 접두사
 * - 파라미터가 있는 키는 normalizer를 통해 정규화한 뒤 stableSerialize로 직렬화하여
 *   파라미터 순서에 무관하게 동일한 캐시를 공유
 *
 * 운영 포인트:
 * - 새 쿼리/뮤테이션 추가 시 키 구조를 이 파일에서 먼저 정의
 * - Base 키와 파라미터 포함 키의 계층 구조를 유지해 무효화 범위를 명확히 함
 */
import type { QueryKey } from '@tanstack/react-query'
import type { ReviewCommentListParams, ReviewListParams } from '../types'
import {
    REVIEW_COMMENT_SORT_DEFAULT,
    REVIEW_SIZE_DEFAULT,
    REVIEW_SORT_DEFAULT,
    normalizeCommentParams,
    normalizeSize,
    normalizeSort,
    stableSerialize,
} from './normalizers'

export const reviewKeys = {
    listBase: (keyId: string): QueryKey => ['reviews', 'list', keyId] as const,
    listInfiniteBase: (keyId: string): QueryKey => ['reviews', 'list-infinite', keyId] as const,
    detail: (keyId: string, reviewId: number): QueryKey =>
        ['reviews', 'detail', keyId, reviewId] as const,
    commentsBase: (keyId: string, reviewId: number): QueryKey =>
        ['reviews', 'comments', keyId, reviewId] as const,
    commentsInfiniteBase: (keyId: string, reviewId: number): QueryKey =>
        ['reviews', 'comments-infinite', keyId, reviewId] as const,
    listInfinite: (keyId: string, params: Omit<ReviewListParams, 'page'>): QueryKey => {
        const normalized = {
            size: normalizeSize(params.size, REVIEW_SIZE_DEFAULT),
            sort: normalizeSort(params.sort, REVIEW_SORT_DEFAULT),
        }
        return ['reviews', 'list-infinite', keyId, stableSerialize(normalized)] as const
    },
    comments: (
        keyId: string,
        reviewId: number,
        params: ReviewCommentListParams,
    ): QueryKey => {
        const normalized = normalizeCommentParams(params)
        return [
            'reviews',
            'comments',
            keyId,
            reviewId,
            stableSerialize(normalized),
        ] as const
    },
    commentsInfinite: (
        keyId: string,
        reviewId: number,
        params: Omit<ReviewCommentListParams, 'page'>,
    ): QueryKey => {
        const normalized = {
            size: normalizeSize(params.size, REVIEW_SIZE_DEFAULT),
            sort: normalizeSort(params.sort, REVIEW_COMMENT_SORT_DEFAULT),
        }
        return [
            'reviews',
            'comments-infinite',
            keyId,
            reviewId,
            stableSerialize(normalized),
        ] as const
    },
}
