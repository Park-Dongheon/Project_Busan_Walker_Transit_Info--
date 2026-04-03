// cspell:ignore navermaps
/// <reference types="navermaps" />

/**
 * MapContainer.tsx (Map Domain Screen Container - 지도 화면 최상위 컨테이너)
 *
 * 역할/목적:
 * - map 도메인의 UI, 모델, 유틸을 조합해 실제 지도 화면을 구성하는 최상위 컨테이너
 * - 지도 초기화, 핀 조회, 선택 상태, 교통 오버레이, 패널 렌더링 흐름을 한곳에서 연결
 *
 * 공개 정책 / 설계 원칙:
 * - 외부에는 props 기반 화면 컴포넌트로만 노출
 * - export 대상:
 *      · MapContainer  - 지도 화면 전체를 구성하는 기본 내보내기 컴포넌트
 * - 세부 지도 제어 로직과 데이터 동기화는 model/lib 계층에 위임
 *
 * 동작 방식:
 * - URL/초기 뷰를 해석해 지도 인스턴스를 준비하고 bbox 기반 핀 조회를 수행
 * - 선택된 관광지 상세와 교통 파생 데이터를 조합해 오버레이와 패널에 전달
 * - 지도 상태 변화를 상위 콜백으로 통지하고 화면 레이아웃을 렌더링
 *
 * 운영 포인트:
 * - 이 파일 수정은 지도 UX의 진입 흐름 전체에 영향을 주므로 model/lib 경계 유지가 중요함
 * - 책임이 과도하게 커지면 화면 조합 로직과 표현 로직 분리를 우선 검토해야 함
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { toAttractionDetailPath } from "@/app/navigation/navigation";

import {
    estimateWalkFromCoords,
    parseInitialValue,
    resolveTransitDestinationName,
    resolveTransitRenderablePoint,
} from "../lib";
import {
    useAttractionPinMarkers,
    useAttractionPins,
    useMapContainerInteraction,
    useMapResizeObserver,
    useMapViewSync,
    useNaverMap,
    usePrefetchAttractionDetail,
    useResolvedTransitOptions,
    useSelectedAttractionDetail,
    useSelectedBboxState,
    useTransitOverlay,
    useTransitPanelItems,
} from "../model";
import type { AttractionPin, MapContainerProps, MapTransitOption } from "../types";
import MapTransitPanel from "./MapTransitPanel";

// 안정적인 빈 배열 참조 - 데이터가 없을 때 매 렌더마다 새 배열이 생성되어 불필요한 effect 트리거를 막기 위한 상수
const EMPTY_PINS: AttractionPin[] = []
const EMPTY_TRANSIT_OPTIONS: MapTransitOption[] = []

export default function MapContainer({
    className = "h-[400px]",
    mapClassName = "rounded-xl",
    keyword = "",
    myLocation = null,
    onMapHelpersReady,
    onResetToInitialView,
    onBboxParamChange,
    onMapStatusChange
}: MapContainerProps) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const selectedPinIdRef = useRef<string | null>(null)

    const [searchParams, setSearchParamsRaw] = useSearchParams()
    const setSearchParams = useCallback(
        (next: URLSearchParams, options?: { replace?: boolean }) => {
            setSearchParamsRaw(next, { replace: options?.replace ?? false })
        },
        [setSearchParamsRaw]
    )

    const [initialSearchParams] = useState(() => new URLSearchParams(searchParams))
    const [initialView] = useState(() => parseInitialValue(initialSearchParams))

    const { map, maps, mapReady, mapError, helpers } = useNaverMap({
        container: containerRef,
        initialView,
        initialSearchParams,
        setSearchParams
    })

    useEffect(() => {
        onMapHelpersReady?.(helpers)
    }, [helpers, onMapHelpersReady])

    useEffect(() => {
        return () => onMapHelpersReady?.(null)
    }, [onMapHelpersReady])

    useMapResizeObserver({ map, maps, container: containerRef })

    const {
        bboxParam,
        resetBboxParam,
        handleSetBbox,
        clearSelectedBboxSnapshot
    } = useSelectedBboxState({
        searchParams,
        selectedPinIdRef,
        setSearchParams
    })

    useEffect(() => {
        onBboxParamChange?.(bboxParam)
    }, [bboxParam, onBboxParamChange])

    useMapViewSync({
        map,
        maps,
        searchParams,
        setSearchParams,
        setBbox: handleSetBbox
    })

    const pinsQuery = useAttractionPins({
        bboxParam,
        size: 100,
        maxItems: 300,
        backgroundMaxItems: 1000,
        keyword
    })
    const pins = pinsQuery.data?.pins ?? EMPTY_PINS
    const pinCount = pins.length
    const totalPinCount = pinsQuery.data?.totalElements ?? null
    const isPinsTruncated = Boolean(pinsQuery.data?.isTruncated)

    useEffect(() => {
        onMapStatusChange?.({
            mapReady,
            pinCount,
            totalPinCount,
            isPinsFetching: pinsQuery.isFetching,
            isPinsTruncated
        })
    }, [isPinsTruncated, mapReady, onMapStatusChange, pinCount, pinsQuery.isFetching, totalPinCount])

    const {
        selectedPin,
        selectedPinId,
        isTransitPanelCollapsed,
        toggleTransitPanelCollapsed,
        suppressMapClickOnce,
        handlePinClick,
        focusTransitOption,
        requestWalkRouteLaunch
    } = useMapContainerInteraction({
        map,
        maps,
        container: containerRef,
        pins,
        myLocation,
        searchParams,
        setSearchParams,
        onResetToInitialView,
        resetBboxParam
    })

    useEffect(() => {
        selectedPinIdRef.current = selectedPinId
    }, [selectedPinId])

    const prefetchAttractionDetail = usePrefetchAttractionDetail()

    const handlePinClickWithCache = useCallback(
        (pin: AttractionPin) => {
            if (selectedPinId && selectedPinId !== pin.id) {
                clearSelectedBboxSnapshot()
            }

            prefetchAttractionDetail(pin.id)
            handlePinClick(pin)
        },
        [clearSelectedBboxSnapshot, handlePinClick, prefetchAttractionDetail, selectedPinId]
    )

    const selectedAttractionId = selectedPinId?.trim() ?? selectedPin?.id.trim() ?? ""
    const detailQuery = useSelectedAttractionDetail(selectedAttractionId)

    const effectiveSelectedPin = useMemo<AttractionPin | null>(() => {
        // selectedPin이 있으면 우선 사용 - 핀 클릭으로 즉시 선택된 경우
        if (selectedPin) return selectedPin

        // URL에서 복원된 selectedPinId는 있지만 pins 목록에 아직 없는 경우,
        // 상세 쿼리 결과에서 핀 정보를 임시 구성하여 오버레이와 패널을 바로 표시할 수 있게 함
        const detail = detailQuery.data
        if (!detail || selectedAttractionId.length === 0) return null

        const detailId = detail.keyId.trim()
        // 쿼리 응답이 현재 선택 ID와 일치하는 경우에만 사용하여 stale 데이터 혼용을 방지
        if (detailId !== selectedAttractionId) return null

        const lat = Number(detail.latitude)
        const lng = Number(detail.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        return {
            id: detail.keyId,
            name: detail.placeName || "이름 없음",
            lat,
            lng
        }
    }, [detailQuery.data, selectedAttractionId, selectedPin])

    const markerPins = useMemo<AttractionPin[]>(() => {
        if (!effectiveSelectedPin) return pins

        // 선택된 핀이 bbox 조회 결과 목록에 없을 수 있으므로, 없을 때만 추가하여 마커가 항상 표시되도록 보장
        const alreadyIncluded = pins.some((pin) => pin.id === effectiveSelectedPin.id)
        if (alreadyIncluded) return pins

        return [...pins, effectiveSelectedPin]
    }, [effectiveSelectedPin, pins])

    useAttractionPinMarkers({
        map,
        maps,
        pins: markerPins,
        selectedPinId,
        onPinClick: handlePinClickWithCache
    })

    const transitOptions = detailQuery.data?.transitOptions ?? EMPTY_TRANSIT_OPTIONS
    const resolvedTransitOptions = useResolvedTransitOptions({
        selectedAttractionId,
        transitOptions,
        myLocation
    })
    const hasTransitOptions = transitOptions.length > 0
    // 데이터가 없는 상태에서 최초 로딩 중인지 구분 (refreshing과 다름)
    const isTransitLoading = detailQuery.isFetching && !detailQuery.data
    const isTransitError = detailQuery.isError
    // 이미 데이터가 있는 상태에서 배경 갱신 중인 경우 - 사용자에게 별도 "업데이트 중" 메시지를 표시
    const isTransitRefreshing = !isTransitLoading && detailQuery.isFetching && hasTransitOptions
    // 재시도 버튼은 선택 ID가 있고 현재 요청 중이 아닐 때만 활성화
    const canRetryTransitQuery = selectedAttractionId.length > 0 && !detailQuery.isFetching

    const selectedPinWalkApprox = useMemo(
        () =>
            effectiveSelectedPin
                ? estimateWalkFromCoords(myLocation, {
                    lat: effectiveSelectedPin.lat,
                    lng: effectiveSelectedPin.lng,
                })
                : null,
        [effectiveSelectedPin, myLocation]
    )

    const launchNaverWalkRouteForTransitOption = useCallback(
        (option: MapTransitOption): boolean => {
            const point = resolveTransitRenderablePoint(option)
            if (!point) return false

            requestWalkRouteLaunch({
                lat: point.lat,
                lng: point.lng,
                name: resolveTransitDestinationName(option)
            })

            return true
        },
        [requestWalkRouteLaunch]
    )

    const handleTransitMarkerClick = useCallback(
        (option: MapTransitOption) => {
            suppressMapClickOnce()
            launchNaverWalkRouteForTransitOption(option)
        },
        [launchNaverWalkRouteForTransitOption, suppressMapClickOnce]
    )

    const openTransitInfoByOption = useTransitOverlay({
        map,
        maps,
        selectedPin: effectiveSelectedPin,
        transitOptions: resolvedTransitOptions,
        onTransitMarkerClick: handleTransitMarkerClick,
        autoFitBounds: false,
        autoOpenFirst: true
    })

    const handleTransitOptionClick = useCallback(
        (option: MapTransitOption) => {
            if (!focusTransitOption(option)) return

            openTransitInfoByOption(option)
            launchNaverWalkRouteForTransitOption(option)
        },
        [focusTransitOption, launchNaverWalkRouteForTransitOption, openTransitInfoByOption]
    )

    const transitOptionItems = useTransitPanelItems({
        transitOptions: resolvedTransitOptions,
    })
    const selectedPinDetailPath = selectedAttractionId ? toAttractionDetailPath(selectedAttractionId) : ""

    const handleRetryTransitQuery = useCallback(() => {
        void detailQuery.refetch()
    }, [detailQuery])

    return (
        <div className={`relative w-full ${className}`}>
            <div ref={containerRef} className={`h-full w-full bg-slate-200 ${mapClassName}`} />

            {mapError ? (
                <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-4">
                    <div className="max-w-md rounded-xl border border-red-200 bg-red-50/95 px-4 py-3 text-center text-sm font-semibold text-red-700 shadow">
                        {mapError}
                    </div>
                </div>
            ) : null}

            {effectiveSelectedPin ? (
                <MapTransitPanel
                    selectedPin={effectiveSelectedPin}
                    detailPath={selectedPinDetailPath}
                    isCollapsed={isTransitPanelCollapsed}
                    onToggleCollapsed={toggleTransitPanelCollapsed}
                    selectedPinWalkApprox={selectedPinWalkApprox}
                    isTransitLoading={isTransitLoading}
                    isTransitRefreshing={isTransitRefreshing}
                    isTransitError={isTransitError}
                    canRetryTransitQuery={canRetryTransitQuery}
                    onRetryTransitQuery={handleRetryTransitQuery}
                    transitOptionItems={transitOptionItems}
                    hasTransitOptions={hasTransitOptions}
                    isTransitFetching={detailQuery.isFetching}
                    onTransitOptionClick={handleTransitOptionClick}
                />
            ) : null}
        </div>
    )
}