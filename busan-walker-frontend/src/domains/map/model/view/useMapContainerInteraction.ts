// src/domains/map/model/view/useMapContainerInteraction.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

/**
 * useMapContainerInteraction.ts (지도 뷰 - 선택·포커스·URL 상호작용 오케스트레이션 훅)
 *
 * 역할/목적:
 * - 지도 화면의 핀 선택 상태, 포커스 이동, URL 동기화, 도보 경로 실행 요청을 한 곳에서 조합
 * - 지도 SDK 직접 제어가 필요한 UI 오케스트레이션 책임을 단일 훅으로 캡슐화
 *
 * 데이터 흐름:
 *   pins / searchParams / map / maps
 *      ↓  handlePinClick() / focusTransitOption()
 *   선택 상태(selectedPin, selectedPinId) + URL query 동기화
 *      ↓  syncSelectionQueryParams()
 *   setSearchParams (replace)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useMapContainerInteraction  - 선택·포커스·URL 동기화·도보 경로 요청을 조율하는 훅
 * - 좌표 계산이나 URL 파라미터 규칙처럼 재사용 가능한 로직은 lib와 selection 계층을 재사용
 * - 선택 상태 query key가 바뀌면 이 훅과 selection 하위 모듈을 함께 수정
 *
 * 동작 방식:
 * - 핀 선택 시 지도 중심·줌을 조정하고 선택 상태를 URL query와 함께 동기화
 * - 교통 옵션 포커스, Escape 해제, 지도 클릭 해제, 모바일 도보 경로 실행을 하나의 훅에서 조율
 * - 선택 해제 시 선택 직전 지도 뷰(center/zoom)를 복원
 * - 휠 줌으로 최소 줌 미만이 되면 선택 상태를 자동으로 해제
 *
 * 운영 포인트:
 * - 선택 상태 query key가 바뀌면 이 훅과 selection 하위 모듈을 함께 수정
 * - 모바일 경로 실행 문구나 줌 정책이 바뀌면 아래 상수와 경로 실행 분기를 같이 점검
 * - 선택 해제 복원 뷰(reset view)가 URL에 저장되므로, query key 이름 변경 시 복원 로직도 확인
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as mapLib from "../../lib";
import { isValidGeoPoint, isValidLatitude, isValidLongitude } from "../../lib/geo";
import type { AttractionPin, GeoPoint, MapTransitOption, SetSearchParamsFn } from "../../types";
import {
    normalizeSelectedPinId,
    RESET_VIEW_LAT_QUERY_KEY,
    RESET_VIEW_LNG_QUERY_KEY,
    RESET_VIEW_ZOOM_QUERY_KEY,
    SELECTED_PIN_QUERY_KEY,
    TRANSIT_PANEL_COLLAPSED_QUERY_KEY
} from "../selection";

/* 관광지 선택 시 지도를 이 줌 이상으로 확대하여 마커 주변 맥락이 보이도록 보장 */
const ATTRACTION_FOCUS_MIN_ZOOM = 14

/* 교통 옵션 포커스 시 적용하는 고정 줌 - 시설 주변 도보 경로를 확인하기 적절한 수준 */
const TRANSIT_FOCUS_ZOOM = 14

/* 휠 입력 후 이 시간 안에 idle이 발생하면 줌 아웃 초기화 판정 대상으로 취급 */
const WHEEL_RESET_WINDOW_MS = 1_200

/* 마커/교통 옵션 클릭 직후 지도 클릭 이벤트가 동시에 발생하는 상황을 억제하는 윈도우 */
const MAP_CLICK_SUPPRESS_WINDOW_MS = 80

/* 지도 중심 이동 판정 시 좌표 차이가 이 값 이하이면 같은 위치로 간주 */
const MAP_FOCUS_COORD_EPSILON = 0.00005

type WalkRouteTarget = {
    lat: number
    lng: number
    name?: string
}

type FocusTransitOptionArgs = {
    suppressMapClick?: boolean
}

