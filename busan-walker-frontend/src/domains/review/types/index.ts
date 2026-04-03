// src/domains/review/types/index.ts

/**
 * index.ts (Types Layer - 리뷰 도메인 공개 타입 정의)
 *
 * 역할/목적:
 * - 리뷰 관련 API 요청/응답 및 쿼리 파라미터의 TypeScript 계약 정의
 * - 백엔드 DTO와 1:1 대응하여 타입 안전성을 보장하는 SSOT 역할
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ApiPage<T>               - 공통 페이지 응답 제네릭 타입
 *      · ReviewCardResponse       - 리뷰 목록 카드 응답 타입
 *      · ReviewDetailResponse     - 리뷰 상세 응답 타입
 *      · ReviewCreateRequest      - 리뷰 생성 요청 타입
 *      · ReviewUpdateRequest      - 리뷰 수정 요청 타입 (CreateRequest 별칭)
 *      · ReviewCommentResponse    - 댓글 응답 타입
 *      · ReviewCommentCreateRequest - 댓글 생성 요청 타입
 *      · ReviewListParams         - 리뷰 목록 조회 파라미터 타입
 *      · ReviewCommentListParams  - 댓글 목록 조회 파라미터 타입
 *
 * 동작 방식:
 * - nullable/optional 필드는 백엔드 DTO 정책을 그대로 반영
 * - 실제 값 검증 및 정규화는 API 레이어 normalizers.ts에서 수행
 *
 * 운영 포인트:
 * - 백엔드 DTO 변경 시 이 파일의 타입을 먼저 수정하고 normalizers.ts를 함께 갱신
 */

/**
 * 공통 페이지 응답 계약.
 *
 * 역할
 * - 백엔드 `ApiPage<T>`와 필드 이름/의미를 1:1로 맞춤
 *
 * 정책
 * - `page`는 0-based 인덱스
 * - `size`는 "이번 응답 content 길이"가 아니라 요청 기준 페이지 크기
 * - `totalElements`, `totalPages`는 서버가 계산한 전체 집계 값
 */
export type ApiPage<T> = {
    content: T[]
    page: number
    size: number
    totalElements: number
    totalPages: number
}

/**
 * 리뷰 목록 카드 응답.
 *
 * 정책
 * - ID/카운트는 DB `BIGINT` 계열 값이므로 API 레이어에서 안전 정수 범위를 검증
 * - `createdAt`, `updatedAt`는 ISO 날짜 문자열
 */
export type ReviewCardResponse = {
    reviewId: number
    authorId: number | null
    authorName: string
    rating: number
    body: string
    likedByMe: boolean
    likeCount: number
    commentCount: number
    imageUrls: string[]
    createdAt: string
    updatedAt: string
}

/**
 * 리뷰 상세 응답.
 */
export type ReviewDetailResponse = {
    reviewId: number
    keyId: string
    authorId: number | null
    authorName: string
    rating: number
    body: string
    likedByMe: boolean
    likeCount: number
    commentCount: number
    imageUrls: string[]
    createdAt: string
    updatedAt: string
}

/**
 * 리뷰 생성/수정 요청.
 *
 * 정책
 * - 백엔드 DTO는 `imageUrls` null 허용이므로 프론트 타입도 nullable/optional을 허용
 * - 실제 전송 시 API 레이어에서 `null`/`undefined`를 `[]`로 정규화
 */
export type ReviewCreateRequest = {
    rating: number
    body: string
    imageUrls?: string[] | null
}

/**
 * 리뷰 수정 요청.
 *
 * 정책
 * - ReviewCreateRequest와 동일한 구조를 공유하는 타입 별칭
 */
export type ReviewUpdateRequest = ReviewCreateRequest

/**
 * 리뷰 댓글 응답.
 *
 * 정책
 * - `hidden`은 소프트 삭제 플래그를 의미하며 서버가 항상 boolean으로 제공
 */
export type ReviewCommentResponse = {
    commentId: number
    authorId: number | null
    authorName: string
    body: string
    createdAt: string
    hidden: boolean
}

/**
 * 리뷰 댓글 작성 요청.
 */
export type ReviewCommentCreateRequest = {
    body: string
}

/**
 * 리뷰 목록 조회 파라미터.
 * - 실제 min/max/정렬 파싱 보정은 API 레이어 normalize 함수에서 수행
 */
export type ReviewListParams = {
    page?: number
    size?: number
    sort?: string
}

/**
 * 댓글 목록 조회 파라미터.
 * - 실제 min/max/정렬 파싱 보정은 API 레이어 normalize 함수에서 수행
 */
export type ReviewCommentListParams = {
    page?: number
    size?: number
    sort?: string
}
