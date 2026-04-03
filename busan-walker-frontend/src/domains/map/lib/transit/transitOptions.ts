// src/domains/map/lib/transit/transitOptions.ts

/**
 * transitOptions.ts (Primitive Layer - 원시 데이터 정규화 및 순수 계산 계층)
 * 
 * 역할/목적:
 * - 서버 응답의 unknown 타입 원시값을 MapTransitOption 타입으로 안전하게 정규화
 * - 정규화된 옵션에서 좌표, 거리, 도보 시간을 추출하는 순수 함수를 제공
 * - 지도 마커 key 생성, 거리 포맷, 하버사인 거리 계산 등
 *   transit 도메인 전반에서 공통으로 사용하는 기반 유틸을 담음
 * - transitDerived.ts가 import하는 하위 계층
 *   UI 컴포넌트나 model 계층이 이 파일을 직접 import하는 일은 없어야 함
 * 
 * 데이터 흐름:
 *   unknown (서버 응답 배열 - 타입 보장 없음)
 *      ↓  normalizeTransitOption()
 *   MapTransitOption[]  (타입 확정, null 안전 보장)
 *      ↓  resolveTransit*() / buildTransitOption*()
 *   GeoPoint | number | string  (파생 계층이 사용하는 계산 결과)
 * 
 * 공개 정책 / 설계 원칙:
 * - export 대상: 아래 10개 함수만 노출. 내부 변환 헬퍼는 모두 모듈 내부
 *      · formatKm                          - 거리 숫자 → 표시용 문자열 포맷
 *      · formatKmLabel                     - 거리 숫자 → "X.Xkm" 레이블 (null 안전)
 *      · normalizeTransitOptions           - unknown[] → MapTransitOption[] 일괄 정규화
 *      · normalizeTransitOptionText        - unknown → string (null/undefined 안전 변환)
 *      · buildTransitOptionLookupSignature - 옵션 식별용 서명 문자열 생성
 *      · buildTransitOptionStableKey       - React key / 캐시 key용 중복 없는 stable key 생성
 *      · resolveTransitRenderablePoint     - 렌더링 가능한 GeoPoint 추출
 *      · resolveTransitDistanceKm          - 거리값 우선순위 체인으로 km 단위 반환
 *      · resolveTransitWalkMin             - 도보 시간 정규화 (최소 1분 보장)
 *      · estimateWalkFromCoords            - 두 좌표 사이 하버사인 거리 + 도보 시간 추정
 * - 내부 헬퍼(to* 계열), toDistanceSource, haversineDistanceKm은 외보에 노출하지 않음
 *   사용처가 이 파일 내부로 제한되어야 변경 영향 범위가 통제
 * - 모든 함수는 순수 함수. 상태 변경·API 호출·사이드이펙트 없음
 * 
 * 동작 방식:
 * - 정규화(normalizeTransitOptions)는 배열 순회 → toRecord → normalizeTransitOptionRecord 순서로 진행
 *   파싱 불가 항목은 조용히 skip하며 예외를 던지지 않음
 * - distanceSource 필드는 DistanceSource 타입('GEO' | 'RAW')으로 엄격히 검증
 *   DISTANCE_SOURCES Set에 없는 문자열은 null로 처리해 타입 안정성을 보장
 * - 거리 우선순위 체인(resolveTransitDistanceKm):
 *      distanceKm(서버 계산값) → distanceM / 1000 → rawDistanceM / 1000
 *   세 필드 중 첫 번째 유효한 음수가 아닌 값을 사용
 * - 좌표 유효성 검사(resolveTransitRenderablePoint)는 세 단계로 진행
 *      1) facilityHasCoord === false → 즉시 null (DB 플래그 우선)
 *      2) lat/lon 숫자 파싱 실패 → null
 *      3) 위도(-90~90) / 경도(-180~180) 범위 초과 → null
 * - stable key(buildTransitOptionStableKey)는 accessNo가 있으면 "access:{no}#N",
 *   없으면 좌표·modeCode 등 9개 필드를 파이프(|)로 이은 identity 문자열에 "#N"을 붙임
 * - N은 동일 baseKey의 등장 횟수로, 호출부가 전달하는 duplicateCount Map이 관리
 * - 도보 시간 추정(estimateWalkFromCoords)은 하버사인 공식으로 구면 거리를 계산하고
 *   기본 보행 속도 4.2km/h를 적용. 결과는 최소 1분으로 보정
 * 
 * 운영 포인트:
 * - DistanceSource에 새로운 값이 추가되면 DISTANCE_SOURCES Set도 함께 갱신
 *   누락 시 해당 값이 null로 처리되어 distanceSourceLabel이 표시되지 않음
 * - DEFAULT_WALKING_SPEED_KMPH(4.2)를 변경하면 estimateWalkFromCoords의 모든 결과가 바뀜
 *   호출부에서 walkingSpeedKmph 파라미터로 재정의할 수 있으므로 전역 변경 전에 확인
 * - TRANSIT_COORD_PRECISION(6)을 변경하면 buildTransitOptionLookupSignature와
 *   buildTransitOptionStableKey의 key 형태가 바뀜. 기존 캐시 key와 호환되지 않음
 * - normalizeTransitOptions는 파싱 실패 항목을 skip
 *   서버 응답 스키마가 변경되어 누락 필드가 생겨도 런타임 crash는 없지만,
 *   결과 배열 길이가 입력보다 짧아질 수 있음. 필요 시 로그를 추가해 추적
 */

