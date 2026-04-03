// src/domains/map/lib/geo.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

import type { BBox, GeoPoint, InitialView } from "../types";

/**
 * geo.ts (Map Domain Geo Utilities / 좌표·줌·경계 표준화 유틸)
 * 
 * 역할/목적:
 * - map 도메인에서 사용하는 좌표(lat/lng), 줌(zoom), 지도 경계(bbox)를
 *   일관된 규칙으로 다루기 위한 공통 지오 유틸 모듈
 * - URL 쿼리 파라미터, 지도 SDK 객체, 내부 도메인 타입처럼
 *   서로 다른 입력 형태를 공통 계약으로 정규화
 * - 지도 위치/영역과 관련된 검증 로직의 단일 기준(SSOT)을 제공하여
 *   UI, 모델 훅, 지도 제어 코드가 동일한 정책으로 동작하도록 보장
 * 
 * 책임 범위:
 * - 좌표 유효성 검사
 * - 줌 범위 보정
 * - 초기 지도 뷰 파싱
 * - bbox 직렬화/역직렬화
 * - 지도 SDK bounds/latlng 형태를 도메인 타입으로 변환
 * - 여러 좌표를 기반으로 지도 화면 범위 맞춤(fitBounds)
 * 
 * 설계 정책:
 * - 외부 입력은 신뢰하지 않고 항상 검증/보정 후 사용
 * - 숫자 파싱 실패, 범위 이탈, 형식 불일치는 null 또는 NaN 기반으로 안전하게 흡수
 * - 지도 SDK 전용 객체 형태는 가능한 한 이 파일 내부에서만 다루고,
 *   상위 레이어에는 단순한 도메인 타입(BBox, GeoPoint, InitialView) 중심으로 전달
 * - 줌 레벨은 서비스 정책상 허용 범위(MAP_MIN_ZOOM ~ MAP_MAX_ZOOM)로 강제 정규화
 * 
 * 동작 포인트:
 * - DEFAULT_CENTER / DEFAULT_ZOOM:
 *   지도 초기 진입 시 사용할 기본 중심 좌표와 기본 줌 값
 * - isValidLatitude / isValidLongitude / isValidGeoPoint:
 *   좌표 데이터의 최소 유효성 검증을 담당
 * - parseInitialValue:
 *   URLSearchParams에서 lat/lng/z를 읽어 초기 지도 상태 후보를 구성
 * - bboxToParam / computeBBoxFromBounds:
 *   bbox를 URL 파라미터 형태로 직렬화하거나 다시 파싱
 * - toBoundsLike / computeBBoxFromBounds:
 *   지도 SDK bounds 객체를 도메인 bbox로 변환할 때 사용하는 어댑터 역할
 * - latOf / lngOf:
 *   지도 SDK 또는 외부 좌표 객체의 다양한 shape를 흡수하여 위경도를 추출
 * - fitMapToCoords:
 *   유효한 좌표만 모아 지도 영역을 자동으로 맞춤
 * 
 * 운영 포인트:
 * - 지도 위치 관련 정책이 바뀌면 이 파일을 우선 기준으로 검토
 * - URL 쿼리 스펙(lat, lng, z, bbox)을 변경할 경우 이 파일과 이를 소비하는 라우팅/UI 코드를 함께 확인해야 함
 * - 지도 SDK 객체 형태에 의존하는 코드는 이 파일에 최대한 가두고,
 *   상위 계층으로 SDK 세부 구현이 퍼지지 않도록 유지하는 것이 중요
 * 
 * 주의:
 * - isLikelyKoreaLatLng는 "대한민국 추정 범위" 검사일 뿐, 엄밀한 행정구역 판정 로직이 아님
 * - west < east 조건만 사용하는 bbox 검증은 국제 날짜 변경선(180도 경계)을 넘는 영역에는 적합하지 않음
 * - latOf / lngOf는 지원하지 않는 shape에 대해 NaN을 반환하므로, 호출부에서는 후속 검증 없이 그대로 신뢰하면 안 됨
 * - fitMapToCoords는 유효 좌표가 하나도 없으면 지도 상태를 변경하지 않음
 * - bbox 직렬화는 소수점 5자리로 고정되므로, URL 안정성은 높지만 초정밀 좌표는 일부 반올림됨
 */

