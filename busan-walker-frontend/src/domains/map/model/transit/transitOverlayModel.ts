// src/domains/map/model/transit/transitOverlayModel.ts

import {
    buildTransitInfoHtml,
    buildTransitOptionLookupSignature,
    normalizeTransitOptionText,
    type ResolvedTransitOption
} from "../../lib";
import type { AttractionPin, GeoPoint, MapTransitOption } from "../../types";

/**
 * transitOverlayModel.ts (Map Transit Overlay Pure Model)
 *
 * 역할/목적:
 * - 교통 오버레이 렌더링에 필요한 순수 모델과 lookup 자료구조를 생성
 *
 * 공개 정책 / 설계 원칙:
 * - 오버레이 projection과 lookup 계산만 노출
 * - Naver Maps SDK 객체 생성 같은 부작용은 runtime 계층으로 넘김
 *
 * 동작 방식:
 * - ResolvedTransitOption 목록을 OverlayTransitOption 목록으로 변환
 * - accessNo, lookupSignature, 객체 identity 기준 lookup 맵을 만듦
 * - fitBounds 비교용 signature도 함께 계산
 *
 * 운영 포인트:
 * - key 규칙이 바뀌면 lookup과 오버레이 재사용 흐름에 모두 영향
 * - infoWindow HTML 구조가 바뀌면 projection 결과와 runtime 갱신 기준을 같이 확인
 */

export type RenderableResolvedTransitOption = ResolvedTransitOption & { point: GeoPoint }

export type OverlayTransitOption = {
    key: string
    lat: number
    lng: number
    accessNo: string
    lookupSignature: string
    title: string
    iconKey: string
    infoHtml: string
    modeCode: string
    modeName: string
    transitClassName: string
    option: MapTransitOption
}

export type TransitOverlayLookupMaps = {
    keyByOption: WeakMap<MapTransitOption, string>
    keysByAccessNo: Map<string, string[]>
    keysByLookupSignature: Map<string, string[]>
}

/* Map<key, string[]>에 값을 추가하는 내부 헬퍼 - 키가 없으면 새 배열을 생성 */
function appendMapListValue(map: Map<string, string[]>, key: string, value: string): void {
    const list = map.get(key)

    if (list) {
        list.push(value)
        return
    }

    map.set(key, [value])
}

/**
 * 교통 옵션이 지도에 렌더링 가능한 상태인지 타입 가드로 판별
 *
 * - point가 null인 옵션은 좌표가 없어 마커를 생성할 수 없으므로 제외
 */
export function isRenderableResolvedTransitOption(
    option: ResolvedTransitOption
): option is RenderableResolvedTransitOption {
    return option.point !== null
}

/**
 * 렌더링 가능한 교통 옵션 목록을 오버레이 렌더링용 모델로 변환
 *
 * - infoHtml을 이 단계에서 생성하여 런타임 계층이 HTML 빌드 로직을 알 필요 없게 함
 */
export function buildOverlayTransitOptions(
    transitOptions: readonly RenderableResolvedTransitOption[]
): OverlayTransitOption[] {
    return transitOptions.map((option) => ({
        key: option.key,
        lat: option.point.lat,
        lng: option.point.lng,
        accessNo: option.accessNo,
        lookupSignature: option.lookupSignature,
        title: option.title,
        iconKey: option.iconKey,
        infoHtml: buildTransitInfoHtml(option),
        modeCode: option.modeCode,
        modeName: option.modeName,
        transitClassName: option.transitClassName ?? "",
        option: option.option
    }))
}

/**
 * 지도 fitBounds 재적용이 필요한지 판단하기 위한 시그니처를 생성
 *
 * - 선택 핀과 오버레이 좌표 구성이 달라지면 다른 문자열을 반환하므로 diff 기준으로 사용
 * - 선택 핀이 없거나 오버레이가 없으면 빈 문자열을 반환하여 fit 불필요 상태를 표현
 */
export function buildTransitOverlayFitSignature(
    selectedPin: AttractionPin | null,
    overlayOptions: readonly OverlayTransitOption[]
): string {
    if (!selectedPin || overlayOptions.length === 0) return ""

    const selectedPinKey = `${selectedPin.id}|${selectedPin.lat.toFixed(6)},${selectedPin.lng.toFixed(6)}`
    const overlayPointKey = overlayOptions
        .map((item) => `${item.key}|${item.lat.toFixed(6)},${item.lng.toFixed(6)}`)
        .join("||")

    return `${selectedPinKey}||${overlayPointKey}`
}

/**
 * 오버레이 key 역방향 조회를 위한 lookup 자료구조를 생성
 *
 * - keyByOption: 객체 identity 기준 즉시 조회 (가장 정확)
 * - keysByAccessNo: accessNo 문자열 기준 조회 (중복 가능)
 * - keysByLookupSignature: identity 필드 기반 서명 조회 (accessNo 없는 경우 fallback)
 */
export function buildTransitOverlayLookupMaps(
    overlayOptions: readonly OverlayTransitOption[]
): TransitOverlayLookupMaps {
    const keyByOption = new WeakMap<MapTransitOption, string>()
    const keysByAccessNo = new Map<string, string[]>()
    const keysByLookupSignature = new Map<string, string[]>()

    for (const item of overlayOptions) {
        keyByOption.set(item.option, item.key)
        appendMapListValue(keysByLookupSignature, item.lookupSignature, item.key)

        if (item.accessNo.length > 0) {
            appendMapListValue(keysByAccessNo, item.accessNo, item.key)
        }
    }

    return {keyByOption, keysByAccessNo, keysByLookupSignature}
}

/**
 * MapTransitOption으로부터 대응하는 오버레이 key를 역방향으로 조회
 *
 * 조회 우선순위:
 * 1) keyByOption: 객체 identity 완전 일치 (가장 신뢰)
 * 2) keysByAccessNo: accessNo 기반 (단일 결과일 때만 반환)
 * 3) keysByLookupSignature: identity 서명 기반 (단일 결과일 때만 반환)
 * - 모든 조회에서 결과가 없거나 중복이면 null을 반환
 */
export function resolveTransitOverlayKeyByOption(args: {
    option: MapTransitOption
    lookupMaps: TransitOverlayLookupMaps
}): string | null {
    const { option, lookupMaps } = args

    const keyByIdentity = lookupMaps.keyByOption.get(option)
    if (keyByIdentity) {
        return keyByIdentity
    }

    const accessNo = normalizeTransitOptionText(option.accessNo)
    if (accessNo.length > 0) {
        const accessKeys = lookupMaps.keysByAccessNo.get(accessNo) ?? []

        if (accessKeys.length === 1) {
            return accessKeys[0]
        }

        if (accessKeys.length > 1) {
            return null
        }
    }

    const lookupSignature = buildTransitOptionLookupSignature(option)
    const lookupKeys = lookupMaps.keysByLookupSignature.get(lookupSignature) ?? []

    return lookupKeys.length === 1 ? lookupKeys[0] : null
}