import type { DistanceSource } from '@/domains/attraction';
import type { GeoPoint, MapTransitOption } from '../../types';
import { isValidGeoPoint, isValidLatitude, isValidLongitude } from '../geo';

// 좌표가 없는 옵션의 key 구성 시 자리를 채워 key 구조를 일정하게 유지
const TRANSIT_COORD_EMPTY_KEY = 'NaN'

// key 생성 시 좌표 소수점 자릿수 - 변경하면 모든 lookup signature와 stable key 형태가 변경
const TRANSIT_COORD_PRECISION = 6

// estimateWalkFromCoords의 기본 보행 속도 - 호출부에서 파라미터로 재정의 가능
const DEFAULT_WALKING_SPEED_KMPH = 4.2

// modeName과 transitClassName이 모두 없을 때 사용하는 최종 fallback 레이블
const DEFAULT_TRANSIT_MODE_LABEL = '대중교통'

// 거리값이 null일 때 표시할 고정 문자열 - UI에 빈 문자열이 노출되지 않도록 함
const EMPTY_DISTANCE_LABEL = '정보 없음'

// 하버사인 공식에 사용하는 지구 평균 반지름(미터)
const EARTH_RADIUS_M = 6_371_000

/**
 * unknown → number | null - Number()로 강제 변환 후 유한수인지 검사
 * 
 * - NaN·Infinity는 데이터로 사용할 수 없으므로 null로 처리
 */
function toNullableFiniteNumber(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value)

    return Number.isFinite(parsed) ? parsed : null
}

// 거리·도보 시간 등 음수가 의미 없는 값에 사용 - 0은 유효한 값으로 허용
function toNonNegativeFiniteNumber(value: unknown): number | null {
    const parsed = toNullableFiniteNumber(value)

    return parsed !== null && parsed >= 0 ? parsed : null
}

/**
 * string이 아니거나 공백만 있으면 null을 반환
 * 
 * - 원시 데이터의 공백 문자열을 명시적으로 "값 없음"으로 처리하기 위해 분리
 */
function trimToNull(value: unknown): string | null {
    if (typeof value !== 'string') return null

    const trimmed = value.trim()

    return trimmed.length > 0 ? trimmed : null
}