/**
 * 서비스에서 사용하는 지도 기본 중심 좌표
 * 
 * 정책:
 * - 초기 진입 시 명시적인 좌표가 없으면 이 값을 기준으로 지도를 렌더링
 * - 현재 값은 부산 중심 좌표에 맞춰져 있으며, 서비스 지역 정책의 일부로 볼 수 있음
 */
export const DEFAULT_CENTER = { lat: 35.1796, lng: 129.0756 }

/**
 * 서비스 기본 줌 레벨
 * 
 * 정책:
 * - URL 쿼리나 외부 상태에서 유효한 줌 값을 제공하지 못할 때 fallback으로 사용
 */
export const DEFAULT_ZOOM = 12

/**
 * 서비스에서 허용하는 최소 줌 레벨
 * 
 * 의미:
 * - 너무 넓은 범위를 보여 주는 축소 상태를 제한하여 서비스 UX와 데이터 표시 밀도를 일정 수준으로 유지
 */
export const MAP_MIN_ZOOM = 11

/**
 * 서비스에서 허용하는 최대 줌 레벨
 *
 * 의미:
 * - 과도한 확대 상태를 제한하여 지도 조작 경험과 데이터 표시 정책을 안정적으로 유지
 */
export const MAP_MAX_ZOOM = 19

const LATITUDE_MIN = -90
const LATITUDE_MAX = 90
const LONGITUDE_MIN = -180
const LONGITUDE_MAX = 180

/**
 * 좌표가 한국 인근 범위에 대략적으로 포함되는지 검사
 * 
 * 용도:
 * - 잘못된 외부 좌표를 빠르게 의심하거나, 서비스 대상 지역과 전혀 무관한 좌표를 거르는 보조 판단에 사용 가능
 * 
 * 주의:
 * - 정밀한 지리 판별이 아니라 단순 범위 체크
 * - "대한민국 여부"를 엄밀히 보장하는 함수로 사용하면 안 됨
 */
export function isLikelyKoreaLatLng(lat: number, lng: number): boolean {
    return lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132.5
}

/* 위도 값이 유한 숫자이며, 위도 허용 범위(-90 ~ 90)에 포함되는지 검사 */
export function isValidLatitude(lat: number): boolean {
    return Number.isFinite(lat) && lat >= LATITUDE_MIN && lat <= LATITUDE_MAX
}

/* 경도 값이 유한 숫자이며, 경도 허용 범위(-180 ~ 180)에 포함되는지 검사 */
export function isValidLongitude(lng: number): boolean {
    return Number.isFinite(lng) && lng >= LONGITUDE_MIN && lng <= LONGITUDE_MAX
}

/**
 * 도메인 좌표 객체(GeoPoint)가 유효한지 검사
 * 
 * 동작:
 * - null/undefined를 방어
 * - lat/lng가 모두 유효 범위에 있을 때만 true를 반환
 * 
 * 타입 포인트:
 * - 타입 가드로 선언되어 있으므로, true 분기 내부에서는 point를 GeoPoint로 안전하게 다를 수 있음
 */
export function isValidGeoPoint(point: GeoPoint | null | undefined): point is GeoPoint {
    return !!point && isValidLatitude(point.lat) && isValidLongitude(point.lng)
}

/**
 * 외부에서 들어온 줌 값을 서비스 정책 범위에 맞게 정규화
 * 
 * 동작:
 * - null, NaN, Infinity 등 비정상 값이면 DEFAULT_ZOOM으로 대체
 * - 소수 줌 값은 반올림하여 정수화
 * - 최소/최대 줌 범위를 벗어나면 허용 구간으로 clamp
 * 
 * 왜 필요한가?
 * - URL, 저장 상태, 외부 이벤트에서 들어오는 줌 값은 신뢰할 수 없기 때문에 지도 렌더링 전에 정책 범위로 보정해야 함
 */
