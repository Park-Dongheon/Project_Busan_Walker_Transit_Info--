// src/domains/map/model/detail/useSelectedAttractionDetail.ts

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { normalizeTransitOptions } from "../../lib";
import type { MapAttractionDetail } from "../../types";
import {
    attractionDetailQueryPolicy,
    buildAttractionDetailQueryKey,
    fetchAttractionDetail,
    normalizeAttractionDetailId,
    type AttractionDetail
} from "./attractionDetailQuery";

/**
 * useSelectedAttractionDetail.ts (Map Selected Detail Query Hook)
 *
 * 역할/목적:
 * - 현재 선택된 관광지 ID를 기준으로 상세 데이터를 조회하고 지도 화면 전용 모델로 변환
 *
 * 공개 정책 / 설계 원칙:
 * - 컴포넌트에는 MapAttractionDetail만 넘기고, API 원본 DTO는 내부에서만 다룸
 * - query key와 fetch 정책은 공통 contract를 재사용해 prefetch와 정합성을 유지
 *
 * 동작 방식:
 * - 선택된 ID를 정규화한 뒤 React Query로 상세 API를 호출
 * - 조회 성공 데이터는 `normalizeTransitOptions`를 거쳐 지도 화면에서 바로 쓸 수 있는 형태로 변환
 *
 * 운영 포인트:
 * - 상세 응답 필드가 바뀌면 아래의 select 함수부터 먼저 점검
 * - 선택 ID가 비어 있으면 쿼리가 실행되지 않는 것이 정상 동작
 */

/**
 * 백엔드 상세 DTO를 지도 화면 전용 모델로 변환
 */
function selectMapAttractionDetail(detail: AttractionDetail): MapAttractionDetail {
    return {
        keyId: detail.keyId,
        placeName: detail.placeName,
        latitude: detail.latitude,
        longitude: detail.longitude,
        transitOptions: normalizeTransitOptions(detail.transitOptions)
    }
}

/**
 * 현재 선택된 관광지의 상세 정보를 조회
 */
export function useSelectedAttractionDetail(selectedAttractionId: string): UseQueryResult<MapAttractionDetail, Error> {
    const normalizedAttractionId = normalizeAttractionDetailId(selectedAttractionId);

    return useQuery<AttractionDetail, Error, MapAttractionDetail>({
        queryKey: buildAttractionDetailQueryKey(normalizedAttractionId),
        enabled: normalizedAttractionId.length > 0,
        ...attractionDetailQueryPolicy,
        queryFn: ({ signal }) => fetchAttractionDetail(normalizedAttractionId, signal),
        select: selectMapAttractionDetail
    })
}