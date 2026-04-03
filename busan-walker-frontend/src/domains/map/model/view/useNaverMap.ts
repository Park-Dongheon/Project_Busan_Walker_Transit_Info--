// src/domains/map/model/view/useNaverMap.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

/**
 * useNaverMap.ts (지도 뷰 - 네이버 지도 SDK 부트스트랩 훅)
 *
 * 역할/목적:
 * - Naver Maps JavaScript SDK를 로드하고 실제 지도 인스턴스를 생성
 * - 초기 진입 시 URL 기반 지도 뷰를 해석해 시작 위치를 결정
 * - UI 계층이 SDK 세부사항을 직접 다루지 않도록, 지도 관련 핵심 액션을 helpers 형태로 제공
 *
 * 데이터 흐름:
 *   VITE_NAVER_MAP_CLIENT_ID + initialView(URL query)
 *      ↓  loadNaverMapsSdk()
 *   naver.maps 네임스페이스 + Map 인스턴스
 *      ↓  resolveInitialMapBootstrapState()
 *   mapReady=true, helpers(geocodeAndMove / fitToCoords / locateMe / clearMyLocation)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useNaverMap  - SDK 로딩·지도 생성·helpers 캡슐화 훅
 * - SDK 로딩과 지도 생성은 외부 환경에 크게 의존하므로,
 *   map / maps / helpers를 nullable 상태로 두고 점진적으로 준비
 * - URL의 lat/lng/z는 복원 보조 수단으로 취급하며,
 *   유효하지 않으면 기본 뷰로 되돌리고 query를 정리
 * - 현재 위치 마커는 매번 새로 만들지 않고, 있으면 위치만 갱신하는 방식으로 재사용
 *
 * 동작 방식:
 * - resolveInitialMapBootstrapState: 초기 URL 쿼리를 해석해 시작 center/zoom을 결정
 * - loadNaverMapsSdk: SDK 로딩이 완료되면 실제 지도 인스턴스를 생성
 * - locateMe: 브라우저 Geolocation API를 통해 현재 위치를 얻고 지도와 마커를 갱신
 * - createdHelpers: UI가 사용할 고수준 지도 액션 묶음
 *
 * 운영 포인트:
 * - VITE_NAVER_MAP_CLIENT_ID 누락 시 지도 전체가 동작하지 않으므로 배포 환경 설정을 우선 점검
 * - 초기 URL 복원 정책이 바뀌면 initialView 생성 로직과 lat/lng/z 정리 규칙을 함께 확인
 * - 현재 위치 기능은 HTTPS, 브라우저 권한, 디바이스 GPS 상태에 영향을 받으므로 실제 기기 테스트가 중요
 * - 지도 초기화 실패 메시지는 사용자용 안내이고, 실제 원인 추적은 콘솔 로그를 함께 확인
 * - container.current가 존재해야만 지도 인스턴스를 생성 가능
 * - 비동기 SDK 로딩과 Geolocation 콜백은 언마운트 이후에도 도착할 수 있으므로 disposed 가드가 필요
 */

import { useEffect, useRef, useState } from "react";

import { isValidGeoPoint } from "../../lib/geo";
import * as mapLib from "../../lib";
import type { GeoPoint, InitialView, MapHelpers, SetSearchParamsFn } from "../../types";

const MAP_VIEW_LAT_QUERY_KEY = "lat"
const MAP_VIEW_LNG_QUERY_KEY = "lng"
const MAP_VIEW_ZOOM_QUERY_KEY = "z"

/* 주소/검색어 지오코딩 성공 시 적용할 기본 포커스 줌 */
const GEOCODE_FOCUS_ZOOM = 14

/* 현재 위치 이동 시 너무 멀리 축소된 화면을 방지하기 위한 최소 줌 */
const LOCATE_ME_MIN_ZOOM = 15

type InitialMapBootstrapState = {
    center: GeoPoint
    zoom: number
    shouldClearInitialViewQuery: boolean
}

/**
 * 숫자 좌표를 GeoPoint로 해석
 *
 * - lat/lng 원시 숫자를 지도에서 사용할 수 있는 GeoPoint로 변환하기 전
 *   유효성 검사를 통과시키기 위한 보조 함수
 * - 유효한 좌표면 GeoPoint를 반환, 그렇지 않으면 null을 반환
 */
function toGeoPoint(lat: number, lng: number): GeoPoint | null {
    const point = { lat, lng }

    return isValidGeoPoint(point) ? point : null
}

/**
 * 서비스에서 허용하는 지도 포커스 좌표인지 검사
 *
 * - 단순히 유효한 위경도인지뿐 아니라, 서비스 범위(대한민국 근처)로 볼 수 있는지까지 확인
 */
