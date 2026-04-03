// src/domains/map/lib/markerIcons.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

import {resolveTransitMarkerMetadata, type TransitMarkerCategory} from "./transit/transitModeAliases";

/**
 * markerIcons.ts (Map Marker Icon Factory)
 *
 * 역할/목적:
 * - 관광지와 교통 마커에 사용할 아이콘 규칙을 한곳에서 관리
 *
 * 공개 정책 / 설계 원칙:
 * - 마커 아이콘 선택과 SDK용 ImageIcon 생성만 담당
 * - 교통수단 분류 자체는 `transitModeAliases`에 위임
 *
 * 동작 방식:
 * - 관광지 선택 상태와 교통수단 메타데이터를 기준으로 적절한 아이콘 스펙을 선택
 * - 같은 스펙은 `naver.maps.ImageIcon`으로 변환한 뒤 캐시에 재사용
 *
 * 운영 포인트:
 * - 새 교통수단 분류가 추가되면 alias 규칙과 아이콘 스펙을 함께 갱신
 * - fallback 아이콘 경고가 자주 보이면 백엔드 `modeCode/modeName` 정합성을 먼저 점검
 */

type NaverMarkerIcon =
    | string
    | naver.maps.ImageIcon
    | naver.maps.SymbolIcon
    | naver.maps.HtmlIcon

type MarkerIconSpec = {
    url: string
    width: number
    height: number
    anchorX: number
    anchorY: number
}

type TransitIconArgs = {
    modeCode: string
    modeName?: string | null
    transitClassName?: string | null
}

type SubwayLine = 1 | 2 | 3

const TRANSIT_STANDARD_SPEC = {
    width: 30,
    height: 30,
    anchorX: 15,
    anchorY: 30
} as const

const ATTRACTION_MARKER_SPECS = {
    default: {
        url: "/markers/defaultMarker.png",
        width: 30,
        height: 30,
        anchorX: 15,
        anchorY: 30
    },
    selected: {
        url: "/markers/selectedMarker.png",
        width: 34,
        height: 34,
        anchorX: 17,
        anchorY: 34
    }
} as const satisfies Record<"default" | "selected", MarkerIconSpec>

const TRANSIT_MARKER_SPECS: Record<Exclude<TransitMarkerCategory, "subway">, MarkerIconSpec> = {
    bus: {
        url: "/markers/busMarker.png",
        ...TRANSIT_STANDARD_SPEC
    },
    donghae: {
        url: "/markers/donghaeLineMarker.png",
        ...TRANSIT_STANDARD_SPEC
    },
    train: {
        url: "/markers/trainMarker.png",
        ...TRANSIT_STANDARD_SPEC
    }
}

const SUBWAY_LINE_MARKER_SPECS: Record<SubwayLine, MarkerIconSpec> = {
    1: {
        url: "/markers/subwayMarker1.png",
        ...TRANSIT_STANDARD_SPEC
    },
    2: {
        url: "/markers/subwayMarker2.png",
        ...TRANSIT_STANDARD_SPEC
    },
    3: {
        url: "/markers/subwayMarker3.png",
        ...TRANSIT_STANDARD_SPEC
    }
}

const FALLBACK_TRANSIT_MARKER_SPEC: MarkerIconSpec = {
    url: "/markers/transMarker.png",
    width: 28,
    height: 28,
    anchorX: 14,
    anchorY: 28
}

const NAVER_MARKER_ICON_CACHE = new WeakMap<typeof naver.maps, Map<string, naver.maps.ImageIcon>>()

const UNRESOLVED_SUBWAY_LINE_WARN_KEYS = new Set<string>()

/* 스펙의 모든 필드를 파이프로 이어 캐시 키를 생성 - 동일 스펙이면 항상 같은 문자열을 반환 */
function buildMarkerIconCacheKey(spec: MarkerIconSpec): string {
    return `${spec.url}
           |${spec.width}
           |${spec.height}
           |${spec.anchorX}
           |${spec.anchorY}`
}

/**
 * MarkerIconSpec을 네이버 지도 SDK ImageIcon 객체로 변환
 *
 * - maps 인스턴스별로 캐시를 분리하여 SDK 인스턴스가 교체되어도 캐시 충돌이 없도록 함
 * - 동일 스펙이 여러 마커에서 공유되므로 캐시 없이 반복 생성하면 불필요한 SDK 객체가 늘어남
 */
