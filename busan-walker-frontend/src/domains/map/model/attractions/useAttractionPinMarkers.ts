// src/domains/map/model/attractions/useAttractionPinMarkers.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

import { useEffect, useMemo, useRef } from "react";
import { isValidLatitude, isValidLongitude } from "../../lib/geo";
import { getAttractionMarkerIcon } from "../../lib";
import type { AttractionPin } from "../../types";

/**
 * useAttractionPinMarker.ts (관광지 핀 마커 동기화 훅)
 * 
 * 역할/목적:
 * - 관광지 핀 목록(AttractionPin[])을 네이버 지도 Marker 집합으로 렌더링
 * - React 상태 변화와 지도 SDK 객체 상태를 맞추되, 불필요한 생성·제거·갱신을 줄여 반응성을 유지
 * 
 * 책임 범위:
 * - 유효한 좌표를 가진 핀만 마커 대상으로 선별
 * - pin.id 기준으로 Marker 인스턴스를 재사용
 * - 선택 상태(selectedPinId)에 따라 아이콘과 zIndex를 갱신
 * - SDK 이벤트 리스너와 마커 인스턴스를 수명 주기에 맞게 정리
 * 
 * 설계 정책:
 * - 이 훅의 핵심은 "전체 재생성"이 아니라 "id 기반 증분 동기화"
 * - Marker는 생성 비용과 지도 반영 비용이 있는 외부 SDK 객체이므로,
 *   React 렌더마다 새로 만들지 않고 기존 인스턴스를 최대한 재사용
 * - 외부 입력 좌표는 신뢰하지 않으며, 잘못된 좌표는 개발 환경에서만 경고 후 렌더 대상에서 제외
 * - 클릭 이벤트는 React 클로저에 직접 의존하지 않고 ref를 통해 최신 콜백과 최신 pin 데이터를 참조
 * 
 * 동작 포인트:
 * - renderablePins: 좌표가 우효한 핀만 남긴 렌더 대상 목록
 * - pinsById: 삭제 대상과 최신 pin 조회를 O(1)로 처리하기 위한 인덱스
 * - markerByIdRef: id별 Marker 인스턴스 저장소
 * - clickListenerByIdRef: 이전 렌더 상태를 기억해 diff 업데이트를 수행
 * - pinByIdRef / onPinClickRef: 클릭 시점에 최신 데이터와 최신 콜백을 사용하기 위한 참조 저장소
 * 
 * 운영 포인트:
 * - 마커 아이콘 정책이 바뀌면 getAttractionMarkerIcon과 선택 상태 반영 로직을 함께 점검
 * - 핀 식별자 정책(pin.id)이 바뀌면 이 훅의 재사용 전략 전체에 영향
 * - 지도 SDK 객체는 React가 자동 정리하지 않으므로, cleanup 누락 시 메모리 누수와 중복 이벤트가 발생 가능
 * 
 * 주의:
 * - map 또는 maps가 준비되기 전에는 아무 작업도 하지 않음
 * - 이 훅은 브라우저 + Naver Maps SDK 준비 완료 상태를 전제
 * - 같은 좌표라도 id가 달라지면 다른 마커로 취급
 * - 잘못된 좌표는 조용히 제외되므로, 호출부는 "보여야 할 핀이 줄어들 수 있음"을 염두
 */

type MarkerRenderState = {
    lat: number
    lng: number
    name: string
    isSelected: boolean
}

const INVALID_ATTRACTION_PIN_WARN_KEYS = new Set<string>()

/**
 * 지도에 실제로 그릴 수 있는 관광지 핀인지 판별
 * 
 * - 위도/경도 범위가 올바른 경우에만 마커 생성 대상으로 인정
 */
function isRenderableAttractionPin(pin: AttractionPin): boolean {
    return isValidLatitude(pin.lat) && isValidLongitude(pin.lng)
}

/**
 * 잘못된 좌표를 가진 핀을 개발 환경에서 한 번만 경고
 * 
 * 역할/목적:
 * - 데이터 품질 문제를 조기에 발견하되, 동일 문제를 반복 출력해 콘솔을 오염시키지 않기 위한 진단 장치
 * 
 * 주의:
 * - 운영 환경에서는 사용자 경험을 우선하여 경고를 출력하지 않음
 * - 이 함수는 진단용일 뿐이며, 좌표 보정 로직을 수행하지 않음
 */
function warnInvalidAttractionPinOnce(pin: AttractionPin): void {
    if (!import.meta.env.DEV) return

    const warnKey = `${pin.id}:${pin.lat},${pin.lng}`
    if (INVALID_ATTRACTION_PIN_WARN_KEYS.has(warnKey)) return

    INVALID_ATTRACTION_PIN_WARN_KEYS.add(warnKey)
    console.warn("[map] Skipping attraction pin with invalid coordinates.", {
        id: pin.id,
        name: pin.name,
        lat: pin.lat,
        lng: pin.lng
    })
}