/**
 * string·number·bigint만 허용하고 나머지 타입(object, boolean 등)은 null로 반환
 * 
 * - accessNo처럼 서버가 숫자 또는 문자열로 혼재해서 내려보내는 필드에 사용
 */
function toNullableStringCoercePrimitive(value: unknown): string | null {
    if (typeof value === 'string') return trimToNull(value)

    if (typeof value === 'number' || typeof value === 'bigint') {
        const text = String(value).trim()

        return text.length > 0 ? text : null
    }

    return null
}

/**
 * "1"/"0"·"true"/"false"·숫자 1/0 등 다양한 형태로 내려오는 boolean 계열 필드를 처리
 * 
 * - facilityHasCoord가 DB에서 TINYINT(1)로 저장되어 숫자로 내려올 수 있기 때문
 */
function toNullableBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value

    if (typeof value === 'number') {
        if (value === 1) return true
        if (value === 0) return false
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()

        if (normalized === 'true' || normalized === '1') return true
        if (normalized === 'false' || normalized === '0') return false
    }

    return null
}

/**
 * 배열과 null은 Record가 아니므로 명시적으로 걸러냄
 * 
 * - normalizeTransitOptionRecord 진입 전에 파싱 불가 항목을 조기 skip하기 위해 사용
 */
function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    return value as Record<string, unknown>
}

/**
 * 허용된 DistanceSource 값을 Set으로 관리
 * 
 * - includes() 대신 Set.has()를 사용해 타입 가드와 O(1) 검사를 동시에 확보
 */
const DISTANCE_SOURCES = new Set<DistanceSource>(['GEO', 'RAW'])

/**
 * unknown → DistanceSource | null
 * 
 * - Set에 없는 문자열은 null로 처리해 타입 안정성을 보장
 * - trimToNull과 달리 값이 있어도 DistanceSource가 아니면 null을 반환
 */
function toDistanceSource(value: unknown): DistanceSource | null {
    const text = trimToNull(value)

    return text !== null && DISTANCE_SOURCES.has(text as DistanceSource) ? (text as DistanceSource) : null
}

/**
 * modeName이 없으면 transitClassName으로 대체하고, 둘 다 없으면 고정 레이블을 사용
 * 
 * - 두 필드를 함께 보는 이유: DB에서 교통수단명이 어느 컬럼에 들어오는지 레코드마다 다를 수 있음
 */
function toTransitModeName(rawModeName: unknown, rawTransitClassName: unknown): string {
    return trimToNull(rawModeName) ?? trimToNull(rawTransitClassName) ?? DEFAULT_TRANSIT_MODE_LABEL
}

/**
 * 좌표를 key 문자열로 변환
 * 
 * - null이면 TRANSIT_COORD_EMPTY_KEY로 자리를 채워
 *   파이프(|) 구분 key의 필드 수를 항상 일정하게 유지
 */
function toTransitCoordKey(value: unknown): string {
    const coord = toNullableFiniteNumber(value)

    return coord !== null ? coord.toFixed(TRANSIT_COORD_PRECISION) : TRANSIT_COORD_EMPTY_KEY
}

/**
 * buildTransitOptionStableKey와 buildTransitOptionLookupSignature가 공통으로 사용하는 9개 필드 배열
 * 
 * - 두 함수의 identity 기준을 한 곳에서 관리하기 위해 분리
 */
function buildTransitOptionIdentityParts(option: MapTransitOption): string[] {
    return [
        toTransitCoordKey(option.facilityLat),
        toTransitCoordKey(option.facilityLon),
        normalizeTransitOptionText(option.modeCode),
        normalizeTransitOptionText(option.modeName),
        normalizeTransitOptionText(option.transitClassName),
        normalizeTransitOptionText(option.facilityName),
        normalizeTransitOptionText(option.busStopNo),
        normalizeTransitOptionText(option.entranceName),
        normalizeTransitOptionText(option.facilityAddress)
    ]
}

