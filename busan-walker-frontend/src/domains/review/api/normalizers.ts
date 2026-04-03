// src/domains/review/api/normalizers.ts

/**
 * normalizers.ts (API Layer - 리뷰 API 정규화 유틸리티)
 *
 * 역할/목적:
 * - 서버로부터 받은 리뷰/댓글 응답 데이터를 검증하고 안전한 타입으로 정규화
 * - 서버로 전송하는 요청 페이로드도 정규화하여 잘못된 값이 전달되지 않도록 방어
 * - 쿼리 파라미터(page/size/sort)를 유효 범위로 보정
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · REVIEW_PAGE_DEFAULT / REVIEW_SIZE_DEFAULT / REVIEW_SIZE_MAX  - 페이지 기본/제한 상수
 *      · REVIEW_SORT_DEFAULT / REVIEW_COMMENT_SORT_DEFAULT            - 정렬 기본값 상수
 *      · stableSerialize               - 객체를 키 정렬된 JSON 문자열로 직렬화 (쿼리 키용)
 *      · normalizePage                 - page 값 보정 (0 이상 정수)
 *      · normalizeSize                 - size 값 보정 (1~200 정수)
 *      · normalizeSort                 - sort 문자열 보정
 *      · normalizeListParams           - 리뷰 목록 파라미터 일괄 정규화
 *      · normalizeCommentParams        - 댓글 목록 파라미터 일괄 정규화
 *      · toSafeInteger                 - 안전 정수 검증
 *      · toSafeNonNegativeInteger      - 0 이상 안전 정수 검증
 *      · toNullableSafeInteger         - null 허용 안전 정수 검증
 *      · toBoolean                     - boolean 검증
 *      · toStringValue                 - string 검증
 *      · toNormalizedStringArray       - 중복 제거 string[] 정규화
 *      · normalizeApiPage              - ApiPage<T> 전체 정규화
 *      · normalizeReviewCardResponse   - 리뷰 카드 응답 정규화
 *      · normalizeReviewDetailResponse - 리뷰 상세 응답 정규화
 *      · normalizeReviewCommentResponse - 댓글 응답 정규화
 *      · normalizeReviewWritePayload   - 리뷰 작성 요청 페이로드 정규화
 *      · normalizeCommentCreatePayload - 댓글 작성 요청 페이로드 정규화
 *
 * 동작 방식:
 * - 검증 실패 시 Error를 throw하여 상위 레이어(queries.ts)가 캐치하도록 함
 * - toNormalizedStringArray는 null/undefined 허용 여부를 옵션으로 제어
 * - stableSerialize는 키를 알파벳 순 정렬하여 파라미터 순서에 무관한 캐시 키를 생성
 *
 * 운영 포인트:
 * - 백엔드 DTO 필드 추가/변경 시 해당 normalize 함수도 함께 수정
 * - REVIEW_SIZE_MAX 변경 시 서버 측 상한과 일치시켜야 함
 */
import type {
    ApiPage,
    ReviewCardResponse,
    ReviewCommentCreateRequest,
    ReviewCommentListParams,
    ReviewCommentResponse,
    ReviewCreateRequest,
    ReviewDetailResponse,
    ReviewListParams,
    ReviewUpdateRequest,
} from '../types'

export const REVIEW_PAGE_DEFAULT = 0
export const REVIEW_SIZE_DEFAULT = 10
export const REVIEW_SIZE_MAX = 200
export const REVIEW_SORT_DEFAULT = 'createdAt,desc'
export const REVIEW_COMMENT_SORT_DEFAULT = 'createdAt,asc'

type SerializableParamValue = string | number | boolean | null

/**
 * 객체를 키 알파벳 순으로 정렬한 뒤 JSON 문자열로 직렬화.
 *
 * - React Query 쿼리 키에 파라미터를 포함할 때 순서에 무관한 안정적인 키 생성을 위해 사용
 */