export function normalizeZoom(z: number | null): number {
    if (z == null || !Number.isFinite(z)) return DEFAULT_ZOOM

    const zi = Math.round(z)
    if (zi < MAP_MIN_ZOOM) return MAP_MIN_ZOOM
    if (zi > MAP_MAX_ZOOM) return MAP_MAX_ZOOM

    return zi
}

/**
 * unknown 입력을 유한 숫자로 변환
 * 
 * 반환 정책:
 * - 숫자로 안전하게 해석 가능하면 number 반환
 * - 그렇지 않으면 null 반환
 * 
 * 용도:
 * - URLSearchParams처럼 문자열 기반 입력을 숫자 후보로 바꿀 때 사용
 */
function toFiniteNumber(v: unknown): number | null {
    const n = typeof v === "number" ? v : Number(v)

    return Number.isFinite(n) ? n : null
}

/**
 * URL 쿼리 파라미터에서 초기 지도 상태 후보를 파싱
 * 
 * 처리 대상:
 * - lat: 중심 위도
 * - lng: 중심 경도
 * - z: 줌 레벨
 * 
 * 반환 정책:
 * - 각 값은 숫자 변환에 실패하면 null
 * - hasLatLngInQuery는 lat/lng 키가 실제로 존재했는지 여부를 기록
 * 
 * 필요성:
 * - 값이 null이라는 사실만으로는 "파라미터가 없던 것인지", "있었지만 잘못된 값인지"를 구분하기 어렵기 때문
 * - 호출부에서 초기화 전략을 분기할 때 이 정보가 유용
 */
export function parseInitialValue(params: URLSearchParams): InitialView {
    const hasLat = params.has("lat")
    const hasLng = params.has("lng")

    return {
        lat: toFiniteNumber(params.get("lat")),
        lng: toFiniteNumber(params.get("lng")),
        zoom: toFiniteNumber(params.get("z")),
        hasLatLngInQuery: hasLat && hasLng
    }
}

/**
 * bbox를 URL 쿼리 파라미터용 문자열로 직렬화
 * 
 * 형식:
 * - "south,west,north,east"
 * 
 * 정책:
 * - null이면 빈 문자열 반환
 * - 각 좌표는 소수점 5자리까지 고정하여 직렬화
 * 
 * 소수점 5자리 고정 이유:
 * - URL 안정성: 너무 긴 소수는 URL을 불필요하게 길게 만들 수 있음
 * - 실용적 정밀도: 소수점 5자리(약 1.1m 수준)는 대부분의 지도 표시/검색 용도에서 충분한 정밀도를 제공
 * - 일관된 형식: 항상 같은 자리수로 표현하여 URL 비교나 캐싱에서 일관된 문자열을 생성
 */
export function bboxToParam(bbox: BBox | null): string {
    if (!bbox) return ""

    return bbox.map((value) => value.toFixed(5)).join(",")
}

/**
 * bbox가 도메인 규칙상 유효한지 검사
 * 
 * 검증 조건:
 * - 길이가 정확히 4인지
 * - 각 좌표가 유효한 위도/경도 범위에 있는지
 * - 남쪽 < 북쪽, 서쪽 < 동쪽 조건을 만족하는지
 * - south, west, north, east 순서로 배열이 구성되어 있는지
 * 
 * 주의:
 * - 국제 날짜 변경선을 넘는 bbox에는 적합하지 않음(예: west > east인 경우)
 */
export function isValidBBox(bbox: BBox | null | undefined): bbox is BBox {
    if (!bbox || bbox.length !== 4) return false

    const [south, west, north, east] = bbox
    if (!isValidLatitude(south) || !isValidLatitude(north)) return false
    if (!isValidLongitude(west) || !isValidLongitude(east)) return false

    return south < north && west < east
}