/**
 * stable key의 base를 결정
 * 
 * - accessNo가 있으면 짧고 명확한 "access:{no}"를 사용하고,
 *   없으면 9개 identity 필드를 이어 붙인 문자열을 fallback으로 사용
 */
function buildTransitOptionBaseKey(option: MapTransitOption): string {
    const accessNo = normalizeTransitOptionText(option.accessNo)

    if (accessNo.length > 0) {
        return `access:${accessNo}`
    }

    return buildTransitOptionIdentityParts(option).join('|')
}

/**
 * unknown Record를 MapTransitOption으로 변환
 * 
 * - 각 필드에 적합한 to* 헬퍼를 적용해 타입을 확정하고 null 안전성을 보장
 */
function normalizeTransitOptionRecord(record: Record<string, unknown>): MapTransitOption {
    return {
        accessNo: toNullableStringCoercePrimitive(record.accessNo),
        // modeCode가 없으면 빈 문자열로 확정 - null을 허용하지 않아 하위 함수의 분기를 줄임
        modeCode: trimToNull(record.modeCode) ?? '',
        modeName: toTransitModeName(record.modeName, record.transitClassName),
        transitClassName: trimToNull(record.transitClassName),
        facilityName: trimToNull(record.facilityName),
        busStopNo: trimToNull(record.busStopNo),
        entranceName: trimToNull(record.entranceName),
        facilityAddress: trimToNull(record.facilityAddress),
        distanceKm: toNullableFiniteNumber(record.distanceKm),
        distanceM: toNullableFiniteNumber(record.distanceM),
        rawDistanceM: toNullableFiniteNumber(record.rawDistanceM),
        // trimToNull 대신 toDistanceSource를 사용해 'GEO'|'RAW' 외 값을 null로 걸러냄
        distanceSource: toDistanceSource(record.distanceSource),
        facilityLat: toNullableFiniteNumber(record.facilityLat),
        facilityLon: toNullableFiniteNumber(record.facilityLon),
        facilityHasCoord: toNullableBoolean(record.facilityHasCoord),
        walkMin: toNullableFiniteNumber(record.walkMin)
    }
}

/**
 * 구면 두 점 사이의 거리를 하버사인 공식으로 계산해 km 단위로 반환
 * 
 * - 직선 거리(유클리드)가 아닌 지구 곡률을 반영하므로 지도 서비스에 적합
 */
function haversineDistanceKm(from: GeoPoint, to: GeoPoint): number {
    const toRad = (degree: number) => (degree * Math.PI) / 180

    const lat1 = toRad(from.lat)
    const lat2 = toRad(to.lat)
    const dLat = lat2 - lat1
    const dLng = toRad(to.lng - from.lng)

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

    return (EARTH_RADIUS_M * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))) / 1000
}

/**
 * 거리 숫자를 표시용 문자열로 포맷
 * 
 * - 1km 미만은 소수점 2자리, 1km 이상은 소수점 1자리로 표시
 * 
 * @param distanceKm - km 단위 거리 (음수·비유한수는 '0.00' 반환)
 * @returns 포맷된 숫자 문자열  ("0.85", "1.2" 등, 단위 미포함)
 */
export function formatKm(distanceKm: number): string {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
        return '0.00'
    }

    return distanceKm < 1 ? distanceKm.toFixed(2) : distanceKm.toFixed(1)
}

/**
 * unknown 값을 받아 "X.Xkm" 형태의 레이블을 반환
 * 
 * - 유효하지 않은 값이면 EMPTY_DISTANCE_LABEL('정보 없음')을 반환해 UI 분기를 없앰
 * 
 * @param value - km 단위 거리로 변환할 임의 값
 * @returns "0.85km" / "1.2km" 형태의 문자열, 또는 '정보 없음'
 */
export function formatKmLabel(value: unknown): string {
    const distanceKm = toNonNegativeFiniteNumber(value)

    return distanceKm !== null ? `${formatKm(distanceKm)}km` : EMPTY_DISTANCE_LABEL
}

