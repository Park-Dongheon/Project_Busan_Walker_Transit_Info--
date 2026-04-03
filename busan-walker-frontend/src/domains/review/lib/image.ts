// src/domains/review/lib/image.ts

/**
 * image.ts (Lib Layer - 리뷰 이미지 유효성 검사 유틸리티)
 *
 * 역할/목적:
 * - 리뷰에 첨부되는 이미지 URL 목록과 파일의 유효성을 검증하는 순수 함수 제공
 * - 허용 개수, 파일 크기, MIME 타입, URL 길이 제한을 클라이언트에서 미리 방어
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · REVIEW_IMAGE_MAX_COUNT            - 이미지 최대 등록 개수 상수
 *      · REVIEW_IMAGE_MAX_FILE_SIZE_BYTES  - 파일당 최대 크기 상수 (바이트)
 *      · REVIEW_IMAGE_URL_MAX_LENGTH       - URL 최대 길이 상수
 *      · ValidateReviewImageFilesOptions   - validateReviewImageFiles 옵션 타입
 *      · normalizeReviewImageUrls          - URL 배열 중복/빈값 제거 정규화 함수
 *      · parseReviewImageUrlText           - 줄바꿈/쉼표 구분 텍스트를 URL 배열로 파싱
 *      · validateReviewImageUrls           - URL 배열 유효성 검사 (개수/길이 제한)
 *      · validateReviewImageFiles          - File 배열 유효성 검사 (개수/크기/MIME 제한)
 *
 * 동작 방식:
 * - 검증 함수는 오류 메시지 문자열을 반환하고, 정상이면 null을 반환
 * - normalizeReviewImageUrls는 null/undefined 입력도 안전하게 처리
 * - validateReviewImageFiles는 currentImageCount 옵션으로 기존 이미지 개수를 합산
 *
 * 운영 포인트:
 * - 서버 측 제한(최대 개수, 파일 크기)이 변경되면 상수를 함께 수정
 * - ALLOWED_IMAGE_MIME_TYPES에 새 형식 추가 시 오류 메시지 문자열도 갱신
 */

export const REVIEW_IMAGE_MAX_COUNT = 10
export const REVIEW_IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
export const REVIEW_IMAGE_URL_MAX_LENGTH = 500

const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
])

export type ValidateReviewImageFilesOptions = {
    currentImageCount?: number
    maxCount?: number
    maxFileSizeBytes?: number
}

/**
 * URL 배열에서 null/undefined, 빈 문자열, 중복을 제거하고 정규화한 배열을 반환.
 *
 * - 배열이 아닌 입력은 빈 배열로 처리하여 런타임 오류를 방지
 */
export function normalizeReviewImageUrls(urls: readonly string[] | null | undefined): string[] {
    if (!Array.isArray(urls)) return []

    const uniq = new Set<string>()
    for (const raw of urls) {
        if (typeof raw !== "string") continue
        const trimmed = raw.trim()
        if (!trimmed) continue
        uniq.add(trimmed)
    }
    return Array.from(uniq)
}

/**
 * 줄바꿈(\n) 또는 쉼표(,) 로 구분된 URL 텍스트를 파싱하여 정규화한 URL 배열을 반환.
 *
 * - 텍스트 입력 방식으로 이미지 URL을 입력할 때 사용
 */
export function parseReviewImageUrlText(raw: string): string[] {
    return normalizeReviewImageUrls(raw.split(/[\n,]/g))
}

/**
 * URL 배열의 개수 및 URL 길이 제한을 검증.
 *
 * - 위반 시 한국어 오류 메시지를 반환하고, 정상이면 null을 반환
 */
export function validateReviewImageUrls(urls: readonly string[]): string | null {
    if (urls.length > REVIEW_IMAGE_MAX_COUNT) {
        return `리뷰 이미지는 최대 ${REVIEW_IMAGE_MAX_COUNT}개까지 등록할 수 있습니다.`
    }

    for (const url of urls) {
        if (url.length > REVIEW_IMAGE_URL_MAX_LENGTH) {
            return `이미지 URL은 ${REVIEW_IMAGE_URL_MAX_LENGTH}자를 넘을 수 없습니다.`
        }
    }

    return null
}

/**
 * File 배열의 개수, MIME 타입, 파일 크기를 검증.
 *
 * - currentImageCount 옵션으로 기존 등록된 이미지 수를 합산하여 총 개수를 검사
 * - 위반 시 한국어 오류 메시지를 반환하고, 정상이면 null을 반환
 */
export function validateReviewImageFiles(
    files: readonly File[],
    options: ValidateReviewImageFilesOptions = {}
): string | null {
    const currentImageCount = Math.max(0, Math.floor(options.currentImageCount ?? 0))
    const maxCount = options.maxCount ?? REVIEW_IMAGE_MAX_COUNT
    const maxFileSizeBytes = options.maxFileSizeBytes ?? REVIEW_IMAGE_MAX_FILE_SIZE_BYTES

    if (currentImageCount + files.length > maxCount) {
        return `리뷰 이미지는 최대 ${maxCount}개까지 등록할 수 있습니다.`
    }

    for (const file of files) {
        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
            return "이미지는 JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다."
        }
        if (file.size > maxFileSizeBytes) {
            const maxMb = Math.floor(maxFileSizeBytes / (1024 * 1024))
            return `이미지 파일은 ${maxMb}MB 이하만 업로드할 수 있습니다.`
        }
    }

    return null
}