function toNaverMarkerIcon(
    maps: typeof naver.maps,
    spec: MarkerIconSpec
): naver.maps.ImageIcon {
    let cacheByMaps = NAVER_MARKER_ICON_CACHE.get(maps)

    if (!cacheByMaps) {
        cacheByMaps = new Map()
        NAVER_MARKER_ICON_CACHE.set(maps, cacheByMaps)
    }

    const cacheKey = buildMarkerIconCacheKey(spec)
    const cached = cacheByMaps.get(cacheKey)
    if (cached) return cached

    const icon: naver.maps.ImageIcon = {
        url: spec.url,
        size: new maps.Size(spec.width, spec.height),
        scaledSize: new maps.Size(spec.width, spec.height),
        origin: new maps.Point(0, 0),
        anchor: new maps.Point(spec.anchorX, spec.anchorY)
    }

    cacheByMaps.set(cacheKey, icon)
    return icon
}

function normalizeWarnToken(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim() : ""
}

function warnUnresolvedSubwayLineOnce(args: TransitIconArgs): void {
    if (!import.meta.env.DEV) return

    const warnKey = [
        normalizeWarnToken(args.modeCode),
        normalizeWarnToken(args.modeName),
        normalizeWarnToken(args.transitClassName)
    ].join("|")

    if (UNRESOLVED_SUBWAY_LINE_WARN_KEYS.has(warnKey)) return
    UNRESOLVED_SUBWAY_LINE_WARN_KEYS.add(warnKey)

    console.warn("[map] Transit marker subway line is unresolved. Falling back to generic transit icon.", {
        modeCode: args.modeCode,
        modeName: args.modeName,
        transitClassName: args.transitClassName
    })
}

/**
 * 교통수단 정보를 기반으로 마커 아이콘 스펙을 결정
 *
 * - 지하철인 경우 노선 번호로 세분화, 노선을 알 수 없으면 fallback 아이콘
 * - 카테고리를 알 수 없는 경우에도 FALLBACK_TRANSIT_MARKER_SPEC을 반환하여 항상 마커가 표시됨
 */
function resolveTransitMarkerSpec(args: TransitIconArgs): MarkerIconSpec {
    const { category, subwayLine } = resolveTransitMarkerMetadata(args)

    if (category === "subway") {
        if (subwayLine) {
            return SUBWAY_LINE_MARKER_SPECS[subwayLine]
        }

        warnUnresolvedSubwayLineOnce(args)
        return FALLBACK_TRANSIT_MARKER_SPEC
    }

    if (category) {
        return TRANSIT_MARKER_SPECS[category]
    }

    return FALLBACK_TRANSIT_MARKER_SPEC
}

/**
 * 관광지 마커에 사용할 네이버 지도 SDK 아이콘 객체를 반환
 *
 * @param maps     - 현재 네이버 지도 SDK 네임스페이스
 * @param selected - 선택된 핀 여부 (true이면 강조 아이콘, false이면 기본 아이콘)
 */
export function getAttractionMarkerIcon(
    maps: typeof naver.maps,
    selected: boolean
): NaverMarkerIcon {
    return toNaverMarkerIcon(maps, selected ? ATTRACTION_MARKER_SPECS.selected : ATTRACTION_MARKER_SPECS.default)
}

/**
 * 교통수단 마커에 사용할 네이버 지도 SDK 아이콘 객체를 반환
 *
 * @param maps             - 현재 네이버 지도 SDK 네임스페이스
 * @param modeCode         - 교통수단 코드 (예: "B", "S1", "S4", "S5")
 * @param modeName         - 교통수단 명칭 (alias 보조 판별에 사용)
 * @param transitClassName - 교통수단 클래스명 (alias 보조 판별에 사용)
 */
export function getTransitMarkerIcon(
    maps: typeof naver.maps,
    modeCode: string,
    modeName?: string | null,
    transitClassName?: string | null
): NaverMarkerIcon {
    return toNaverMarkerIcon(maps, resolveTransitMarkerSpec({modeCode, modeName, transitClassName}))
}