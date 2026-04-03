// src/domains/map/types/public.ts

/// <reference types='navermaps' />

/**
 * public.ts (Map Domain - 외부 공개 타입 계약)
 *
 * 역할/목적:
 * - map 도메인이 외부 레이어(페이지, 다른 도메인, UI 조합)에 노출하는
 *   공식 타입 계약을 한 곳에서 관리
 * - 지도 컨테이너 props, 좌표, 뷰 상태, 헬퍼 콜백 등
 *   외부에서 map 도메인을 사용하기 위해 반드시 알아야 하는 타입만 포함
 * - 네이버 지도 SDK 전역 Window 확장도 이 파일에서 선언하여
 *   SDK 의존 타입의 범위를 도메인 경계 내로 제한
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · BBox                - 지도 경계 영역 배열 타입 (shared BBox의 re-export)
 *      · AttractionPin       - 지도 핀으로 렌더링되는 관광지 최소 데이터
 *      · GeoPoint            - 위도/경도 좌표 쌍
 *      · MapHelpers          - 지도 인스턴스 조작 헬퍼 함수 묶음
 *      · InitialView         - URL 쿼리에서 파싱된 초기 지도 뷰 상태
 *      · MapContainerProps   - MapContainer 컴포넌트 외부 props 계약
 *      · SetSearchParamsFn   - URL 쿼리 파라미터 갱신 함수 시그니처
 *
 * 동작 방식:
 * - BBox는 shared 레이어 타입을 re-export하여 도메인 내 별칭으로 사용
 * - Window 전역 확장은 네이버 지도 SDK의 callback/auth 연동에 필요한 최소 항목만 선언
 *
 * 운영 포인트:
 * - MapContainerProps 변경은 MapContainer 컴포넌트와 호출부를 함께 검토
 * - Window 전역 확장 항목이 바뀌면 naverMapsLoader와 함께 점검
 */

import type { BBox as SharedBBox } from '@/shared/types';

export type BBox = SharedBBox

export type AttractionPin = {
    id: string
    name: string
    lat: number
    lng: number
}

export type GeoPoint = {
    lat: number
    lng: number
}

export type MapHelpers = {
    geocodeAndMove: (query: string) => void
    fitToCoords: (coords: GeoPoint[]) => void
    locateMe: () => Promise<GeoPoint>
    clearMyLocation: () => void
}

export type InitialView = {
    lat: number | null
    lng: number | null
    zoom: number | null
    hasLatLngInQuery: boolean
}

export type MapContainerProps = {
    className?: string
    mapClassName?: string
    keyword?: string
    myLocation?: GeoPoint | null
    onMapHelpersReady?: (helpers: MapHelpers | null) => void
    onResetToInitialView?: () => void
    onBboxParamChange?: (bboxParam: string) => void
    onMapStatusChange?: (status: {
        mapReady: boolean
        pinCount: number
        totalPinCount: number | null
        isPinsFetching: boolean
        isPinsTruncated: boolean
    }) => void
}

export type SetSearchParamsFn = (
    next: URLSearchParams,
    options?: { replace?: boolean },
) => void

declare global {
    interface Window {
        naver?: typeof naver
        __initNaverMap__?: () => void
        navermap_authFailure?: () => void
    }
}