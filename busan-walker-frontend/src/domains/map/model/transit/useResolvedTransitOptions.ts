// src/domains/map/model/transit/useResolvedTransitOptions.ts

import { useMemo, useRef } from "react";

import {
    buildResolvedTransitOptions,
    buildResolvedTransitOptionsCacheKey,
    type ResolvedTransitOption
} from "../../lib";
import type { GeoPoint, MapTransitOption } from "../../types";
import { MAP_TRANSIT_DERIVED_CACHE_MAX } from "../cachePolicy";

/**
 * useResolvedTransitOptions.ts (Map Transit Derived Cache Hook)
 *
 * 역할/목적:
 * - 정규화된 교통 옵션 목록을 패널과 오버레이에서 재사용할 파생 모델로 변환
 * - 같은 입력 조합에 대해서는 로컬 LRU 캐시를 사용해 재계산을 줄임
 *
 * 공개 정책 / 설계 원칙:
 * - 훅은 캐시 orchestration만 담당하고 실제 파생 계산 규칙은 `transitDerived`에 위임
 * - 서버 응답 원본 대신 `ResolvedTransitOption[]`만 외부에 노출
 *
 * 동작 방식:
 * - 관광지 ID, 교통 옵션 목록, 내 위치를 기준으로 cache key를 만듦
 * - cache hit면 기존 결과를 재사용하고, miss면 새로 계산해 캐시에 저장
 *
 * 운영 포인트:
 * - cache key 규칙이 바뀌면 hit율과 재계산 빈도에 직접 영향
 * - 캐시 최대 크기는 `MAP_TRANSIT_DERIVED_CACHE_MAX`로 조절
 */

/**
 * 캐시에서 파생 결과를 읽고 hit 시 최신 사용 순서로 승격
 */
function readCachedResolvedTransitOptions(
    cache: Map<string, ResolvedTransitOption[]>,
    cacheKey: string
): ResolvedTransitOption[] | null {
    const cached = cache.get(cacheKey) ?? null
    if (!cached) return null

    cache.delete(cacheKey)
    cache.set(cacheKey, cached)

    return cached
}

/**
 * 새 파생 결과를 캐시에 저장하고 최대 크기를 넘으면 가장 오래된 항목을 제거
 */
function cacheResolvedTransitOptions(args: {
    cache: Map<string, ResolvedTransitOption[]>
    cacheKey: string
    value: ResolvedTransitOption[]
    maxSize: number
}): void {
    const { cache, cacheKey, value, maxSize } = args

    if (cache.has(cacheKey)) {
        cache.delete(cacheKey)
    }
    cache.set(cacheKey, value)

    while (cache.size > maxSize) {
        const oldestKey = cache.keys().next().value
        if (typeof oldestKey !== "string") break
        cache.delete(oldestKey)
    }
}

/**
 * 교통 옵션 목록을 파생 모델 목록으로 변환
 */
export function useResolvedTransitOptions(args: {
    selectedAttractionId: string
    transitOptions: MapTransitOption[]
    myLocation?: GeoPoint | null
}): ResolvedTransitOption[] {
    const {
        selectedAttractionId,
        transitOptions,
        myLocation = null
    } = args

    const cacheRef = useRef<Map<string, ResolvedTransitOption[]>>(new Map())

    return useMemo(() => {
        const cacheKey = buildResolvedTransitOptionsCacheKey({
            selectedAttractionId,
            transitOptions,
            myLocation
        })

        const cached = readCachedResolvedTransitOptions(cacheRef.current, cacheKey)
        if (cached) return cached

        const built = buildResolvedTransitOptions(transitOptions, myLocation)
        cacheResolvedTransitOptions({
            cache: cacheRef.current,
            cacheKey,
            value: built,
            maxSize: MAP_TRANSIT_DERIVED_CACHE_MAX
        })

        return built
    }, [myLocation, selectedAttractionId, transitOptions])
}