function isServiceMapPoint(point: GeoPoint | null | undefined): point is GeoPoint {
    return !!point && isValidGeoPoint(point) && mapLib.isLikelyKoreaLatLng(point.lat, point.lng)
}

/**
 * 지도 뷰 복원용 query(lat/lng/z)를 제거
 *
 * - URL에 남아 있는 잘못된 초기 뷰 상태를 정리하기 위한 함수
 */
function clearMapViewQueryParams(params: URLSearchParams): URLSearchParams {
    const next = new URLSearchParams(params)
    next.delete(MAP_VIEW_LAT_QUERY_KEY)
    next.delete(MAP_VIEW_LNG_QUERY_KEY)
    next.delete(MAP_VIEW_ZOOM_QUERY_KEY)

    return next
}

/**
 * 초기 지도 부트스트랩 상태를 결정
 *
 * - URL 쿼리 기반 초기 뷰와 기본 뷰 사이에서 어떤 값을 시작점으로 쓸지 판단
 * - initialView에 lat/lng query가 없으면 기본 center/zoom을 사용
 * - lat/lng가 있어도 값이 없거나, 유효하지 않거나, 서비스 범위를 벗어나면 기본 뷰를 사용
 * - URL에 값은 있었지만 사용할 수 없는 경우 shouldClearInitialViewQuery를 true로 설정
 */
function resolveInitialMapBootstrapState(initialView: InitialView): InitialMapBootstrapState {
    const fallbackState: InitialMapBootstrapState = {
        center: mapLib.DEFAULT_CENTER,
        zoom: mapLib.DEFAULT_ZOOM,
        shouldClearInitialViewQuery: false
    }

    if (!initialView.hasLatLngInQuery) {
        return fallbackState
    }

    if (initialView.lat == null || initialView.lng == null) {
        return {
            ...fallbackState,
            shouldClearInitialViewQuery: true
        }
    }

    const queryPoint = toGeoPoint(initialView.lat, initialView.lng)
    if (!isServiceMapPoint(queryPoint)) {
        return {
            ...fallbackState,
            shouldClearInitialViewQuery: true
        }
    }

    return {
        center: queryPoint,
        zoom: mapLib.normalizeZoom(initialView.zoom),
        shouldClearInitialViewQuery: false
    }
}

/**
 * 네이버 지도 SDK를 로드하고 지도 인스턴스를 생성
 *
 * - 지도 초기화와 SDK 의존 기능을 React 훅으로 캡슐화해,
 *   페이지/컨테이너 계층이 고수준 상태와 helpers만 소비하도록 만듦
 * - effect 시작 시 기존 지도 상태를 초기화
 * - client id를 확인하고, SDK를 비동기로 로드
 * - container가 준비된 경우 초기 center/zoom으로 지도를 생성
 * - 현재 위치 마커 관리 함수와 UI용 MapHelpers를 구성
 * - cleanup 시 비동기 후속 콜백을 차단하고 위치 마커 및 helpers를 정리
 */
