// src/domains/map/model/view/useMapViewSync.ts

// cspell:ignore navermaps glat glng
/// <reference types="navermaps" />

/**
 * useMapViewSync.ts (지도 뷰 - 뷰-URL-BBox 동기화 훅)
 *
 * 역할/목적:
 * - 지도 SDK의 현재 뷰 상태(center / zoom / bounds)를 도메인 상태와 URL query에 반영
 * - 지도 이동 결과가 bbox 조회 조건으로 연결되도록 하고, 현재 지도 위치를 URL에 남겨
 *   새로고침·공유·재진입 시 동일한 화면 맥락을 복원 가능하게 함
 *
 * 데이터 흐름:
 *   지도 idle 이벤트
 *      ↓  syncNow()
 *   map.getBounds() → BBox → setBbox()
 *   map.getCenter() / map.getZoom() → URLSearchParams (replace)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useMapViewSync  - 지도 뷰 상태를 URL query와 BBox 상태에 동기화하는 훅
 * - URL 반영은 push가 아니라 replace로 수행하여 지도 이동만으로 history가 과도하게 쌓이지 않도록 함
 * - SDK 이벤트 리스너는 React 렌더 바깥에서 실행되므로,
 *   최신 searchParams / setSearchParams / setBbox는 ref를 통해 참조
 * - 서비스 범위를 벗어난 좌표는 복원 가능한 지도 상태로 보지 않고 URL에 저장하지 않음
 *
 * 동작 방식:
 * - resolveMapViewQueryState: 현재 지도 중심과 줌을 URL 저장용 문자열로 정규화
 * - syncNow: bbox 동기화와 lat/lng/z 동기화를 한 번에 수행하는 핵심 루틴
 * - onIdle: 지도 입력이 끝난 뒤 debounce를 거쳐 syncNow를 실행
 * - bbox는 목록/핀 조회의 핵심 입력이므로, 동일 bbox에서 setBbox를 반복 호출하지 않도록 마지막 파라미터를 추적
 *
 * 운영 포인트:
 * - lat/lng/z query key는 URL 복원 계약의 일부이므로, 이름이나 의미를 바꾸면 초기 지도 진입 로직과 함께 점검
 * - bbox 계산 방식이 바뀌면 mapLib.computeBBoxFromBounds, bboxToParam, isValidBBox와 이 훅의 중복 방지 정책을 함께 확인
 * - debounce 시간은 URL 갱신 빈도, bbox 재조회 반응성, 지도 조작 체감에 직접 영향
 * - 이 훅은 "지도 뷰를 URL에 기록"하는 책임을 가지며,
 *   URL을 읽어 지도를 복원하는 책임은 별도 초기화 흐름이 담당
 */

import { useEffect, useRef } from "react";
import type { BBox, SetSearchParamsFn } from "../../types";
import * as mapLib from "../../lib";
import { isValidGeoPoint } from "../../lib/geo";

const MAP_VIEW_SYNC_DEBOUNCE_MS = 120
const MAP_VIEW_LAT_QUERY_KEY = "lat"
const MAP_VIEW_LNG_QUERY_KEY = "lng"
const MAP_VIEW_ZOOM_QUERY_KEY = "z"

type MapViewQueryState = {
    lat: string
    lng: string
    zoom: string
}

/**
 * 현재 지도 중심과 줌을 URL 저장용 상태로 변환
 *
 * - 지도 SDK의 현재 뷰를 query parameter로 직렬화하기 전에
 *   유효성 검증과 문자열 정규화를 수행
 * - center와 zoom을 읽어 유효한 좌표/숫자인지 검사
 * - 서비스 범위로 보기 어려운 좌표는 저장하지 않음
 * - lat/lng는 소수점 6자리, zoom은 normalizeZoom 결과를 문자열로 반환
 * - null 반환은 오류가 아니라 "URL에 저장하지 말아야 하는 상태"를 의미
 */