/**
 * URL 파라미터 문자열을 bbox로 역직렬화
 * 
 * 입력 형식:
 * - "south,west,north,east"
 * 
 * 검증 및 반환 정책:
 * - 형식 오류, 숫자 변환 실패, 범위 위반 등 문제가 있으면 null 반환
 * - 유효한 경우에는 BBox 배열 반환
 * 
 * 방어 포인트:
 * - 공백 문자열
 * - 항목 개수 불일치
 * - 숫자가 아닌 입력
 * - 경계 순서 역전
 */
export function parseBBoxParam(value: string | null | undefined): BBox | null {
    if (typeof value !== "string") return null

    const trimmed = value.trim()
    if (!trimmed) return null

    const parts = trimmed.split(",")
    if (parts.length !== 4) return null

    const [south, west, north, east] = parts.map(Number)
    if (
        !Number.isFinite(south) ||
        !Number.isFinite(west) ||
        !Number.isFinite(north) ||
        !Number.isFinite(east)
    ) {
        return null
    }

    const bbox: BBox = [south, west, north, east]
    return isValidBBox(bbox) ? bbox : null
}

/**
 * SDK bounds 객체에서 사용하는 최소 좌표 shape
 * 
 * 의미:
 * - 외부 라이브러리의 구체 타입에 전면 의존하지 않고,
 *   현재 로직에 필요한 최소 계약만 추려 표현한 내부 어댑터 타입
 */
type BoundsPoint = { x: number; y: number }

/**
 * bounds 유사 객체의 최소 계약
 * 
 * 의미:
 * - getMin / getMax를 제공하는 객체라면 구체 구현체가 무엇이든 이 모듈에서 bbox 계산 대상으로 취급 가능
 */
type BoundsLike = {
    getMin: () => BoundsPoint
    getMax: () => BoundsPoint
}

/**
 * unknown 입력이 bounds 유사 객체인지 검사하고 안전하게 좁힘
 * 
 * 검증 기준:
 * - 객체
 * - getMin, getMax 함수가 모두 존재
 * 
 * 용도:
 * - 지도 SDK 반환 객체를 직접 신뢰하지 않고 최소 계약 기준으로 검사하기 위함
 */
export function toBoundsLike(bounds: unknown): BoundsLike | null {
    if (!bounds || typeof bounds !== "object") return null

    const candidate = bounds as Partial<BoundsLike>
    if (typeof candidate.getMin !== "function") return null
    if (typeof candidate.getMax !== "function") return null

    return candidate as BoundsLike
}

/**
 * bounds 유사 객체를 도메인 bbox 형식으로 변환
 * 
 * 변환 규칙:
 * - min.y -> south
 * - min.x -> west
 * - max.y -> north
 * - max.x -> east
 * 
 * 전제:
 * - 인자로 들어오는 bounds는 이미 toBoundsLike 등으로 최소 계약 검증이 끝난 상태
 */
export function computeBBoxFromBounds(bounds: BoundsLike): BBox {
    const min = bounds.getMin()
    const max = bounds.getMax()

    return [Number(min.y), Number(min.x), Number(max.y), Number(max.x)]
}

/**
 * lat() / lng() 함수 형태를 가진 좌표 객체의 최소 계약
 * 
 * 예:
 * - 일부 지도 SDK LatLng 객체
 */
type LatLngFuncShape = { lat: () => number; lng: () => number }

/**
 * x / y 숫자 프로퍼티를 가진 좌표 객체의 최소 계약
 * 
 * 주의:
 * - 현재 모듈에서 x=lng, y=lat 규칙
 */
type LatLngXYShape = { x: number; y: number }

/**
 * lat / lng 숫자 프로퍼티를 가진 좌표 객체의 최소 계약
 * 
 * 예:
 * - 일반적인 도메인 좌표 DTO
 */