export function stableSerialize(params: Record<string, SerializableParamValue>): string {
    const keys = Object.keys(params).sort()
    const normalized: Record<string, SerializableParamValue> = {}

    for (const key of keys) {
        normalized[key] = params[key]
    }

    return JSON.stringify(normalized)
}

/**
 * page 값을 0 이상의 유효한 정수로 보정.
 *
 * - 유한하지 않은 값은 fallback으로 대체하고, 소수점은 내림 처리 후 반환
 */
export function normalizePage(
    value: unknown,
    fallback: number = REVIEW_PAGE_DEFAULT,
): number {
    const raw = Number(value)

    if (!Number.isFinite(raw)) return fallback

    return Math.max(0, Math.floor(raw))
}

/**
 * size 값을 1~REVIEW_SIZE_MAX 범위의 유효한 정수로 보정.
 *
 * - 유한하지 않은 값은 fallback으로 대체하고, 범위를 벗어나면 클램핑 후 반환
 */
export function normalizeSize(
    value: unknown,
    fallback: number = REVIEW_SIZE_DEFAULT,
): number {
    const raw = Number(value)

    if (!Number.isFinite(raw)) return fallback

    const floored = Math.floor(raw)

    return Math.min(REVIEW_SIZE_MAX, Math.max(1, floored))
}

/**
 * sort 문자열을 "field,direction" 형태로 정규화.
 *
 * - string이 아니거나 빈 문자열이면 fallback 반환
 * - direction이 없으면 field만 반환
 */
export function normalizeSort(sort: unknown, fallback: string): string {
    if (typeof sort !== 'string') return fallback

    const trimmed = sort.trim()
    if (trimmed.length === 0) return fallback

    const [fieldRaw, directionRaw] = trimmed.split(',', 2)
    const field = fieldRaw?.trim()
    const direction = directionRaw?.trim().toLowerCase()

    if (!field) return fallback
    if (!direction) return field

    return `${field},${direction}`
}

/**
 * 리뷰 목록 조회 파라미터 일괄 정규화.
 */
export function normalizeListParams(params: ReviewListParams): Required<ReviewListParams> {
    return {
        page: normalizePage(params.page, REVIEW_PAGE_DEFAULT),
        size: normalizeSize(params.size, REVIEW_SIZE_DEFAULT),
        sort: normalizeSort(params.sort, REVIEW_SORT_DEFAULT),
    }
}

/**
 * 댓글 목록 조회 파라미터 일괄 정규화.
 */
export function normalizeCommentParams(
    params: ReviewCommentListParams,
): Required<ReviewCommentListParams> {
    return {
        page: normalizePage(params.page, REVIEW_PAGE_DEFAULT),
        size: normalizeSize(params.size, REVIEW_SIZE_DEFAULT),
        sort: normalizeSort(params.sort, REVIEW_COMMENT_SORT_DEFAULT),
    }
}

/**
 * 값이 JavaScript 안전 정수 범위인지 검증하고 반환.
 *
 * - DB BIGINT 계열 필드가 Number로 변환될 때 정밀도 손실을 방어하기 위한 검증
 */
export function toSafeInteger(value: unknown, field: string): number {
    const numeric = typeof value === 'number' ? value : Number(value)

    if (!Number.isSafeInteger(numeric)) {
        throw new Error(`Invalid safe integer in review API response: ${field}`)
    }

    return numeric
}

/**
 * 0 이상의 안전 정수를 검증하고 반환.
 *
 * - 카운트(likeCount, commentCount 등) 필드에 음수가 유입되는 것을 방어하기 위한 검증
 */
export function toSafeNonNegativeInteger(value: unknown, field: string): number {
    const numeric = toSafeInteger(value, field)

    if (numeric < 0) {
        throw new Error(`Negative value is not allowed in review API response: ${field}`)
    }

    return numeric
}

