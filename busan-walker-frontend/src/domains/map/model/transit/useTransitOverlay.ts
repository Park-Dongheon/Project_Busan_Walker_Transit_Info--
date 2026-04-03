// src/domains/map/model/transitAccess/useTransitOverlay.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
    buildTransitOverlayDatasetSignature,
    fitMapToCoords,
    type ResolvedTransitOption
} from "../../lib";
import type { AttractionPin, MapTransitOption } from "../../types";
import {
    buildOverlayTransitOptions,
    buildTransitOverlayFitSignature,
    buildTransitOverlayLookupMaps,
    isRenderableResolvedTransitOption,
    resolveTransitOverlayKeyByOption
} from "./transitOverlayModel";
import {
    clearAllTransitOverlays,
    closeTransitInfoWindows,
    openTransitOverlayByKey,
    removeTransitOverlayByKey,
    type TransitOverlayEntry,
    type TransitOverlayRenderState,
    upsertTransitOverlayEntry
} from "./transitOverlayRuntime";

/**
 * useTransitOverlay.ts (Map Transit Overlay Orchestration Hook)
 *
 * 역할/목적:
 * - 선택된 관광지의 교통 옵션을 지도 오버레이(마커 + 인포윈도우)로 반영하는 상위 오케스트레이션 훅
 * - 순수 데이터 계산 결과와 네이버 지도 SDK 런타임 조작을 연결하여 화면 동작을 완성
 * - 호출부에는 "교통 옵션을 기준으로 해당 오버레이를 연다"는 단일 인터페이스만 제공
 *
 * 주요 책임:
 * - 교통 옵션 목록 중 실제 지도에 표시 가능한 항목만 선별
 * - 렌더링용 오버레이 모델 생성
 * - 오버레이 key / option lookup / dataset signature 계산
 * - 현재 지도 상태와 이전 렌더 상태를 비교하여 오버레이를 diff 방식으로 갱신
 * - 선택 관광지 변경 시 자동 fit / 자동 첫 오버레이 open 정책 적용
 * - 마커 클릭 시 인포윈도우 열기 및 외부 클릭 콜백 연결
 * 
 * 계층 분리 원칙:
 * - transitOverlayModel: 순수 계산 계층
 *                        (표시 가능한 옵션 필터링, 오버레이 모델 생성, key/lookup/signature 계산)
 * - transitOverlayRuntime: SDK 조작 계층
 *                          (마커/인포윈도우 생성, 갱신, 제거, 열기/닫기)
 * - useTransitOverlay: 오케스트레이션 계층
 *                      (입력 상태 변화 감지, diff 반영, 자동 동작 정책 적용)
 * 
 * 동작 흐름:
 * 1) transitOptions에서 지도에 표시 가능한 옵션만 선별
 * 2) 선별된 옵션으로 오버레이 모델과 lookup 정보를 계산
 * 3) map / maps / selectedPin / dataset 변화가 생기면 effect에서 런타임 반영을 수행
 * 4) 더 이상 필요 없는 오버레이는 제거하고, 필요한 오버레이는 upsert
 * 5) 선택 관광지 또는 데이터셋이 바뀌면 auto fit / auto open 정책을 적용
 * 6) 외부에서는 반환된 함수로 특정 교통 옵션에 해당하는 인포윈도우를 직접 open
 * 
 * 상태 관리 방식:
 * - React state 대신 ref 중심으로 오버레이 런타임 상태를 관리
 * - 이유: 오버레이 엔트리와 SDK 인스턴스는 화면 렌더링 결과라기보다 외부 객체 상태에 가깝기 때문
 * - 주요 ref:
 *   - overlayByKeyRef: key별 오버레이 엔트리 저장
 *   - overlayEntriesRef: 현재 활성 오버레이 목록 유지
 *   - listenerRemoverByKeyRef: 마커 이벤트 해제 함수 저장
 *   - renderStateByKeyRef: 직접 렌더 상태 저장
 *   - optionByKeyRef: key별 원본 옵션 저장
 *   - lastSelectedPinIdRef: 직전 선택 관광지 추적
 *   - lastDatasetSignatureRef: 직전 데이터셋 시그니처 추적
 *   - lastFitSignatureRef: 직전 fit 반영 시그니처 추적
 *   - boundMapRef / boundMapsRef: 현재 바인딩된 SDK 객체 추적
 * 
 * 설계 포인트:
 * - datasetSignature: 오버레이 데이터 구성이 바뀌었는지 판별하는 기준값
 * - fitSignature: 지도 fit이 다시 필요한지 판별하는 기준값
 * - key 기반 diff: 전체를 무조건 재생성하지 않고 필요한 오버레이만 제거/갱신하여 SDK 비용을 줄임
 * - onTransitMarkerClickRef: 최신 콜백을 유지하면서 effect 의존성 과다 확장을 방지
 * 
 * 자동 정책:
 * - autoFitBounds=true: 선택 관광지와 교통 오버레이 좌표들을 기준으로 지도 화면을 자동 조정
 * - autoOpenFirst=true: 선택 변경 또는 데이터셋 변경 시 첫 번째 오버레이의 인포윈도우를 자동으로 오픈
 * 
 * 주의:
 * - 오버레이 key 정책이 바뀌면 lookup, 제거, open-by-option 흐름 전체에 영향
 * - 이 훅은 오케스트레이션 계층이므로 순수 계산 로직이나 SDK 세부 구현을 다시 내부에 흡수하지 않도록 유지
 * - selectedPin이 없거나 표시 가능한 교통 옵션이 없으면 런타임 상태를 정리
 * - SDK map/maps 바인딩이 바뀌면 기존 오버레이는 모두 무효가 되므로 전체 초기화
 * - ref 기반 구조이므로 디버깅 시 "현재 활성 엔트리 / 마지막 signature / 바인딩 map"을 함께 확인
 */