function resolveMapViewQueryState(map: naver.maps.Map): MapViewQueryState | null {
    const center = map.getCenter()
    const lat = mapLib.latOf(center)
    const lng = mapLib.lngOf(center)
    const rawZoom = Number(map.getZoom())

    if (!isValidGeoPoint({ lat, lng }) || !Number.isFinite(rawZoom)) {
        return null
    }

    if (!mapLib.isLikelyKoreaLatLng(lat, lng)) {
        return null
    }

    return {
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        zoom: String(mapLib.normalizeZoom(rawZoom)),
    }
}

/**
 * 지도 뷰 상태와 URL, 그리고 bbox 상태를 동기화
 *
 * - 지도 이동 결과를 도메인 조회 입력(setBbox)과 브라우저 URL(lat/lng/z)에 동시에 반영하는 모델 훅
 * - 마운트 후 map / maps가 준비되면 즉시 1회 동기화
 * - 이후 지도 idle 이벤트가 발생할 때마다 debounce 후 동기화
 * - bounds가 유효하면 bbox를 계산하고, 이전 bbox와 다를 때만 setBbox를 호출
 * - center/zoom이 유효하면 URL에 lat/lng/z를 저장하고, 유효하지 않으면 기존 query를 제거
 * - 이 훅은 map 이동 자체를 제어하지 않고, "현재 지도 상태를 읽어서 반영"하는 역할만 담당
 */