/**
 * null/undefined이면 null을, 그 외에는 안전 정수를 검증하고 반환.
 *
 * - authorId처럼 삭제된 계정이면 null일 수 있는 필드에 사용하는 nullable 변형
 */
export function toNullableSafeInteger(value: unknown, field: string): number | null {
    if (value == null) return null

    return toSafeInteger(value, field)
}

/**
 * boolean 타입을 검증하고 반환.
 *
 * - 0/1도 boolean으로 허용하여 일부 백엔드의 숫자형 플래그를 수용하는 관대한 검증
 */
export function toBoolean(value: unknown, field: string): boolean {
    if (typeof value === 'boolean') return value
    if (value === 0 || value === 1) return Boolean(value)

    throw new Error(`Invalid boolean in review API response: ${field}`)
}

/**
 * string 타입을 검증하고 반환.
 *
 * - string이 아니면 에러 throw
 */
export function toStringValue(value: unknown, field: string): string {
    if (typeof value === 'string') return value

    throw new Error(`Invalid string in review API response: ${field}`)
}

/**
 * string[] 타입을 검증하고 중복/빈 값을 제거한 배열로 반환.
 *
 * - allowNullish 옵션이 true이면 null/undefined를 빈 배열로 처리
 * - 각 항목을 trim하고 빈 문자열은 제외하며 중복은 Set으로 제거
 */
export function toNormalizedStringArray(
    value: unknown,
    field: string,
    options?: { allowNullish?: boolean },
): string[] {
    if (value == null) {
        if (options?.allowNullish) return []

        throw new Error(`Invalid string array in review API response: ${field}`)
    }

    if (!Array.isArray(value)) {
        throw new Error(`Invalid string array in review API response: ${field}`)
    }

    if (!value.every((item) => typeof item === 'string')) {
        throw new Error(`Non-string item detected in review API response: ${field}`)
    }

    const uniq = new Set<string>()

    for (const raw of value) {
        const trimmed = raw.trim()
        if (!trimmed) continue

        uniq.add(trimmed)
    }

    return Array.from(uniq)
}

/**
 * ApiPage<T> 전체를 정규화.
 *
 * - content 배열의 각 항목을 normalizeItem 콜백으로 검증
 * - 페이지네이션 메타 필드(page, size, totalElements, totalPages)도 검증 후 반환
 */
export function normalizeApiPage<T>(
    raw: ApiPage<T>,
    normalizeItem: (item: T, index: number) => T,
    scope: string,
): ApiPage<T> {
    if (!Array.isArray(raw.content)) {
        throw new Error(`Invalid page content in review API response: ${scope}.content`)
    }

    return {
        content: raw.content.map((item, index) => normalizeItem(item, index)),
        page: toSafeNonNegativeInteger(raw.page, `${scope}.page`),
        size: toSafeNonNegativeInteger(raw.size, `${scope}.size`),
        totalElements: toSafeNonNegativeInteger(raw.totalElements, `${scope}.totalElements`),
        totalPages: toSafeNonNegativeInteger(raw.totalPages, `${scope}.totalPages`),
    }
}

/**
 * 리뷰 카드 응답 단건을 검증하고 정규화.
 *
 * - index를 scope에 포함하여 어떤 항목에서 오류가 발생했는지 식별 가능하도록 처리
 */
export function normalizeReviewCardResponse(
    raw: ReviewCardResponse,
    index: number,
): ReviewCardResponse {
    const scope = `reviewCard[${index}]`

    return {
        reviewId: toSafeInteger(raw.reviewId, `${scope}.reviewId`),
        authorId: toNullableSafeInteger(raw.authorId, `${scope}.authorId`),
        authorName: toStringValue(raw.authorName, `${scope}.authorName`),
        rating: toSafeInteger(raw.rating, `${scope}.rating`),
        body: toStringValue(raw.body, `${scope}.body`),
        likedByMe: toBoolean(raw.likedByMe, `${scope}.likedByMe`),
        likeCount: toSafeNonNegativeInteger(raw.likeCount, `${scope}.likeCount`),
        commentCount: toSafeNonNegativeInteger(raw.commentCount, `${scope}.commentCount`),
        imageUrls: toNormalizedStringArray(raw.imageUrls, `${scope}.imageUrls`, {
            allowNullish: true,
        }),
        createdAt: toStringValue(raw.createdAt, `${scope}.createdAt`),
        updatedAt: toStringValue(raw.updatedAt, `${scope}.updatedAt`),
    }
}