/**
 * 선택 관광지의 교통 오버레이를 지도에 반영하고,
 * 특정 교통 옵션에 해당하는 인포윈도우를 열 수 있는 함수를 반환
 * 
 * 반환 함수:
 * - 전달받은 MapTransitOption에 대응하는 오버레이를 찾아 인포윈도우를 open
 * - 대응되는 오버레이가 없거나 map이 없으면 false를 반환
 */
export function useTransitOverlay(args: {
    map: naver.maps.Map | null
    maps: typeof naver.maps | null
    selectedPin: AttractionPin | null
    transitOptions: ResolvedTransitOption[]
    onTransitMarkerClick?: (option: MapTransitOption) => void
    autoOpenFirst?: boolean
    autoFitBounds?: boolean
}): (option: MapTransitOption) => boolean {
    const {
        map,
        maps,
        selectedPin,
        transitOptions,
        onTransitMarkerClick,
        autoOpenFirst = true,
        autoFitBounds = true
    } = args

    const overlayByKeyRef = useRef<Map<string, TransitOverlayEntry>>(new Map())
    const overlayEntriesRef = useRef<TransitOverlayEntry[]>([])
    const listenerRemoverByKeyRef = useRef<Map<string, () => void>>(new Map())
    const renderStateByKeyRef = useRef<Map<string, TransitOverlayRenderState>>(new Map())
    const optionByKeyRef = useRef<Map<string, MapTransitOption>>(new Map())

    const onTransitMarkerClickRef = useRef<typeof onTransitMarkerClick>(onTransitMarkerClick)
    const lastSelectedPinIdRef = useRef<string | null>(null)
    const lastDatasetSignatureRef = useRef<string>("")
    const lastFitSignatureRef = useRef<string>("")
    const boundMapRef = useRef<naver.maps.Map | null>(null)
    const boundMapsRef = useRef<typeof naver.maps | null>(null)

    /**
     * 실제 지도에 표시 가능한 교통 옵션만 선별
     * 
     * 목적:
     * - 좌표/표시 조건이 충족된 옵션만 이후 오버레이 계산 대상으로 제한
     */
    const renderableTransitOptions = useMemo(
        () => transitOptions.filter(isRenderableResolvedTransitOption),
        [transitOptions]
    )

    /**
     * 표시 가능한 교통 옵션을 오버레이 렌더링 모델로 변환
     * 
     * 포함 내용:
     * - 오버레이 key
     * - 표시 좌표
     * - 마커/인포윈도우 생성에 필요한 가공 정보
     */
    const overlayOptions = useMemo(
        () => buildOverlayTransitOptions(renderableTransitOptions),
        [renderableTransitOptions]
    )

    /**
     * MapTransitOption -> overlay key 해석을 위한 lookup 집합을 생성
     * 
     * 사용처:
     * - 외부에서 option 기준으로 특정 오버레이를 여는 API 구현
     */
    const overlayLookupMaps = useMemo(
        () => buildTransitOverlayLookupMaps(overlayOptions),
        [overlayOptions]
    )

    /**
     * 현재 표시 데이터셋이 이전과 달라졌는지 판별하는 시그니처를 계산
     */
    const datasetSignature = useMemo(
        () => buildTransitOverlayDatasetSignature(renderableTransitOptions),
        [renderableTransitOptions]
    )

    /**
     * 지도 fit 재적용이 필요한지 판단하기 위한 시그니처를 계산
     * 
     * 기준:
     * - 선택 관광지
     * - 렌더링 대상 오버레이 좌표 구성
     */
    const fitSignature = useMemo(
        () => buildTransitOverlayFitSignature(selectedPin, overlayOptions),
        [overlayOptions, selectedPin]
    )

    useEffect(() => {
        onTransitMarkerClickRef.current = onTransitMarkerClick
    }, [onTransitMarkerClick])

    /**
     * 현재 활성화된 모든 교통 오버레이를 제거
     * 
     * 처리 범위:
     * - 마커 / 인포윈도우 정리
     * - 이벤트 리스너 해제
     * - 런타임 엔트리 목록 갱신
     */
    const clearAllOverlays = useCallback(() => {
        overlayEntriesRef.current = clearAllTransitOverlays({
            overlayByKey: overlayByKeyRef.current,
            renderStateByKey: renderStateByKeyRef.current,
            optionByKey: optionByKeyRef.current,
            listenerRemoverByKey: listenerRemoverByKeyRef.current,
            overlayEntries: overlayEntriesRef.current
        })
    }, [])

    /**
     * 오버레이 관련 런타임 상세 전체를 초기화
     * 
     * 사용 시점:
     * - map/maps 바인딩 변경
     * - 선택 관광지 제거
     * - 표시 가능한 교통 옵션 없음
     * - 컴포넌트 unmount
     */
    const resetOverlayRuntimeState = useCallback(() => {
        clearAllOverlays()
        overlayByKeyRef.current = new Map()
        overlayEntriesRef.current = []
        listenerRemoverByKeyRef.current = new Map()
        renderStateByKeyRef.current = new Map()
        optionByKeyRef.current = new Map()
        lastSelectedPinIdRef.current = null
        lastDatasetSignatureRef.current = ""
        lastFitSignatureRef.current = ""
    }, [clearAllOverlays])

    /**
     * 특정 key에 해당하는 오버레이만 제거
     * 
     * 목적:
     * - 다음 데이터셋에 존재하지 않는 오버레이만 선택적으로 정리
     */
    const removeOverlayByKey = useCallback((key: string) => {
        overlayEntriesRef.current = removeTransitOverlayByKey({
            key,
            overlayByKey: overlayByKeyRef.current,
            renderStateByKey: renderStateByKeyRef.current,
            optionByKey: optionByKeyRef.current,
            listenerRemoverByKey: listenerRemoverByKeyRef.current,
            overlayEntries: overlayEntriesRef.current
        })
    }, [])

    /**
     * 오버레이 key를 기준으로 해당 인포윈도우 open
     * 
     * 동작:
     * - map이 없으면 false
     * - key에 대응하는 엔트리가 있으면 인포윈도우를 열고 true
     * - 없으면 false
     */
    const openTransitInfoByKey = useCallback(
        (key: string): boolean => {
            if (!map) return false

            return openTransitOverlayByKey({key,
                                            map,
                                            overlayByKey: overlayByKeyRef.current,
                                            overlayEntries: overlayEntriesRef.current})
        },
        [map]
    )

    /**
     * MapTransitOption을 기준으로 해당 인포윈도우를 open
     * 
     * 처리 과정:
     * - option으로 overlay key를 찾음
     * - 찾은 key로 실제 오버레이 open 수행
     */
    const openTransitInfoByOption = useCallback(
        (option: MapTransitOption): boolean => {
            const key = resolveTransitOverlayKeyByOption({option, lookupMaps: overlayLookupMaps})
            if (!key) return false

            return openTransitInfoByKey(key)
        },
        [openTransitInfoByKey, overlayLookupMaps]
    )

    useEffect(() => {
        const mapBindingChanged = boundMapRef.current !== map || boundMapsRef.current !== maps

        if (mapBindingChanged) {
            resetOverlayRuntimeState()
            boundMapRef.current = map
            boundMapsRef.current = maps
        }

        if (!map || !maps) return

        if (!selectedPin || overlayOptions.length === 0) {
            resetOverlayRuntimeState()
            lastSelectedPinIdRef.current = selectedPin?.id ?? null

            return
        }

        const nextKeySet = new Set<string>(overlayOptions.map((item) => item.key))

        /**
         * 현재 데이터셋에 존재하지 않는 오버레이는 제거
         */
        for (const key of Array.from(overlayByKeyRef.current.keys())) {
            if (!nextKeySet.has(key)) {
                removeOverlayByKey(key)
            }
        }

        const fitCoords: Array<{ lat: number; lng: number }> = [
            { lat: selectedPin.lat, lng: selectedPin.lng },
            ...overlayOptions.map((item) => ({ lat: item.lat, lng: item.lng }))
        ]

        /**
         * 필요한 오버레이는 key 기준으로 upsert
         * 
         * 클릭 정책:
         * - 기존 인포윈도우를 모두 닫고
         * - 클릭한 마커의 인포윈도우를 연 뒤
         * - 최신 option 정보를 외부 콜백으로 전달
         */
        for (const item of overlayOptions) {
            const existing = overlayByKeyRef.current.get(item.key)
            const prevState = renderStateByKeyRef.current.get(item.key)

            const nextOverlayEntry = upsertTransitOverlayEntry({
                item,
                existing,
                prevState,
                map,
                maps,
                onMarkerClick: (entry) => {
                    closeTransitInfoWindows(overlayEntriesRef.current)
                    entry.infoWindow.open(map, entry.marker)

                    const latestOption = optionByKeyRef.current.get(entry.key)
                    if (latestOption) {
                        onTransitMarkerClickRef.current?.(latestOption)
                    }
                }
            })

            overlayByKeyRef.current.set(item.key, nextOverlayEntry.entry)

            if (nextOverlayEntry.removeListener) {
                listenerRemoverByKeyRef.current.set(item.key, nextOverlayEntry.removeListener)
            }

            optionByKeyRef.current.set(item.key, item.option)
            renderStateByKeyRef.current.set(item.key, nextOverlayEntry.renderState)
        }

        /**
         * 현재 활성 오버레이 엔트리 목록을 표시 순서 기준으로 재구성
         */
        overlayEntriesRef.current = overlayOptions
            .map((item) => overlayByKeyRef.current.get(item.key))
            .filter((entry): entry is TransitOverlayEntry => Boolean(entry))

        const selectedChanged = lastSelectedPinIdRef.current !== selectedPin.id
        const datasetChanged = lastDatasetSignatureRef.current !== datasetSignature

        /**
         * 선택 관광지 또는 데이터셋이 바뀌면 자동 정책을 적용
         * 
         * autoFitBounds:
         * - fitSignature가 달라진 경우에만 fit 수행
         * 
         * autoOpenFirst:
         * - 첫 번째 오버레이 인포윈도우 자동 open
         */
        if (selectedChanged || datasetChanged) {
            if (autoFitBounds && fitSignature.length > 0 && lastFitSignatureRef.current !== fitSignature) {
                fitMapToCoords(maps, map, fitCoords)
                lastFitSignatureRef.current = fitSignature
            }

            if (autoOpenFirst && overlayEntriesRef.current.length > 0) {
                const first = overlayEntriesRef.current[0]

                closeTransitInfoWindows(overlayEntriesRef.current)
                first.infoWindow.open(map, first.marker)
            }
        }

        lastSelectedPinIdRef.current = selectedPin.id
        lastDatasetSignatureRef.current = datasetSignature
    }, [
        map,
        maps,
        selectedPin,
        overlayOptions,
        datasetSignature,
        fitSignature,
        autoFitBounds,
        autoOpenFirst,
        removeOverlayByKey,
        resetOverlayRuntimeState
    ])

    useEffect(() => {
        return () => {
            boundMapRef.current = null
            boundMapsRef.current = null
            resetOverlayRuntimeState()
        }
    }, [resetOverlayRuntimeState])

    return openTransitInfoByOption
}