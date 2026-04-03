// src/domains/admin/api/adminAttractions.ts

/**
 * adminAttractions.ts (admin 도메인 API 함수)
 *
 * 역할/목적:
 * - 관광지 관리와 관련된 관리자 전용 REST API 호출 함수를 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionImageUploadResponse  - 이미지 업로드 응답 타입
 *      · uploadAttractionCoverImage     - POST /admin/attractions/{keyId}/image → 대표 이미지 교체
 *
 * 동작 방식:
 * - FormData에 "file" 필드로 이미지를 첨부하여 업로드
 * - 응답으로 교체된 관광지의 keyId와 새 imageUrl을 반환
 *
 * 운영 포인트:
 * - 이 API는 ADMIN 역할 JWT가 필요하며, 인증 토큰 주입은 axios 인터셉터가 자동 처리
 * - keyId는 encodeURIComponent로 인코딩하여 path segment로 안전하게 포함
 */

import { api } from '@/shared/api/core/client'

export type AttractionImageUploadResponse = {
    keyId: string
    imageUrl: string
}

/** POST /admin/attractions/{keyId}/image — 관광지 대표 이미지 교체 */
export function uploadAttractionCoverImage(
    keyId: string,
    file: File
): Promise<AttractionImageUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)

    return api
        .post<AttractionImageUploadResponse>(
            `/admin/attractions/${encodeURIComponent(keyId)}/image`,
            formData
        )
        .then((res) => res.data)
}