/**
 * 서버 응답의 unknown 배열을 MapTransitOption 배열로 일괄 정규화
 * 
 * - 파싱 불가 항목은 예외 없이 skip하므로 결과 배열 길이가 입력보다 짧을 수 있음
 * 
 * @param value - 서버에서 받은 원시 배열 (타입 보장 없음)
 * @returns 타입이 확정된 MapTransitOption 배열 (빈 배열 가능)
 */
export function normalizeTransitOptions(value: unknown): MapTransitOption[] {
    if (!Array.isArray(value)) return []

    const normalized: MapTransitOption[] = []

    for (const item of value) {
        const record = toRecord(item)
        // toRecord가 null을 반환하면 객체가 아닌 항목이므로 skip
        if (!record) continue

        normalized.push(normalizeTransitOptionRecord(record))
    }

    return normalized
}

/**
 * unknown 값을 안전하게 string으로 변환
 * 
 * - null·undefined는 빈 문자열로, 나머지는 String() 후 trim
 * - 반환값은 항상 string이며 null이 되지 않음
 * 
 * @param value - 변환할 임의 값
 * @returns trim된 string (빈 문자열 가능, null 없음)
 */
export function normalizeTransitOptionText(value: unknown): string {
    return String(value ?? '').trim()
}

/**
 * 옵션의 9개 identity 피드를 파이프(|)로 이은 서명 문자열을 반환
 * 
 * - 캐시 key 구성 및 중복 감지에 사용하는 경량 식별자
 * - accessNo가 없는 옵션도 일관된 형태의 서명을 가짐
 * 
 * @param option - 서명을 생성할 교통 옵션
 * @returns 파이프 구분 identity 문자열
 */
export function buildTransitOptionLookupSignature(option: MapTransitOption): string {
    return buildTransitOptionIdentityParts(option).join('|')
}

/**
 * React 리스트 렌더링 및 캐시 key로 사용할 중복 없는 stable key를 생성
 * 
 * - accessNo가 있으면 "access:{no}#N", 없으면 identity 문자열에 "#N"을 붙임
 * - N은 동일 baseKey의 이번 호출 내 등장 횟수(0부터 시작)이며,
 *   duplicateCount Map이 이를 추적. 이 Map은 호출부(buildResolvedTransitOptions)가
 *   목록 단위로 생성해 전달해야 카운팅이 정확하게 동작
 * 
 * @param option         - key를 생성할 교통 옵션
 * @param duplicateCount - 동일 baseKey 등장 횟수를 추적하는 Map (호출부가 관리)
 * @returns 목록 내에서 중복되지 않는 stable key 문자열
 */
export function buildTransitOptionStableKey(
    option: MapTransitOption,
    duplicateCount: Map<string, number>
): string {
    const baseKey = buildTransitOptionBaseKey(option)
    const duplicateIndex = duplicateCount.get(baseKey) ?? 0

    duplicateCount.set(baseKey, duplicateIndex + 1)

    return `${baseKey}#${duplicateIndex}`
}

/**
 * 지도에 렌더링 가능한 GeoPoint를 추출
 * 
 * - 좌표가 없거나 유효하지 않은 옵션은 null을 반환해 마커 생성을 막음
 * 
 * 유효성 검사 순서:
 *      1) facilityHasCoord === false → 즉시 null (DB 플래그 우선)
 *      2) lat/lon 숫자 파싱 실패 → null
 *      3) 위도(-90~90) / 경도(-180~180) 범위 초과 → null
 * 
 * @param option - 좌표를 추출할 교통 옵션
 * @returns 유효한 GeoPoint 또는 null
 */