type MapViewSnapshot = {
    center: GeoPoint
    zoom: number
    latParam: string | null
    lngParam: string | null
    zoomParam: string | null
}

/* 위도/경도 숫자 쌍이 모두 유효한 좌표 범위인지 검사 */
function isValidLatLng(lat: number, lng: number): boolean {
    return isValidLatitude(lat) && isValidLongitude(lng)
}

/* 두 좌표가 MAP_FOCUS_COORD_EPSILON 이하 차이이면 같은 위치로 취급 */
function isSameCoordApprox(a: number, b: number): boolean {
    return Math.abs(a - b) <= MAP_FOCUS_COORD_EPSILON
}

/**
 * URL query의 패널 접힘 플래그 문자열을 boolean으로 파싱
 *
 * - "1" / "true" -> true, "0" / "false" -> false, 그 외 -> null
 */
function parseCollapsedQueryFlag(value: string | null): boolean | null {
    if (value === "1" || value === "true") return true
    if (value === "0" || value === "false") return false

    return null
}

/**
 * URL query 문자열을 유한 숫자로 파싱
 *
 * - 숫자로 변환할 수 없거나 Infinity/NaN이면 null을 반환
 */
function parseFiniteQueryNumber(value: string | null): number | null {
    if (typeof value !== "string") return null

    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
}

/**
 * 현재 실행 환경이 모바일 디바이스인지 감지
 *
 * - 우선순위: userAgentData.mobile → userAgent 패턴 → touchPoints + pointer 미디어 쿼리
 * - 네이버 도보 경로를 딥링크로 실행할지 여부를 결정하는 데 사용
 */
function isMobileRuntime(): boolean {
    if (typeof navigator === "undefined") return false

    const userAgentData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
    if (userAgentData?.mobile === true) return true

    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true

    if (navigator.maxTouchPoints >= 5 && typeof window !== "undefined") {
        return window.matchMedia("(pointer:coarse)").matches
    }

    return false
}

/**
 * 지도 화면의 핀 선택·포커스·URL 동기화·도보 경로 실행을 조율
 *
 * 반환값:
 * - selectedPin / selectedPinId: 현재 선택된 핀 상태
 * - isTransitPanelCollapsed: 교통 패널 접힘 여부
 * - toggleTransitPanelCollapsed: 패널 접힘 토글
 * - suppressMapClickOnce: 마커/패널 클릭 직후 지도 클릭 이벤트를 한 번 억제
 * - handlePinClick: 핀 클릭 시 선택 상태 업데이트, 지도 포커스, URL 동기화
 * - focusTransitOption: 교통 옵션의 좌표로 지도 이동 및 줌 조정
 * - requestWalkRouteLaunch: 모바일 환경에서 네이버 도보 경로 딥링크 실행 요청
 */