export function useMapViewSync(args: {
    map: naver.maps.Map | null
    maps: typeof naver.maps | null
    searchParams: URLSearchParams
    setSearchParams: SetSearchParamsFn
    setBbox: (bbox: BBox) => void
}): void {
    const { map, maps, searchParams, setSearchParams, setBbox } = args

    /**
     * 최신 참조 저장
     *
     * - SDK 이벤트 리스너는 한 번 등록되면 오래 살아남을 수 있으므로,
     *   리스너 내부에서는 최신 props/state 성격의 값을 ref로 읽음
     */
    const searchParamsRef = useRef<URLSearchParams>(searchParams)
    const setSearchParamsRef = useRef<SetSearchParamsFn>(setSearchParams)
    const setBboxRef = useRef<(bbox: BBox) => void>(setBbox)

    useEffect(() => {
        searchParamsRef.current = searchParams
    }, [searchParams])

    useEffect(() => {
        setSearchParamsRef.current = setSearchParams
    }, [setSearchParams])

    useEffect(() => {
        setBboxRef.current = setBbox
    }, [setBbox])

    /**
     * 마지막으로 반영한 bbox 파라미터 문자열
     *
     * - bbox는 목록/핀 조회의 핵심 트리거이므로,
     *   동일 영역에서 setBbox가 반복 호출되지 않도록 중복을 차단
     */
    const lastBBoxParamRef = useRef<string>("")

    useEffect(() => {
        if (!map || !maps) return

        let disposed = false
        let debounceTimer: number | null = null
        lastBBoxParamRef.current = ""

        /**
         * URL에 남아 있는 lat/lng/z를 제거
         *
         * - 현재 지도 상태가 저장 가능한 유효 상태가 아닐 때,
         *   깨진 복원 정보가 URL에 남지 않도록 정리
         * - 세 파라미터 중 하나라도 존재하면 제거 후 replace 반영
         */
        const clearLatLngZoomParamsIfPresent = () => {
            const sp = searchParamsRef.current
            const hasLatLngZoomParam = sp.has(MAP_VIEW_LAT_QUERY_KEY) ||
                                       sp.has(MAP_VIEW_LNG_QUERY_KEY) ||
                                       sp.has(MAP_VIEW_ZOOM_QUERY_KEY)
            if (!hasLatLngZoomParam) return

            const next = new URLSearchParams(sp)
            next.delete(MAP_VIEW_LAT_QUERY_KEY)
            next.delete(MAP_VIEW_LNG_QUERY_KEY)
            next.delete(MAP_VIEW_ZOOM_QUERY_KEY)

            searchParamsRef.current = next
            setSearchParamsRef.current(next, { replace: true })
        }

        /**
         * 현재 지도 상태를 즉시 동기화
         *
         * - idle 이후 최종 상태를 기준으로 bbox와 URL query를 한 번에 갱신하는 핵심 루틴
         * - 1) bounds를 읽어 bbox를 계산하고, 이전 bbox와 다를 때만 setBbox 호출
         * - 2) center/zoom을 읽어 lat/lng/z를 URL에 반영
         * - 3) 지도 상태가 유효하지 않으면 기존 lat/lng/z를 제거
         * - disposed 이후에는 아무 작업도 하지 않음
         */
        const syncNow = () => {
            if (disposed) return

            /**
             * 1) bounds -> bbox 동기화
             *
             * - SDK getBounds() 반환값은 버전별 차이가 있을 수 있으므로,
             *   boundsLike 형태인지 확인한 뒤 도메인 BBox로 변환
             */
            const rawBounds = map.getBounds() as unknown
            const boundsLike = mapLib.toBoundsLike(rawBounds)
            if (boundsLike) {
                const bbox = mapLib.computeBBoxFromBounds(boundsLike)

                if (mapLib.isValidBBox(bbox)) {
                    const nextBBoxParam = mapLib.bboxToParam(bbox)

                    if (lastBBoxParamRef.current !== nextBBoxParam) {
                        lastBBoxParamRef.current = nextBBoxParam
                        setBboxRef.current(bbox)
                    }
                }
            }

            /**
             * 2) center/zoom -> URL(lat,lng,z) 동기화
             *
             * - URL은 공유 가능한 상태이므로,
             *   저장 불가능한 좌표는 남기지 않고 제거하는 편이 더 안전
             */
            const mapViewQueryState = resolveMapViewQueryState(map)
            if (!mapViewQueryState) {
                clearLatLngZoomParamsIfPresent()
                return
            }

            const sp = searchParamsRef.current
            if (
                sp.get(MAP_VIEW_LAT_QUERY_KEY) === mapViewQueryState.lat &&
                sp.get(MAP_VIEW_LNG_QUERY_KEY) === mapViewQueryState.lng &&
                sp.get(MAP_VIEW_ZOOM_QUERY_KEY) === mapViewQueryState.zoom
            ) {
                return
            }

            const next = new URLSearchParams(sp)
            next.set(MAP_VIEW_LAT_QUERY_KEY, mapViewQueryState.lat)
            next.set(MAP_VIEW_LNG_QUERY_KEY, mapViewQueryState.lng)
            next.set(MAP_VIEW_ZOOM_QUERY_KEY, mapViewQueryState.zoom)

            searchParamsRef.current = next
            setSearchParamsRef.current(next, { replace: true })
        }

        /**
         * idle 이벤트 처리기
         *
         * - 지도 입력이 끝난 뒤 최종 상태만 동기화하도록 짧은 debounce를 적용
         * - drag / zoom 직후 idle이 연속으로 발생할 수 있어,
         *   URL 업데이트와 bbox 재계산을 과도하게 반복하지 않기 위함
         */
        const onIdle = () => {
            if (debounceTimer != null) {
                window.clearTimeout(debounceTimer)
            }
            /* 연속 이동/줌 입력에서 과도한 요청을 줄이기 위한 짧은 디바운스 */
            debounceTimer = window.setTimeout(() => {
                syncNow()
            }, MAP_VIEW_SYNC_DEBOUNCE_MS)
        }

        /* 초기 진입 시 즉시 1회 동기화: bbox 기반 조회가 바로 동작하도록 보장 */
        syncNow()

        /* 지도 입력이 멈춘 시점(idle)에 동기화 트리거 */
        const listener = maps.Event.addListener(map, "idle", onIdle)

        return () => {
            disposed = true
            lastBBoxParamRef.current = ""

            if (debounceTimer != null) {
                window.clearTimeout(debounceTimer)
            }

            maps.Event.removeListener(listener)
        }

    }, [map, maps])
}