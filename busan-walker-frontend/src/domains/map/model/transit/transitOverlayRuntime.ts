// src/domains/map/model/transit/transitOverlayRuntime.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

import { getTransitMarkerIcon } from "../../lib";
import type { MapTransitOption } from "../../types";
import type { OverlayTransitOption } from "./transitOverlayModel";

/**
 * transitOverlayRuntime.ts (Map Transit Overlay SDK Runtime)
 *
 * 역할/목적:
 * - Naver Maps SDK 마커와 정보창을 생성, 갱신, 제거하는 runtime helper를 제공
 *
 * 공개 정책 / 설계 원칙:
 * - SDK 객체를 직접 다루는 함수만 노출
 * - React 상태 조합과 lookup 판단은 상위 훅에서 담당
 *
 * 동작 방식:
 * - OverlayTransitOption을 Marker + InfoWindow 엔트리로 upsert
 * - key 기준으로 특정 오버레이를 열고 닫거나 제거하고, 전체 정리도 수행
 *
 * 운영 포인트:
 * - 마커 아이콘 생성 기준이 바뀌면 renderState 비교 축도 함께 점검
 * - SDK listener 정리 규칙이 바뀌면 remove 로직이 가장 먼저 영향
 */

export type TransitOverlayEntry = {
    key: string
    lat: number
    lng: number
    marker: naver.maps.Marker
    infoWindow: naver.maps.InfoWindow
}

export type TransitOverlayRenderState = {
    lat: number
    lng: number
    title: string
    iconKey: string
    infoHtml: string
}

type TransitOverlayCollections = {
    overlayByKey: Map<string, TransitOverlayEntry>
    renderStateByKey: Map<string, TransitOverlayRenderState>
    optionByKey: Map<string, MapTransitOption>
    listenerRemoverByKey: Map<string, () => void>
    overlayEntries: TransitOverlayEntry[]
}

/* OverlayTransitOption을 diff 비교용 렌더 상태로 축소 - 변경 여부 판단에 필요한 필드만 유지 */
function buildTransitOverlayRenderState(item: OverlayTransitOption): TransitOverlayRenderState {
    return {
        lat: item.lat,
        lng: item.lng,
        title: item.title,
        iconKey: item.iconKey,
        infoHtml: item.infoHtml
    }
}

/** 활성 오버레이 목록의 모든 인포윈도우를 닫음 */
export function closeTransitInfoWindows(entries: readonly TransitOverlayEntry[]): void {
    entries.forEach((entry) => entry.infoWindow.close())
}

/**
 * 특정 key에 해당하는 오버레이의 인포윈도우를 열고 지도를 해당 마커로 이동
 *
 * - key에 대응하는 엔트리가 없으면 false 반환
 * - 열기 전에 다른 모든 인포윈도우를 닫아 단일 오픈 상태를 유지
 */
export function openTransitOverlayByKey(args: {
    key: string
    map: naver.maps.Map
    overlayByKey: ReadonlyMap<string, TransitOverlayEntry>
    overlayEntries: readonly TransitOverlayEntry[]
}): boolean {
    const { key, map, overlayByKey, overlayEntries } = args

    const target = overlayByKey.get(key)
    if (!target) return false

    closeTransitInfoWindows(overlayEntries)
    target.infoWindow.open(map, target.marker)
    map.panTo(target.marker.getPosition())

    return true
}

/**
 * 특정 key의 오버레이를 지도와 내부 컬렉션에서 제거
 *
 * - 마커 지도 제거, 인포윈도우 닫기, 이벤트 리스너 해제, 컬렉션 삭제를 한 번에 처리
 * - 엔트리가 없으면 overlayEntries를 그대로 반환하여 부작용 없이 종료
 */
export function removeTransitOverlayByKey(
    args: TransitOverlayCollections & { key: string }
): TransitOverlayEntry[] {
    const {
        key,
        overlayByKey,
        renderStateByKey,
        optionByKey,
        listenerRemoverByKey,
        overlayEntries
    } = args

    const entry = overlayByKey.get(key)
    if (!entry) return overlayEntries

    entry.infoWindow.close()
    entry.marker.setMap(null)

    overlayByKey.delete(key)
    renderStateByKey.delete(key)
    optionByKey.delete(key)

    const removeListener = listenerRemoverByKey.get(key)
    if (removeListener) {
        removeListener()
        listenerRemoverByKey.delete(key)
    }

    return overlayEntries.filter((item) => item.key !== key)
}

/**
 * 모든 활성 오버레이를 순서대로 제거
 *
 * - removeTransitOverlayByKey를 반복 호출하여 각 key 처리를 위임
 * - 빈 오버레이 목록을 반환하여 호출부가 상태를 초기화할 수 있게 함
 */
export function clearAllTransitOverlays(args: TransitOverlayCollections): TransitOverlayEntry[] {
    let nextOverlayEntries = args.overlayEntries

    for (const key of Array.from(args.overlayByKey.keys())) {
        nextOverlayEntries = removeTransitOverlayByKey({...args, key, overlayEntries: nextOverlayEntries})
    }

    return nextOverlayEntries
}

/**
 * 교통 오버레이 엔트리를 생성하거나 기존 엔트리를 diff 방식으로 갱신
 *
 * - existing이 없으면 Marker + InfoWindow를 생성하고 클릭 리스너를 등록
 * - existing이 있으면 prevState와 비교해 변경된 속성(위치/제목/아이콘/HTML)만 SDK에 반영
 * - removeListener는 신규 생성 시에만 반환되며, 호출부는 이를 저장하여 나중에 해제에 사용
 */
export function upsertTransitOverlayEntry(args: {
    item: OverlayTransitOption
    existing: TransitOverlayEntry | undefined
    prevState: TransitOverlayRenderState | undefined
    map: naver.maps.Map
    maps: typeof naver.maps
    onMarkerClick: (entry: TransitOverlayEntry) => void
}): {
    entry: TransitOverlayEntry
    renderState: TransitOverlayRenderState
    removeListener?: () => void
} {
    const { item, existing, prevState, map, maps, onMarkerClick } = args
    const renderState = buildTransitOverlayRenderState(item)

    if (!existing) {
        const marker = new maps.Marker({
            map,
            position: new maps.LatLng(item.lat, item.lng),
            title: item.title,
            icon: getTransitMarkerIcon(maps, item.modeCode, item.modeName, item.transitClassName),
            zIndex: 50
        })

        const infoWindow = new maps.InfoWindow({content: item.infoHtml, borderWidth: 0})

        const entry: TransitOverlayEntry = {
            key: item.key,
            lat: item.lat,
            lng: item.lng,
            marker,
            infoWindow
        }

        const clickHandle = maps.Event.addListener(marker, "click", () => {
            onMarkerClick(entry)
        })

        return {entry, renderState, removeListener: () => maps.Event.removeListener(clickHandle as never)}
    }

    if (!prevState || prevState.lat !== item.lat || prevState.lng !== item.lng) {
        existing.marker.setPosition(new maps.LatLng(item.lat, item.lng))
        existing.lat = item.lat
        existing.lng = item.lng
    }

    if (!prevState || prevState.title !== item.title) {
        existing.marker.setTitle(item.title)
    }

    if (!prevState || prevState.iconKey !== item.iconKey) {
        existing.marker.setIcon(
            getTransitMarkerIcon(maps, item.modeCode, item.modeName, item.transitClassName)
        )
    }

    if (!prevState || prevState.infoHtml !== item.infoHtml) {
        existing.infoWindow.setContent(item.infoHtml)
    }

    return {entry: existing, renderState}
}