type LatLngNumShape = { lat: number; lng: number }

/* 입력 객체가 lat()/lng() 함수 기반 shape인지 검사 */
function isLatLngFuncShape(v: unknown): v is LatLngFuncShape {
    if (!v || typeof v !== "object") return false

    const target = v as Record<string, unknown>

    return typeof target.lat === "function" && typeof target.lng === "function"
}

/* 입력 객체가 x / y 숫자 기반 shape인지 검사 */
function isLatLngXYShape(v: unknown): v is LatLngXYShape {
    if (!v || typeof v !== "object") return false

    const target = v as Record<string, unknown>

    return typeof target.x === "number" && typeof target.y === "number"
}

/* 입력 객체가 lat / lng 숫자 기반 shape인지 검사 */
function isLatLngNumShape(v: unknown): v is LatLngNumShape {
    if (!v || typeof v !== "object") return false

    const target = v as Record<string, unknown>

    return typeof target.lat === "number" && typeof target.lng === "number"
}

/**
 * 다양한 좌표 객체에서 위도(lat)를 추출
 * 
 * 지원 shape:
 * - lat() / lng() 함수 기반 객체
 * - x / y 숫자 기반 객체
 * - lat / lng 숫자 기반 객체
 * 
 * 반환 정책:
 * - 지원하지 않는 형태이면 NaN 반환
 * 
 * 주의:
 * - NaN을 반환할 수 있으므로, 호출부에서 후속 유효성 검사를 수행
 */
export function latOf(v: unknown): number {
    if (isLatLngFuncShape(v)) return Number(v.lat())
    if (isLatLngXYShape(v)) return Number(v.y)
    if (isLatLngNumShape(v)) return Number(v.lat)

    return Number.NaN
}

/**
 * 다양한 좌표 객체에서 경도(lng)를 추출
 * 
 * 지원 shape:
 * - lat() / lng() 함수 기반 객체
 * - x / y 숫자 기반 객체
 * - lat / lng 숫자 기반 객체
 * 
 * 반환 정책:
 * - 지원하지 않는 형태이면 NaN 반환
 * 
 * 주의:
 * - NaN을 반환할 수 있으므로, 호출부에서 후속 유효성 검사를 수행
 */
export function lngOf(v: unknown): number {
    if (isLatLngFuncShape(v)) return Number(v.lng())
    if (isLatLngXYShape(v)) return Number(v.x)
    if (isLatLngNumShape(v)) return Number(v.lng)

    return Number.NaN
}

/**
 * 여러 좌표를 포함하도록 지도 뷰를 자동 조정
 * 
 * 동작:
 * - 유효한 좌표만 순회 대상으로 사용
 * - 첫 유효 좌표를 bounds를 초기화한 뒤, 이후 좌표들을 extend 하여 전체 범위를 확장
 * - 최종 bounds가 생성된 경우에만 map.fitBounds를 호출
 * 
 * 동작:
 * - 잘못된 좌표가 일부 섞여 있어도 전체 동작이 깨지지 않도록 하기 위함
 * - 좌표가 하나도 유효하지 않은 경우 지도 상태를 함부로 변경하지 않기 위함
 * 
 * 주의:
 * - coords 배열이 비어 있거나 모두 무효 좌표이면 아무 동작도 하지 않음
 * - 지도 확대/축소 수준은 fitBounds의 SDK 정책에 따라 결정
 */
export function fitMapToCoords(
    maps: typeof naver.maps,
    map: naver.maps.Map,
    coords: Array<{ lat: number; lng: number }>
): void {
    let bounds: naver.maps.LatLngBounds | null = null

    for (const coord of coords) {
        if (!isValidGeoPoint(coord)) continue

        const point = new maps.LatLng(coord.lat, coord.lng)
        if (!bounds) {
            bounds = new maps.LatLngBounds(point, point)
            continue
        }

        bounds.extend(point)
    }

    if (bounds) {
        map.fitBounds(bounds)
    }
}