/**
 * 리뷰 상세 응답을 검증하고 정규화.
 *
 * - 모든 필드를 개별 검증 함수로 처리 후 정규화된 객체 반환
 */
export function normalizeReviewDetailResponse(
    raw: ReviewDetailResponse,
): ReviewDetailResponse {
    return {
        reviewId: toSafeInteger(raw.reviewId, 'reviewDetail.reviewId'),
        keyId: toStringValue(raw.keyId, 'reviewDetail.keyId'),
        authorId: toNullableSafeInteger(raw.authorId, 'reviewDetail.authorId'),
        authorName: toStringValue(raw.authorName, 'reviewDetail.authorName'),
        rating: toSafeInteger(raw.rating, 'reviewDetail.rating'),
        body: toStringValue(raw.body, 'reviewDetail.body'),
        likedByMe: toBoolean(raw.likedByMe, 'reviewDetail.likedByMe'),
        likeCount: toSafeNonNegativeInteger(raw.likeCount, 'reviewDetail.likeCount'),
        commentCount: toSafeNonNegativeInteger(raw.commentCount, 'reviewDetail.commentCount'),
        imageUrls: toNormalizedStringArray(raw.imageUrls, 'reviewDetail.imageUrls', {
            allowNullish: true,
        }),
        createdAt: toStringValue(raw.createdAt, 'reviewDetail.createdAt'),
        updatedAt: toStringValue(raw.updatedAt, 'reviewDetail.updatedAt'),
    }
}

/**
 * 댓글 응답 단건을 검증하고 정규화.
 *
 * - index를 scope에 포함하여 어떤 항목에서 오류가 발생했는지 식별 가능하도록 처리
 */
export function normalizeReviewCommentResponse(
    raw: ReviewCommentResponse,
    index: number,
): ReviewCommentResponse {
    const scope = `reviewComment[${index}]`

    return {
        commentId: toSafeInteger(raw.commentId, `${scope}.commentId`),
        authorId: toNullableSafeInteger(raw.authorId, `${scope}.authorId`),
        authorName: toStringValue(raw.authorName, `${scope}.authorName`),
        body: toStringValue(raw.body, `${scope}.body`),
        createdAt: toStringValue(raw.createdAt, `${scope}.createdAt`),
        hidden: toBoolean(raw.hidden, `${scope}.hidden`),
    }
}

/**
 * 리뷰 작성/수정 요청 페이로드를 검증하고 정규화.
 *
 * - imageUrls의 null/undefined를 빈 배열로 정규화하여 서버에 안전하게 전달하기 위한 처리
 */
export function normalizeReviewWritePayload(
    payload: ReviewCreateRequest | ReviewUpdateRequest,
): { rating: number; body: string; imageUrls: string[] } {
    return {
        rating: toSafeInteger(payload.rating, 'reviewWrite.rating'),
        body: toStringValue(payload.body, 'reviewWrite.body'),
        imageUrls: toNormalizedStringArray(payload.imageUrls, 'reviewWrite.imageUrls', {
            allowNullish: true,
        }),
    }
}

/**
 * 댓글 작성 요청 페이로드를 검증하고 정규화.
 *
 * - body 필드를 toStringValue로 검증 후 반환
 */
export function normalizeCommentCreatePayload(
    payload: ReviewCommentCreateRequest,
): ReviewCommentCreateRequest {
    return {
        body: toStringValue(payload.body, 'reviewCommentCreate.body'),
    }
}
