// src/domains/map/model/detail/usePrefetchAttractionDetail.ts

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
    attractionDetailQueryPolicy,
    buildAttractionDetailQueryKey,
    fetchAttractionDetail,
    normalizeAttractionDetailId
} from "./attractionDetailQuery";

/**
 * usePrefetchAttractionDetail.ts (Map Detail Prefetch Hook)
 *
 * 역할/목적:
 * - 사용자가 곧 선택할 가능성이 높은 관광지 상세 데이터를 미리 캐시에 적재
 *
 * 공개 정책 / 설계 원칙:
 * - 실제 상세 조회와 같은 query key와 같은 정책을 사용
 * - 화면 상태를 직접 바꾸지 않고 캐시 예열만 담당
 *
 * 동작 방식:
 * - attractionId를 정규화한 뒤 비어 있지 않을 때만 `prefetchQuery`를 실행
 * - 상세 조회와 동일한 fetch 함수와 캐시 정책을 재사용
 *
 * 운영 포인트:
 * - prefetch 시점은 UX와 네트워크 비용의 균형이 중요
 * - 상세 조회 contract가 바뀌면 이 훅도 같은 contract를 재사용하는지 함께 점검
 */

export function usePrefetchAttractionDetail(): (attractionId: string) => void {
    const queryClient = useQueryClient()

    return useCallback(
        /**
         * 관광지 상세 데이터를 미리 캐시에 적재
         */
        (attractionId: string) => {
            const normalizedAttractionId = normalizeAttractionDetailId(attractionId)
            if (normalizedAttractionId.length === 0) return

            void queryClient.prefetchQuery({
                queryKey: buildAttractionDetailQueryKey(normalizedAttractionId),
                ...attractionDetailQueryPolicy,
                queryFn: ({ signal }) => fetchAttractionDetail(normalizedAttractionId, signal)
            })
        },
        [queryClient]
    )
}