export function useMapContainerInteraction(args: {
    map: naver.maps.Map | null
    maps: typeof naver.maps | null
    container: React.RefObject<HTMLDivElement | null>
    pins: AttractionPin[]
    myLocation?: GeoPoint | null
    searchParams: URLSearchParams
    setSearchParams: SetSearchParamsFn
    onResetToInitialView?: () => void
    resetBboxParam?: () => void
}): {
    selectedPin: AttractionPin | null
    selectedPinId: string | null
    isTransitPanelCollapsed: boolean
    toggleTransitPanelCollapsed: () => void
    suppressMapClickOnce: () => void
    handlePinClick: (pin: AttractionPin) => void
    focusTransitOption: (option: MapTransitOption, options?: FocusTransitOptionArgs) => boolean
    requestWalkRouteLaunch: (target: WalkRouteTarget) => void
} {
    const {map, maps, container, pins, myLocation = null, searchParams, setSearchParams, onResetToInitialView, resetBboxParam} = args

    const [selectedPin, setSelectedPin] = useState<AttractionPin | null>(null)
    const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
    const [isTransitPanelCollapsed, setIsTransitPanelCollapsed] = useState<boolean>(false)
    const [pendingWalkRouteTarget, setPendingWalkRouteTarget] = useState<WalkRouteTarget | null>(null)


    // SDK 이벤트 핸들러가 stale searchParams를 참조하지 않도록 최신 값을 ref로 유지
    const searchParamsRef = useRef<URLSearchParams>(searchParams)

    // 마커/교통 클릭 직후 지도 클릭 억제 만료 시각 (Unix ms)
    const suppressMapClickUntilRef = useRef<number>(0)

    // 휠 줌 입력이 감지된 마지막 만료 시각 - idle 시 줌 아웃 초기화 판정에 사용
    const wheelResetDeadlineRef = useRef<number>(0)

    // 핀 선택 직전의 지도 뷰(center/zoom/URL 파라미터)를 보관 - 선택 해제 시 복원용
    const mapViewBeforeSelectionRef = useRef<MapViewSnapshot | null>(null)

    // URL query에서 초기 선택 상태를 1회만 복원했는지 추적하는 게이트
    const didHydrateFromQueryRef = useRef<boolean>(false)

    // URL hydration 직후 선택 상태 변경 effect가 불필요한 URL 덮어쓰기를 하지 않도록 차단
    const skipNextSelectionSyncRef = useRef<boolean>(false)

    useEffect(() => {
        searchParamsRef.current = searchParams
    }, [searchParams])


    useEffect(() => {
        if (didHydrateFromQueryRef.current) return
        didHydrateFromQueryRef.current = true
        skipNextSelectionSyncRef.current = true

        const selectedPinIdFromQuery = normalizeSelectedPinId(searchParamsRef.current.get(SELECTED_PIN_QUERY_KEY))
        const collapsedFromQuery = parseCollapsedQueryFlag(
            searchParamsRef.current.get(TRANSIT_PANEL_COLLAPSED_QUERY_KEY)
        )
        const resetLatParam = searchParamsRef.current.get(RESET_VIEW_LAT_QUERY_KEY)
        const resetLngParam = searchParamsRef.current.get(RESET_VIEW_LNG_QUERY_KEY)
        const resetZoomParam = searchParamsRef.current.get(RESET_VIEW_ZOOM_QUERY_KEY)

        if (selectedPinIdFromQuery) {
            setSelectedPinId(selectedPinIdFromQuery)

            const resetLat = parseFiniteQueryNumber(resetLatParam)
            const resetLng = parseFiniteQueryNumber(resetLngParam)
            const resetZoom = parseFiniteQueryNumber(resetZoomParam)


            if (resetLat !== null && resetLng !== null && isValidLatLng(resetLat, resetLng)) {
                const safeZoom = resetZoom !== null ? mapLib.normalizeZoom(resetZoom) : mapLib.DEFAULT_ZOOM
                mapViewBeforeSelectionRef.current = {
                    center: { lat: resetLat, lng: resetLng },
                    zoom: safeZoom,
                    latParam: resetLatParam,
                    lngParam: resetLngParam,
                    zoomParam: resetZoom !== null ? String(Math.round(resetZoom)) : String(safeZoom)
                }
            }
        }

        if (collapsedFromQuery !== null) {
            setIsTransitPanelCollapsed(collapsedFromQuery)
        }
    }, [])


    /**
     * 다음 지도 클릭 이벤트를 억제
     *
     * - 마커 클릭이 지도 클릭으로 중복 처리되는 상황을 방지하기 위해 짧은 시간 억제
     */
    const suppressNextMapClick = useCallback(() => {
        suppressMapClickUntilRef.current = Date.now() + MAP_CLICK_SUPPRESS_WINDOW_MS
    }, [])

    /**
     * 외부에서 한 번 지도 클릭을 억제하도록 요청할 수 있는 공개 인터페이스
     */
    const suppressMapClickOnce = useCallback(() => {
        suppressNextMapClick()
    }, [suppressNextMapClick])

    /** 교통 패널 접힘/펼침 상태를 토글 */
    const toggleTransitPanelCollapsed = useCallback(() => {
        setIsTransitPanelCollapsed((prev) => !prev)
    }, [])

    /**
     * 선택 상태(핀 ID, 패널 상태, 복원 뷰)를 URL query에 동기화
     *
     * - 선택 중이면 sid / spc / srlat / srlng / srz를 설정
     * - 선택 해제이면 관련 파라미터를 모두 제거
     * - 변경이 없으면 setSearchParams를 호출하지 않아 불필요한 히스토리 오염을 방지
     */
    const syncSelectionQueryParams = useCallback(
        (nextSelectedPinId: string | null, nextIsPanelCollapsed: boolean) => {
            const currentParams = searchParamsRef.current
            const nextParams = new URLSearchParams(currentParams)

            if (nextSelectedPinId) {
                nextParams.set(SELECTED_PIN_QUERY_KEY, nextSelectedPinId)
                nextParams.set(TRANSIT_PANEL_COLLAPSED_QUERY_KEY, nextIsPanelCollapsed ? "1" : "0")

                const snapshot = mapViewBeforeSelectionRef.current
                if (snapshot) {
                    const snapshotLatParam = snapshot.latParam ?? snapshot.center.lat.toFixed(6)
                    const snapshotLngParam = snapshot.lngParam ?? snapshot.center.lng.toFixed(6)
                    const snapshotZoomParam = snapshot.zoomParam ?? String(snapshot.zoom)

                    nextParams.set(RESET_VIEW_LAT_QUERY_KEY, snapshotLatParam)
                    nextParams.set(RESET_VIEW_LNG_QUERY_KEY, snapshotLngParam)
                    nextParams.set(RESET_VIEW_ZOOM_QUERY_KEY, snapshotZoomParam)
                }
            } else {
                nextParams.delete(SELECTED_PIN_QUERY_KEY)
                nextParams.delete(TRANSIT_PANEL_COLLAPSED_QUERY_KEY)
                nextParams.delete(RESET_VIEW_LAT_QUERY_KEY)
                nextParams.delete(RESET_VIEW_LNG_QUERY_KEY)
                nextParams.delete(RESET_VIEW_ZOOM_QUERY_KEY)
            }

            const currentSerialized = currentParams.toString()
            const nextSerialized = nextParams.toString()
            if (currentSerialized === nextSerialized) return

            searchParamsRef.current = nextParams
            setSearchParams(nextParams, { replace: true })
        },
        [setSearchParams]
    )


    /**
     * 핀 선택 직전 지도 뷰(center/zoom/URL 파라미터)를 스냅샷으로 보관
     *
     * - 선택 해제 시 이 스냅샷으로 되돌아가므로, 선택 전에 반드시 호출해야 함
     * - URL query 파라미터 원본값(latParam/lngParam/zoomParam)을 함께 저장하여
     *   복원 시 URL 표현을 원래대로 유지
     */
    const captureMapViewBeforeSelection = useCallback(() => {
        if (!map) return

        const center = map.getCenter()
        const lat = mapLib.latOf(center)
        const lng = mapLib.lngOf(center)

        if (!isValidLatLng(lat, lng)) return

        const zoom = Number(map.getZoom())
        const safeZoom = Number.isFinite(zoom) ? mapLib.normalizeZoom(zoom) : mapLib.DEFAULT_ZOOM

        const latestSearchParams = searchParamsRef.current
        mapViewBeforeSelectionRef.current = {center: { lat, lng },
                                             zoom: safeZoom,
                                             latParam: latestSearchParams.get("lat"),
                                             lngParam: latestSearchParams.get("lng"),
                                             zoomParam: latestSearchParams.get("z")}
    }, [map])


    /**
     * 핀 선택 직전에 보관된 지도 뷰를 복원
     *
     * - 스냅샷이 없거나 map/maps가 준비되지 않은 경우 아무 동작도 하지 않음
     * - URL query도 스냅샷 당시 파라미터로 함께 복원하여 페이지 공유 상태와 일관성을 유지
     */
    const restoreMapViewBeforeSelection = useCallback(() => {
        const snapshot = mapViewBeforeSelectionRef.current
        if (!snapshot || !map || !maps) return
        if (!isValidGeoPoint(snapshot.center)) return

        const center = new maps.LatLng(snapshot.center.lat, snapshot.center.lng)
        map.panTo(center)

        const currentZoom = Number(map.getZoom())
        if (!Number.isFinite(currentZoom) || currentZoom !== snapshot.zoom) {
            map.setZoom(snapshot.zoom)
        }

        const currentParams = searchParamsRef.current
        const nextParams = new URLSearchParams(currentParams)

        if (snapshot.latParam === null) nextParams.delete("lat")
        else nextParams.set("lat", snapshot.latParam)

        if (snapshot.lngParam === null) nextParams.delete("lng")
        else nextParams.set("lng", snapshot.lngParam)

        if (snapshot.zoomParam === null) nextParams.delete("z")
        else nextParams.set("z", snapshot.zoomParam)

        const currentSerialized = currentParams.toString()
        const nextSerialized = nextParams.toString()
        if (currentSerialized !== nextSerialized) {
            setSearchParams(nextParams, { replace: true })
        }
    }, [map, maps, setSearchParams])


    /**
     * 선택 상태를 완전히 초기화하고 선택 전 지도 뷰로 복원
     *
     * - 지도 클릭, Escape 키, 줌 아웃 초기화 등 여러 해제 경로가 이 함수로 수렴
     * - onResetToInitialView / resetBboxParam을 통해 외부 상태도 함께 초기화
     */
    const resetToInitialTransitMapView = useCallback(() => {
        restoreMapViewBeforeSelection()
        mapViewBeforeSelectionRef.current = null

        setSelectedPin(null)
        setSelectedPinId(null)
        setIsTransitPanelCollapsed(false)
        setPendingWalkRouteTarget(null)
        suppressMapClickUntilRef.current = 0

        resetBboxParam?.()
        onResetToInitialView?.()
    }, [onResetToInitialView, resetBboxParam, restoreMapViewBeforeSelection])


    const handlePinClick = useCallback(
        (pin: AttractionPin) => {
            if (!isValidLatLng(pin.lat, pin.lng)) return

            if (selectedPinId === null) {
                captureMapViewBeforeSelection()
            }

            const isSameSnapshot = selectedPinId === pin.id &&
                                   selectedPin?.name === pin.name &&
                                   selectedPin?.lat === pin.lat &&
                                   selectedPin?.lng === pin.lng

            if (!isSameSnapshot) {
                setSelectedPin(pin)
                setSelectedPinId(pin.id)
                setIsTransitPanelCollapsed(false)
            }

            if (!map || !maps) return

            suppressNextMapClick()

            const nextCenter = new maps.LatLng(pin.lat, pin.lng)
            const zoom = Number(map.getZoom())
            const currentCenter = map.getCenter()
            const centerLat = mapLib.latOf(currentCenter)
            const centerLng = mapLib.lngOf(currentCenter)

            const shouldPan = !isValidLatLng(centerLat, centerLng) ||
                              !isSameCoordApprox(centerLat, pin.lat) ||
                              !isSameCoordApprox(centerLng, pin.lng)

            if (!Number.isFinite(zoom) || zoom < ATTRACTION_FOCUS_MIN_ZOOM) {
                map.setZoom(ATTRACTION_FOCUS_MIN_ZOOM)
            }

            if (shouldPan) {
                map.panTo(nextCenter)
            }
        },
        [captureMapViewBeforeSelection, map, maps, selectedPin, selectedPinId, suppressNextMapClick]
    )


    const focusTransitOption = useCallback(
        (option: MapTransitOption, options?: FocusTransitOptionArgs): boolean => {
            if (!map || !maps) return false

            const point = mapLib.resolveTransitRenderablePoint(option)
            if (!point) return false

            if (options?.suppressMapClick) {
                suppressNextMapClick()
            }

            const nextCenter = new maps.LatLng(point.lat, point.lng)
            const zoom = Number(map.getZoom())
            const currentCenter = map.getCenter()
            const centerLat = mapLib.latOf(currentCenter)
            const centerLng = mapLib.lngOf(currentCenter)

            const shouldPan = !isValidLatLng(centerLat, centerLng) ||
                              !isSameCoordApprox(centerLat, point.lat) ||
                              !isSameCoordApprox(centerLng, point.lng)

            if (!Number.isFinite(zoom) || zoom !== TRANSIT_FOCUS_ZOOM) {
                map.setZoom(TRANSIT_FOCUS_ZOOM)
            }

            if (shouldPan) {
                map.panTo(nextCenter)
            }

            return true
        },
        [map, maps, suppressNextMapClick]
    )


    const requestWalkRouteLaunch = useCallback((target: WalkRouteTarget) => {
        const lat = Number(target.lat)
        const lng = Number(target.lng)
        if (!isValidLatLng(lat, lng)) return

        const name = typeof target.name === "string" ? target.name.trim() : ""

        setPendingWalkRouteTarget({lat, lng, name: name.length > 0 ? name : "목적지"})
    }, [])


    /**
     * 핀 목록이 갱신되면 selectedPin을 최신 데이터로 업데이트
     *
     * - pins 배열은 bbox 조회 결과로 주기적으로 갱신되므로,
     *   선택된 핀의 name/좌표가 달라진 경우에만 상태를 교체하여 불필요한 리렌더를 줄임
     * - pins가 비어 있는 초기 로딩 시점에는 업데이트를 건너뜀
     */
    useEffect(() => {
        if (!selectedPinId) return

        if (pins.length === 0) return

        const latestPin = pins.find((pin) => pin.id === selectedPinId) ?? null
        if (!latestPin) {
            return
        }

        setSelectedPin((prev) => {
            if (prev &&
                prev.id === latestPin.id &&
                prev.name === latestPin.name &&
                prev.lat === latestPin.lat &&
                prev.lng === latestPin.lng)
            {
                return prev
            }

            return latestPin
        })
    }, [pins, selectedPinId])

    /**
     * 선택 상태(selectedPinId, isTransitPanelCollapsed)가 변경될 때마다 URL query를 동기화
     *
     * - URL hydration 첫 렌더에서는 skipNextSelectionSyncRef로 실행을 건너뜀
     *   (초기 URL → 상태 방향 복원이므로, 상태 → URL 방향을 반대로 다시 쓰면 안 됨)
     */
    useEffect(() => {
        if (!didHydrateFromQueryRef.current) return

        if (skipNextSelectionSyncRef.current) {
            skipNextSelectionSyncRef.current = false
            return
        }

        syncSelectionQueryParams(selectedPinId, isTransitPanelCollapsed)
    }, [isTransitPanelCollapsed, selectedPinId, syncSelectionQueryParams])


    /**
     * 선택 상태 활성 중 지도 클릭 시 선택을 해제
     *
     * - 마커나 인포윈도우를 클릭한 경우에는 해제하지 않음
     * - suppressMapClickUntilRef 시간 안에 들어온 클릭은 무시
     *   (마커 클릭이 지도 클릭으로 중복 처리되는 상황을 방지)
     * - selectedPinId가 없으면 리스너 자체를 등록하지 않아 불필요한 이벤트 처리를 피함
     */
    useEffect(() => {
        if (!map || !maps || !selectedPinId) return

        const clickListener = maps.Event.addListener(map, "click", (event: unknown) => {
            if (Date.now() <= suppressMapClickUntilRef.current) {
                suppressMapClickUntilRef.current = 0
                return
            }

            const overlay = (event as { overlay?: unknown } | null)?.overlay
            const isMarkerOverlay = Boolean(overlay) && overlay instanceof maps.Marker
            const isInfoWindowOverlay = Boolean(overlay) && overlay instanceof maps.InfoWindow

            if (isMarkerOverlay || isInfoWindowOverlay) return

            resetToInitialTransitMapView()
        })

        return () => {maps.Event.removeListener(clickListener)}
    }, [map, maps, resetToInitialTransitMapView, selectedPinId])


    /**
     * 컨테이너 휠 이벤트를 감지해 줌 아웃 초기화 판정 윈도우를 연장
     *
     * - 휠 이벤트마다 만료 시각을 갱신하여 사용자가 줌 아웃 중임을 표시
     * - idle 이벤트에서 이 값을 참조해 줌 아웃 초기화 여부를 결정
     * - passive: true로 등록해 스크롤 성능에 영향을 주지 않음
     */
    useEffect(() => {
        const el = container.current
        if (!el) return

        const handleWheel = () => {wheelResetDeadlineRef.current = Date.now() + WHEEL_RESET_WINDOW_MS}

        el.addEventListener("wheel", handleWheel, { passive: true })

        return () => {
            el.removeEventListener("wheel", handleWheel)
        }
    }, [container])

    /**
     * 선택 상태 활성 중 휠 줌으로 최소 줌 미만이 되면 선택 자동 해제
     *
     * - idle 이벤트마다 현재 줌을 확인하여 ATTRACTION_FOCUS_MIN_ZOOM 미만이면 초기화
     * - wheelResetDeadlineRef를 확인해 휠 조작 중에만 판정하여 외부 panTo/setZoom에는 반응하지 않음
     */
    useEffect(() => {
        if (!map || !maps || !selectedPinId) return

        const idleListener = maps.Event.addListener(map, "idle", () => {
            if (Date.now() > wheelResetDeadlineRef.current) return

            const zoom = Number(map.getZoom())
            if (!Number.isFinite(zoom)) return

            if (zoom < ATTRACTION_FOCUS_MIN_ZOOM) {
                resetToInitialTransitMapView()
            }
        })

        return () => {maps.Event.removeListener(idleListener)}
    }, [map, maps, resetToInitialTransitMapView, selectedPinId])


    /**
     * Escape 키로 선택 상태를 해제
     *
     * - 키보드 사용자가 마우스 없이 선택을 해제할 수 있도록 접근성 경로 제공
     * - selectedPinId가 있을 때만 리스너를 등록하여 불필요한 이벤트 처리를 피함
     */
    useEffect(() => {
        if (!selectedPinId) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return

            resetToInitialTransitMapView()
        }

        window.addEventListener("keydown", handleKeyDown)

        return () => {window.removeEventListener("keydown", handleKeyDown)}
    }, [resetToInitialTransitMapView, selectedPinId])

    /**
     * 도보 경로 실행 요청이 들어오면 모바일 환경에서 네이버 지도 딥링크를 실행
     *
     * - 모바일이 아니거나 myLocation이 없으면 조용히 무시
     * - 실행 후 pendingWalkRouteTarget을 초기화해 재실행을 방지
     */
    useEffect(() => {
        if (!pendingWalkRouteTarget) return

        if (!isMobileRuntime()) {
            setPendingWalkRouteTarget(null)
            return
        }

        if (!myLocation || !isValidGeoPoint(myLocation) || !isValidGeoPoint(pendingWalkRouteTarget)) {
            setPendingWalkRouteTarget(null)
            return
        }

        const destinationName = pendingWalkRouteTarget.name?.trim() || "목적지"
        const routeUrl = mapLib.buildNaverWalkRouteUrl({start: myLocation,
                                                        destination: {
                                                            lat: pendingWalkRouteTarget.lat,
                                                            lng: pendingWalkRouteTarget.lng,
                                                        },
                                                        startName: "내 위치",
                                                        destinationName})

        window.location.href = routeUrl
        setPendingWalkRouteTarget(null)
    }, [myLocation, pendingWalkRouteTarget])

    return {
        selectedPin,
        selectedPinId,
        isTransitPanelCollapsed,
        toggleTransitPanelCollapsed,
        suppressMapClickOnce,
        handlePinClick,
        focusTransitOption,
        requestWalkRouteLaunch
    }
}