/**
 * 관광지 핀 목록을 네이버 지도 Marker 집합으로 동기화
 * 
 * 역할/목적:
 * - React 상태(pins, selectedPinId)를 외부 지도 SDK 객체 상태로 반영하는 모델 훅
 * - 목록 추가/삭제/선택 변경에 대응해 마커를 생성, 제거, 부분 업데이트
 * 
 * 동작:
 * - 좌표가 유효한 핀만 렌더 대상을 선별
 * - 기존 마커 중 더 이상 존재하지 않는 id는 지도와 내부 캐시에서 제거
 * - 새 핀은 Marker를 생성하고 클릭 리스너를 등록
 * - 기존 핀은 위치, 제목, 선택 상태를 이전 값과 비교해 바뀐 경우에만 업데이트
 * - map 또는 maps가 교체되거나 컴포넌트가 언마운트되면 SDK 객체와 리스너를 모두 정리
 * 
 * 반환 정책:
 * - 반환값은 없으며, 외부 효과로 지도 마커 상태를 관리
 * 
 * 주의:
 * - 이 훅은 SDK 객체를 직접 다루므로 순수 함수가 아니며, effect 기반 수명 주기 관리가 핵심
 * - selectedPinId는 시각적 강조 정책에만 사용되며, 마커 식별 기준은 항상 pin.id
 */