export function useNaverMap(args: {
    container: React.RefObject<HTMLDivElement | null>
    initialView: InitialView
    initialSearchParams: URLSearchParams
    setSearchParams: SetSearchParamsFn
}): {
    map: naver.maps.Map | null
    maps: typeof naver.maps | null
    mapReady: boolean
    mapError: string | null
    helpers: MapHelpers | null
} {
    const { container, initialView, initialSearchParams, setSearchParams } = args

    const [map, setMap] = useState<naver.maps.Map | null>(null)
    const [maps, setMaps] = useState<typeof naver.maps | null>(null)
    const [mapReady, setMapReady] = useState<boolean>(false)
    const [mapError, setMapError] = useState<string | null>(null)
    const [helpers, setHelpers] = useState<MapHelpers | null>(null)

    /**
     * 비동기 SDK 로딩 콜백 안에서 최신 setSearchParams를 참조하기 위한 ref
     *
     * - 초기 query 정리 로직이 오래된 함수 참조를 잡지 않도록 함
     */
    const setSearchParamsRef = useRef<SetSearchParamsFn>(setSearchParams)

    useEffect(() => {
        setSearchParamsRef.current = setSearchParams
    }, [setSearchParams])

    useEffect(() => {
        /**
         * 지도 관련 상태를 초기 부트스트랩 상태로 되돌림
         *
         * - 재진입이나 의존성 변경 시 이전 지도 인스턴스/헬퍼 잔상이 UI에 남지 않도록 함
         */
        const resetMapState = () => {
            setMap(null)
            setMaps(null)
            setMapReady(false)
            setMapError(null)
            setHelpers(null)
        }

        /**
         * effect 시작 시점에 즉시 상태를 비워,
         * 이전 초기화 결과가 새 부트스트랩 과정과 섞이지 않도록 함
         */
        resetMapState()

        /**
         * 프론트 번들에 포함되는 공개 client id를 읽음
         *
         * - secret 성격의 키를 프론트에서 직접 다루지 않는 것이 원칙
         */
        const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined
        if (!clientId) {
            console.warn("[Map] VITE_NAVER_MAP_CLIENT_ID is missing")
            setMapError("지도 설정이 누락되었습니다. 관리자에게 문의해 주세요.")
            return
        }

        let disposed = false
        let myLocationMarker: naver.maps.Marker | null = null

        /**
         * 현재 위치 마커를 지도에서 제거
         *
         * - 지도 재초기화 또는 언마운트 시 SDK 객체가 남지 않도록 정리
         */
        const clearMyLocationMarker = () => {
            if (!myLocationMarker) return

            myLocationMarker.setMap(null)
            myLocationMarker = null
        }

        /**
         * SDK 로드 및 지도 생성 흐름
         *
         * - loadNaverMapsSdk는 이미 로드된 SDK를 재사용하거나 필요 시 스크립트를 삽입
         * - 지도 인스턴스는 실제 DOM 컨테이너가 존재할 때만 생성
         */
        mapLib.loadNaverMapsSdk(clientId)
            .then((loadedMaps) => {
                if (disposed) return
                if (!container.current) return

                /**
                 * 초기 지도 뷰를 결정
                 *
                 * - URL lat/lng/z가 유효하면 그 값을 우선 사용하고,
                 *   값은 있었지만 사용할 수 없는 경우 query를 정리해 오염된 복원 상태를 남기지 않음
                 */
                const initialBootstrapState = resolveInitialMapBootstrapState(initialView)

                if (initialBootstrapState.shouldClearInitialViewQuery) {
                    const cleaned = clearMapViewQueryParams(initialSearchParams)
                    setSearchParamsRef.current(cleaned, { replace: true })
                }

                const center = new loadedMaps.LatLng(
                    initialBootstrapState.center.lat,
                    initialBootstrapState.center.lng
                )
                const zoom = initialBootstrapState.zoom

                /**
                 * 실제 지도 인스턴스를 생성
                 *
                 * - minZoom / maxZoom과 기본 컨트롤 노출 정책을 함께 적용
                 */
                const created = new loadedMaps.Map(container.current, {
                    center,
                    zoom,
                    minZoom: mapLib.MAP_MIN_ZOOM,
                    maxZoom: mapLib.MAP_MAX_ZOOM,
                    zoomControl: true,
                    zoomControlOptions: { position: loadedMaps.Position.TOP_RIGHT },
                    mapTypeControl: true
                })

                setMaps(loadedMaps)
                setMap(created)
                setMapReady(true)
                setMapError(null)

                /**
                 * 현재 위치 마커를 생성하거나 기존 마커 위치를 갱신
                 *
                 * - locateMe가 반복 호출되어도 마커 인스턴스를 재사용해 시각적 일관성과 비용을 함께 관리
                 */
                const upsertMyLocationMarker = (point: GeoPoint) => {
                    const position = new loadedMaps.LatLng(point.lat, point.lng)

                    if (myLocationMarker) {
                        myLocationMarker.setPosition(position)
                        return
                    }

                    /**
                     * 내 위치 마커는 간단한 HTML 아이콘으로 렌더링
                     *
                     * - size와 anchor를 함께 지정해, 시각적 중심과 지도 좌표 기준점이 맞도록 함
                     */
                    const icon: naver.maps.HtmlIcon = {
                        content:
                            '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.35)"></div>',
                        size: new loadedMaps.Size(14, 14),
                        anchor: new loadedMaps.Point(7, 7)
                    }

                    myLocationMarker = new loadedMaps.Marker({map: created,
                                                              position,
                                                              title: "내 위치",
                                                              icon,
                                                              zIndex: 200})
                }

                /**
                 * 현재 위치를 조회하고 지도에 반영
                 *
                 * - 브라우저 Geolocation API를 통해 현재 위치를 구하고,
                 *   지도 중심 이동 및 내 위치 마커 표시까지 한 번에 수행
                 * - geolocation 지원 여부와 secure context 여부를 먼저 검사
                 * - 좌표를 받으면 유효성 검증 후 마커를 갱신하고 지도를 현재 위치로 이동
                 * - 줌이 너무 낮으면 LOCATE_ME_MIN_ZOOM까지 보정
                 * - 권한 거부, 사용 불가, 시간 초과를 사용자 관점의 메시지로 구분
                 */
                const locateMe = async (): Promise<{ lat: number; lng: number }> => {
                    if (!navigator.geolocation) {
                        throw new Error("이 브라우저는 위치 정보를 지원하지 않습니다.")
                    }

                    if (!window.isSecureContext) {
                        throw new Error("위치 기능은 HTTPS(또는 localhost)에서만 사용할 수 있습니다.")
                    }

                    return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(
                            ({ coords }) => {
                                if (disposed) {
                                    reject(new Error("지도가 준비 중입니다. 잠시 후 다시 시도해 주세요."))
                                    return
                                }

                                const point = toGeoPoint(
                                    Number(coords.latitude),
                                    Number(coords.longitude)
                                )
                                if (!point) {
                                    reject(new Error("현재 위치 좌표를 읽지 못했습니다."))
                                    return
                                }

                                upsertMyLocationMarker(point)

                                const nextCenter = new loadedMaps.LatLng(point.lat, point.lng)
                                created.panTo(nextCenter)

                                /**
                                 * 현재 위치가 화면에서 충분히 보이지 않을 정도로 멀리 축소되어 있으면,
                                 * 최소 줌을 보정해 사용자 피드백을 명확히 함
                                 */
                                const currentZoom = Number(created.getZoom())
                                if (!Number.isFinite(currentZoom) || currentZoom < LOCATE_ME_MIN_ZOOM) {
                                    created.setZoom(LOCATE_ME_MIN_ZOOM)
                                }

                                resolve(point)
                            },
                            (error) => {
                                if (error.code === 1) {
                                    reject(new Error("위치 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해 주세요."))
                                    return
                                }

                                if (error.code === 2) {
                                    reject(new Error("위치 정보를 사용할 수 없습니다. 네트워크/GPS 상태를 확인해 주세요."))
                                    return
                                }

                                if (error.code === 3) {
                                    reject(new Error("위치 정보 요청 시간이 초과되었습니다. 다시 시도해 주세요."))
                                    return
                                }

                                reject(new Error("현재 위치를 가져오지 못했습니다."))
                            },
                            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 }
                        )
                    })
                }

                /**
                 * UI에 노출할 지도 고수준 액션 묶음
                 *
                 * - UI 레이어가 SDK 상세 타입이나 콜백 구조를 직접 알지 않아도
                 *   필요한 지도 기능만 호출할 수 있게 하기 위한 도메인 인터페이스
                 */
                const createdHelpers: MapHelpers = {
                    /**
                     * 주소/검색어를 지오코딩해 해당 위치로 이동
                     *
                     * - 첫 번째 결과만 사용하여, 서비스 범위를 벗어난 좌표는 무시
                     */
                    geocodeAndMove: (query: string) => {
                        const normalizedQuery = query.trim()
                        if (!normalizedQuery) return

                        loadedMaps.Service.geocode({ query: normalizedQuery }, (status, response) => {
                            if (disposed) return
                            if (status !== loadedMaps.Service.Status.OK) return

                            const item = response.v2.addresses?.[0]
                            if (!item) return

                            const point = toGeoPoint(Number(item.y), Number(item.x))
                            if (!isServiceMapPoint(point)) return

                            created.setCenter(new loadedMaps.LatLng(point.lat, point.lng))
                            created.setZoom(GEOCODE_FOCUS_ZOOM)
                        })
                    },
                    /* 여러 좌표가 한 화면에 들어오도록 지도 범위를 맞춤 */
                    fitToCoords: (coords) => {
                        mapLib.fitMapToCoords(loadedMaps, created, coords)
                    },
                    locateMe,
                    /* 현재 위치 마커를 제거 */
                    clearMyLocation: clearMyLocationMarker
                }

                setHelpers(createdHelpers)
            })
            .catch((e: unknown) => {
                /**
                 * SDK 로딩 또는 지도 생성 실패 처리
                 *
                 * - 사용자가 지도를 사용할 수 없는 상태이므로,
                 *   내부 상태를 초기화하고 사용자 메시지와 콘솔 로그를 함께 남김
                 */
                if (disposed) return
                resetMapState()
                setMapError("지도를 불러오지 못했습니다. 네트워크 또는 지도 설정을 확인해 주세요.")
                console.error("[Map] SDK load/init failed:", e)
            })

        return () => {
            /**
             * cleanup
             *
             * - 비동기 후속 콜백이 언마운트 이후 상태를 만지지 않도록 차단하고,
             *   내 위치 마커와 helpers를 정리
             */
            disposed = true
            clearMyLocationMarker()
            setHelpers(null)
        }
    }, [container, initialSearchParams, initialView])

    return { map, maps, mapReady, mapError, helpers }
}