export function resolveTransitRenderablePoint(option: MapTransitOption): GeoPoint | null {
    // DB가 명시적으로 "좌표 없음"을 표시한 경우 이후 계산을 생략
    if (option.facilityHasCoord === false) return null

    const lat = toNullableFiniteNumber(option.facilityLat)
    const lng = toNullableFiniteNumber(option.facilityLon)

    if (lat === null || lng === null) return null
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null

    return { lat, lng }
}

/**
 * 교통 옵션에서 km 단위 거리를 우선순위 체인으로 추출
 * 
 * - 우선순위: distanceKm → distanceM / 1000 → rawDistanceM / 1000
 * - 세 필드 모두 없거나 유효하지 않으면 null을 반환
 * - 음수 거리는 유효하지 않은 값으로 처리해 null로 반환
 * 
 * @param option - 거리를 추출할 교통 옵션
 * @returns km 단위 거리 또는 null
 */
export function resolveTransitDistanceKm(option: MapTransitOption): number | null {
    // 서버가 이미 km 단위로 계산해 내려준 값을 우선 사용
    const distanceKm = toNonNegativeFiniteNumber(option.distanceKm)
    if (distanceKm !== null) return distanceKm

    // distanceM은 서비스 기준 거리(DB 확정값), rawDistanceM은 CSV 원본값 - 둘 다 m 단위이므로 1000으로 나눠 km로 환산
    const distanceM = toNonNegativeFiniteNumber(option.distanceM)
    if (distanceM !== null) return distanceM / 1000

    const rawDistanceM = toNonNegativeFiniteNumber(option.rawDistanceM)
    if (rawDistanceM !== null) return rawDistanceM / 1000

    return null
}

/**
 * 도보 시간(분)을 정규화
 * 
 * - 서버 값이 있으면 반올림하고, 0분 이하는 1분으로 보정
 * - 서버 값이 없으면 null을 반환. 좌표 기반 추정은 estimateWalkFromCoords가 담당
 * 
 * @param option - 도보 시간을 추출할 교통 옵션
 * @returns 정규화된 도보 시간(분, 최소 1) 또는 null
 */
export function resolveTransitWalkMin(option: MapTransitOption): number | null {
    const walkMin = toNonNegativeFiniteNumber(option.walkMin)

    // 반올림 후 최소 1분을 보장 - 0.4분처럼 반올림 결과가 0이 되는 값 때문
    return walkMin !== null ? Math.max(1, Math.round(walkMin)) : null
}

/**
 * 두 좌표 사이의 하버사인 거리와 도보 시간을 추정
 * 
 * - 주로 사용자 현재 위치(from)에서 교통 시설(to)까지의 이동 정보를 구할 때 사용
 * - from 또는 to가 유효하지 않거나 walkingSpeedKmph가 0이하이면 null을 반환
 * 
 * @param from             - 출발 좌표 (사용자 현재 위치)
 * @param to               - 도착 좌표 (교통 시설 위치)
 * @param walkingSpeedKmph - 보행 속도(km/h), 기본값 4.2
 * @returns { distanceKm, walkMin } 또는 null
 */
export function estimateWalkFromCoords(
    from: GeoPoint | null | undefined,
    to: GeoPoint | null | undefined,
    walkingSpeedKmph = DEFAULT_WALKING_SPEED_KMPH,
): { distanceKm: number; walkMin: number } | null {
    if (!isValidGeoPoint(from) || !isValidGeoPoint(to)) return null
    // 속도가 0 이하면 나눗셈 결과가 무한대가 되므로 즉시 null을 반환 
    if (!Number.isFinite(walkingSpeedKmph) || walkingSpeedKmph <= 0) return null

    const distanceKm = haversineDistanceKm(from, to)
    if (!Number.isFinite(distanceKm)) return null

    // 도보 시간 = 거리 / 속도 * 60분 - 최소 1분 보정은 resolveTransitWalkMin과 동일한 정책
    return {distanceKm, walkMin: Math.max(1, Math.round((distanceKm / walkingSpeedKmph) * 60))}
}