export function useAttractionPinMarkers(args: {
    map: naver.maps.Map | null
    maps: typeof naver.maps | null
    pins: AttractionPin[]
    selectedPinId: string | null
    onPinClick: (pin: AttractionPin) => void
}): void {
    const { map, maps, pins, selectedPinId, onPinClick } = args

    /**
     * id -> Marker 인스턴스 저장소
     * 
     * - 외부 SDK 객체를 렌더 사이클 밖에서 재사용하기 위한 기준 저장소
     */
    const markerByIdRef = useRef<Map<string, naver.maps.Marker>>(new Map())

    /**
     * id -> 클릭 리스너 핸들 저장소
     * 
     * - 마커 제거 시 대응되는 리스너를 정확히 해제하기 위해 별도로 관리
     */
    const clickListenerByIdRef = useRef<Map<string, unknown>>(new Map())

    /**
     * id -> 마지막 반영 상태 저장소
     * 
     * - 이전 렌더 상태와 비교해 실제 변경된 속성만 SDK에 반영하기 위해 사용
     */
    const markerStateByIdRef = useRef<Map<string, MarkerRenderState>>(new Map())

    /**
     * id -> 최신 pin 저장소
     * 
     * - 클릭 이벤트가 과거 렌더의 pin 객체를 붙잡지 않도록, 
     * - 이벤트 실행 시점에 최신 데이터를 조회하는 용도로 사용
     */
    const pinByIdRef = useRef<Map<string, AttractionPin>>(new Map())

    /**
     * 최신 클릭 콜백 참조
     * 
     * 역할/목적:
     * - SDK 이벤트 핸들러가 오래된 onPinClick을 캡처하는 문제를 방지
     * 
     * 동작:
     * - 렌더마다 새로운 콜백이 들어올 수 있으므로 ref.current만 최신으로 교체
     * - 기존 SDK 리스너는 그대로 유지하면서도 최신 함수를 호출 가능
     */
    const onPinClickRef = useRef<(pin: AttractionPin) => void>(onPinClick)
    useEffect(() => {
        onPinClickRef.current = onPinClick
    }, [onPinClick])

    /**
     * 실제 렌더 가능한 핀만 선별
     * 
     * - 좌표가 비정상인 핀은 지도 마커 대상에서 제외
     * - 이렇게 분리해 두면 이후 동기화 로직은 "그릴 수 있는 핀"만 다룸
     */
    const renderablePins = useMemo(() => {
        const nextPins: AttractionPin[] = []

        for (const pin of pins) {
            if (!isRenderableAttractionPin(pin)) {
                warnInvalidAttractionPinOnce(pin)
                continue
            }

            nextPins.push(pin)
        }

        return nextPins
    }, [pins])

    /**
     * id 기반 인덱스를 생성
     * 
     * - 삭제 대상 탐색과 클릭 시 최신 pin 조회를 빠르게 처리하기 위한 보조 구조
     */
    const pinsById = useMemo(() => {
        const m = new Map<string, AttractionPin>()
        renderablePins.forEach((p) => m.set(p.id, p))

        return m
    }, [renderablePins])

    /**
     * 마커 동기화 루프
     * 
     * 핵심 흐름:
     * - 삭제: 더 이상 없는 id의 Marker/Listener/캐시 제거
     * - 생성: 새 id의 Marker와 클릭 리스너 등록
     * - 업데이트: 기존 Marker는 변경된 속성만 반영
     * 
     * - 이 훅의 성능 포인트는 "필요 최소 변경"
     * - 지도 SDK 객체는 React DOM처럼 가볍게 교체할 수 없으므로, 재생성보다 재사용과 diff 업데이트를 우선
     */
    useEffect(() => {
        if (!map || !maps) return

        const markerById = markerByIdRef.current
        const listenerById = clickListenerByIdRef.current
        const markerStateById = markerStateByIdRef.current

        /**
         * 클릭 이벤트가 항상 최신 pin 데이터를 읽을 수 있도록, 현재 렌더 기준 인덱스를 ref 저장소에 반영
         */
        pinByIdRef.current = pinsById

        /**
         * 1) 삭제 처리
         * 
         * - 기존에는 존재했지만 이번 렌더 대상에서 사라진 id를 정리
         * - SDK 객체는 참조만 끊는다고 없어지지 않으므로, 지도 제거(setMap(null))와 리스너 해제를 함께 수행
         */
        for (const [id, marker] of markerById.entries()) {
            if (!pinsById.has(id)) {
                marker.setMap(null)
                markerById.delete(id)
                markerStateById.delete(id)

                const handle = listenerById.get(id)

                if (handle) {
                    maps.Event.removeListener(handle as never)
                }

                listenerById.delete(id)
            }
        }

        /**
         * 2) 생성/업데이트 처리
         * 
         * - 현재 렌더 대상 핀을 순회하며 신규는 생성하고, 기존은 이전 반영 상태와 비교해 필요한 부분만 갱신
         */
        for (const p of renderablePins) {
            const isSelected = selectedPinId === p.id
            const nextState: MarkerRenderState = {
                lat: p.lat,
                lng: p.lng,
                name: p.name,
                isSelected
            }

            const existing = markerById.get(p.id)
            if (!existing) {
                /**
                 * 신규 마커 생성 지점
                 * 
                 * - 선택 상태에 따라 초기 아이콘과 zIndex를 함께 지정해, 생성 직후에도 UI 강조 상태가 일관
                 */
                const marker = new maps.Marker({
                    map,
                    position: new maps.LatLng(nextState.lat, nextState.lng),
                    title: nextState.name,
                    icon: getAttractionMarkerIcon(maps, nextState.isSelected),
                    zIndex: nextState.isSelected ? 100 : 10
                })

                /**
                 * 클릭 리스너 등록
                 * 
                 * - pin 객체 자체를 직접 캡처하지 않고 pinId만 보관한 뒤,
                 *   클릭 시점에 ref 저장소에서 최신 pin을 조회
                 * - 이렇게 해야 pins 배열이 갱신된 뒤에도 stale data 전달을 피할 수 있음
                 */
                const pinId = p.id
                const clickHandle = maps.Event.addListener(marker, "click", () => {
                    const latestPin = pinByIdRef.current.get(pinId)

                    if (!latestPin) return

                    onPinClickRef.current(latestPin)
                })

                markerById.set(p.id, marker)
                listenerById.set(p.id, clickHandle)
                markerStateById.set(p.id, nextState)

                continue
            }

            /**
             * 기존 마커 diff 업데이트
             * 
             * Marker 전체를 다시 만드는 대신, 실제 달라진 속성만 SDK에 반영
             */
            const prev = markerStateById.get(p.id)

            if (!prev || prev.lat !== nextState.lat || prev.lng !== nextState.lng) {
                existing.setPosition(new maps.LatLng(nextState.lat, nextState.lng))
            }

            if (!prev || prev.name !== nextState.name) {
                existing.setTitle(nextState.name)
            }

            if (!prev || prev.isSelected !== nextState.isSelected) {
                existing.setIcon(getAttractionMarkerIcon(maps, nextState.isSelected))
                existing.setZIndex(nextState.isSelected ? 100 : 10)
            }

            markerStateById.set(p.id, nextState)
        }
    }, [map, maps, pinsById, renderablePins, selectedPinId])

    /**
     * SDK 객체 정리(cleanup) effect
     * 
     * 역할/목적:
     * - map 또는 maps 인스턴스가 교체되거나 컴포넌트가 언마운트될 때,
     *   남아 있는 Marker/Listener/캐시를 모두 정리해 누수와 중복 이벤트를 방지
     * 
     * 주의:
     * - React state와 달리 SDK 리스너는 프레임워크가 자동 해제하지 않으므로 수동 정리가 필요
     */
    useEffect(() => {
        if (!map || !maps) return

        const markerById = markerByIdRef.current
        const listenerById = clickListenerByIdRef.current
        const markerStateById = markerStateByIdRef.current

        return () => {
            for (const [, marker] of markerById.entries()) {
                marker.setMap(null)
            }

            markerById.clear()

            for (const [, handle] of listenerById.entries()) {
                maps.Event.removeListener(handle as never)
            }

            listenerById.clear()

            markerStateById.clear()
            pinByIdRef.current.clear()
        }
        
    }, [map, maps])
}