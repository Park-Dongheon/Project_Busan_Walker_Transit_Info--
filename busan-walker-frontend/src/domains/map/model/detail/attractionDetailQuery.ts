// src/domains/map/model/detail/attractionDetailQuery.ts

/**
 * attractionDetailQuery.ts (Map Model Query Contract)
 *
 * 역할/목적:
 * - 관광지 상세 조회와 prefetch가 공통으로 재사용하는 React Query 계약을 한곳에서 관리
 *
 * 공개 정책 / 설계 원칙:
 * - query key, fetch 함수, 캐시 정책처럼 공통 계약만 노출
 * - enabled, select 같은 화면 조합 정책은 각 훅에서 결정
 *
 * 동작 방식:
 * - attractionId를 정규화한 뒤 같은 query key와 같은 fetch 규칙으로 상세 API를 호출
 * - staleTime, gcTime, refetch 정책을 공통으로 제공해 상세 조회와 prefetch의 동작을 맞춤
 *
 * 운영 포인트:
 * - 백엔드 상세 API 경로나 캐시 정책이 바뀌면 이 파일부터 먼저 수정
 * - 이 파일의 규칙 변경은 상세 조회 hit율과 prefetch 체감 속도에 함께 영향
 */

import { api as attractionApi } from "@/domains/attraction";

import { MAP_DETAIL_GC_TIME, MAP_DETAIL_STALE_TIME } from "../cachePolicy";

export type AttractionDetail = Awaited<ReturnType<typeof attractionApi.getAttractionDetail>>

/**
 * 상세 조회와 prefetch가 공통으로 사용하는 React Query 캐시 정책
 *
 * - refetchOn* 옵션을 모두 비활성화하여 지도 화면 조작 중 불필요한 재조회를 방지
 * - staleTime / gcTime은 cachePolicy.ts의 도메인 상수를 재사용하여 정책 일관성을 유지
 */
export const attractionDetailQueryPolicy = {
    staleTime: MAP_DETAIL_STALE_TIME,
    gcTime: MAP_DETAIL_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false
} as const

/**
 * 관광지 ID를 trim하여 정규화
 *
 * - 공백이 포함된 ID가 서로 다른 query key를 만들지 않도록 통일
 */
export function normalizeAttractionDetailId(attractionId: string): string {
    return attractionId.trim()
}

/**
 * 정규화된 attractionId로 React Query query key를 생성
 *
 * - attraction 도메인의 key 생성 함수를 재사용하여 상세 조회와 prefetch의 키가 항상 일치하도록 보장
 */
export function buildAttractionDetailQueryKey(attractionId: string) {
    return attractionApi.attractionDetailQueryKey(normalizeAttractionDetailId(attractionId))
}

/**
 * 관광지 상세 API를 호출하는 공통 fetch 함수
 *
 * - ID를 정규화한 뒤 attraction 도메인 API에 위임
 * - AbortSignal을 전달하여 React Query의 취소 처리와 연동
 */
export function fetchAttractionDetail(attractionId: string, signal?: AbortSignal) {
    return attractionApi.getAttractionDetail(normalizeAttractionDetailId(attractionId), signal)
}