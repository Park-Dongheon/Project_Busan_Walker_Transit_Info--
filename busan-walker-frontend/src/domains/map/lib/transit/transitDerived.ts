// src/domains/map/lib/transit/transitDerived.ts

/**
 * transitDerived.ts (Derived Layer - 파생 데이터 변환 계층)
 * 
 * 역할/목적:
 * - 서버 응답 타입인 MapTransitOption(원시 데이터)을
 *   UI가 바로 사용할 수 있는 ResolvedTransitOption(가공 데이터)으로 변환
 * - null 제거, 텍스트 정규화, 거리/도보 레이블 포맷, 좌표 추출,
 *   캐시 key 생성까지 UI 렌더링에 필요한 모든 전처리를 이 파일에서 완결
 * - UI 컴포넌트는 이 파일의 출력 타입(ResolvedTransitOption)만 의존
 *   원시 MapTransitOption을 컴포넌트가 직접 다루는 일은 없어야 함
 * 
 * 데이터 흐름:
 *   MapTransitOption       (서버 응답 - DB 컬럼 구조 그대로, null 다수)
 *      ↓   buildResolvedTransitOptions()
 *   ResolvedTransitOption  (이 파일 출력 - null 제거, 레이블 완성)
 *      ↓   buildTransitOptionItems()
 *   TransitOptionPanelItem (UI 패널 렌더링용 최소 필드셋)
 * 
 * 공개 정책 / 설계 원칙:
 * - export 대상: ResolvedTransitOption 타입과 아래 5개 함수만 노출
 *      · resolveTransitDestinationName       - 단일 option에서 목적지명만 필요할 때
 *      · buildResolvedTransitOptions         - 목록 전체 변환
 *      · buildResolvedTransitOptionsCacheKey - 메모이제이션 key 생성
 *      · buildTransitOptionItems             - 패널용 슬라이스 + 필드 축소
 *      · buildTransitOverlayDatasetSignature - 지도 마커 재렌더 판단용 식별자
 * - 내부 헬퍼(toOptionalText 등)와 단일 변환 함수(buildResolvedTransitOption)는
 *   모듈 내부에만 존재, 외부에서 직접 호출할 이유 x
 * - 이 파일은 순수 변환 로직만 close, 상태(State) 보관·API 호출·사이드이펙트 없음
 *   캐싱 Map 자체의 생명주기는 model 계층이 관리
 * 
 * 동작 방식:
 * - 시설명 결정은 "fallback 우선순위 체인"으로 처리
 *   DB에는 시설을 가리키는 컬럼이 facilityName / busStopNo / entranceName
 *   세 개 존재하며, 어느 컬럼에 값이 있는지는 레코드마다 다름
 *   따라서 항상 다음 순서로 첫 번째 유효값을 사용
 *      facilityName → busStopNo → entranceName → fallback(모드명 또는 고정 상수)
 * - 모든 텍스트는 toOptionalText()를 통해 빈 문자열을 null로 통일한 뒤 처리
 * - 거리·도보 레이블은 null이면 EMPTY_INFO_LABEL('정보 없음')을 반환해 컴포넌트 내부의 조건 분기를 없앰
 * - buildResolvedTransitOptionsCacheKey는 attractionId + myLocation(소수점 5자리) + 각 옵션의 좌표·거리·서명을
 *   직렬화한 문자열을 반환, model 계층의 Map<string, ...> key로 사용
 * 
 * 운영 포인트:
 * - fallback 체인의 우선순위를 바꾸면 지도 마커 타이틀과 패널 표시가 동시에 바뀜
 *   resolvedTransitDestinationNameFromParts 한 곳만 수정하면 전파
 * - DISTANCE_SOURCE_LABELS의 한글 레이블을 바꾸면 UI에 즉시 반영
 *   DB ENUM 값('GEO' | 'RAW') 자체는 건드리지 않음
 * - buildTransitOptionItems의 visibleLimit은 호출부(패널 컴포넌트)가 결정
 *   이 파일은 limit 정책을 알지 못하며 알 필요도 없음
 * - myLocation이 null이면 myWalkApprox는 전체 null
 *   이 필드는 표시하는 UI는 null 여부로 노출 여부를 판단
 */

import type {
    GeoPoint,
    MapTransitOption,
    TransitOptionPanelItem,
    TransitWalkApprox
} from '../../types';
import { isValidGeoPoint } from '../geo';
import {
    buildTransitOptionLookupSignature,
    buildTransitOptionStableKey,
    estimateWalkFromCoords,
    formatKmLabel,
    normalizeTransitOptionText,
    resolveTransitDistanceKm,
    resolveTransitRenderablePoint,
    resolveTransitWalkMin
} from './transitOptions';

// UI에 노출되는 고정 문자열, 한 곳에서 관리해 번역·수정 시 누락을 방지
const DEFAULT_MODE_LABEL = '대중교통'
const DEFAULT_FACILITY_LABEL = '교통 지점 정보 없음'
const EMPTY_INFO_LABEL = '정보 없음'

// DB ENUM('GEO' | 'RAW') → 사용자 표시용 한글 레이블 매핑
const DISTANCE_SOURCE_LABELS = {
    GEO: '직선거리 기반',
    RAW: '원천 데이터 기반'
} as const

/**
 * 빈 문자열과 null을 null로 통일
 * 
 * - 원시데이터에는 공백·빈 문자열이 섞여 있어 ??(nullish) 연산자만으로는 충분하지 않음
 */
function toOptionalText(value: unknown): string | null {
    const normalized = normalizeTransitOptionText(value)

    return normalized.length > 0 ? normalized : null
}

/**
 * DB ENUM 값을 한글 레이블로 변환
 * 
 * - 매핑되지 않은 값은 원문 그대로 반환해 버전업 시 새 ENUM이 추가돼도 crash 없이 표시
 */
function resolveDistanceSourceLabel(source: string | null): string | null {
    if (!source) return null

    const normalized = source.toUpperCase()

    if (normalized === 'GEO') return DISTANCE_SOURCE_LABELS.GEO
    if (normalized === 'RAW') return DISTANCE_SOURCE_LABELS.RAW

    return source
}

// modeName이 없는 레코드를 위한 기본값 처리
function resolveTransitModeName(option: MapTransitOption): string {
    return toOptionalText(option.modeName) ?? DEFAULT_MODE_LABEL
}

/**
 * 목적지 표시 이름 결정 - fallback 우선순위 체인의 실제 구현체
 * 
 * - 마커 타이틀·패널 헤더 등 "장소명"이 필요한 모든 곳에서 공통으로 사용
 */
function resolveTransitDestinationNameFromParts(args: {
    facilityName: string | null
    busStopNo: string | null
    entranceName: string | null
    fallbackModeName: string
}): string {
    const { facilityName, busStopNo, entranceName, fallbackModeName } = args

    return facilityName ?? busStopNo ?? entranceName ?? fallbackModeName
}

/**
 * 패널 서브텍스트용 시설 레이블
 * 
 * - resolveTransitDestinationNameFromParts와 체인 로직은 동일하나
 *   최종 fallback이 다름: 전자 - modeName(동적), 후자 - 고정 상수
 */
function resolveTransitFacilityLabel(args: {
    facilityName: string | null
    busStopNo: string | null
    entranceName: string | null
}): string {
    const { facilityName, busStopNo, entranceName } = args

    return facilityName ?? busStopNo ?? entranceName ?? DEFAULT_FACILITY_LABEL
}

// null이면 '정보 없음'을 반환해 컴포넌트에서 별도 분기 없이 그대로 렌더링 가능
function formatTransitDistanceLabel(distanceKm: number | null): string {
    return distanceKm !== null ? formatKmLabel(distanceKm) : EMPTY_INFO_LABEL
}

function formatTransitWalkLabel(walkMin: number | null): string {
    return walkMin !== null ? `${walkMin}분` : EMPTY_INFO_LABEL
}

/**
 * 단일 교통 옵션에서 목적지 표시 이름을 반환
 * 
 * - 목록 변환(buildResolvedTransitOptions)을 거치지 않고
 *   이름만 단독으로 필요한 경우(지도 마커 타이틀 등)에 사용
 * 
 * @param option - 서버 응답 원시 교통 옵션
 * @returns facilityName → busStopNo → entranceName → modeName 순의 첫 번째 유효값
 */
export function resolveTransitDestinationName(option: MapTransitOption): string {
    return resolveTransitDestinationNameFromParts({
        facilityName: toOptionalText(option.facilityName),
        busStopNo: toOptionalText(option.busStopNo),
        entranceName: toOptionalText(option.entranceName),
        fallbackModeName: resolveTransitModeName(option)
    })
}

/**
 * 이 파일의 핵심 출력 타입
 * - MapTransitOption의 원시값을 UI가 직접 사용할 수 있는 형태로 정규화한 결과물
 * 
 * 주요 필드 설계 의도:
 * - key            : React 리스트 렌더링용. 중복 없음을 buildTransitOptionStableKey가 보장
 * - lookupSignature: 캐시 key 구성용 경량 식별자. 전체 직렬화보다 빠름
 * - hasCoord       : point !== null을 미리 계산해 둔 boolean. 컴포넌트 조건 분기를 단순화
 * - iconKey        : 지도 마커 아이콘 결정용 복합 키 (modeCode|modeName|transitClassName)
 * - modeLabel      : 패널 표시용 교통수단 레이블. transitClassName이 있으면 "버스 / 간선버스" 형태
 * - facilityLabel  : 시설 서브텍스트. null이 절대 없음을 보장
 * - distanceLabel  : 포맷된 거리 문자열. null 없음 보장 ("1.2km" 또는 "정보 없음")
 * - walkLabel      : 포맷된 도보 시간 문자열. null 없음 보장
 * - myWalkApprox   : 사용자 현재 위치 기준 도보 추정. myLocation이 null이면 이 필드도 null
 */
export type ResolvedTransitOption = {
    key: string
    option: MapTransitOption
    accessNo: string
    lookupSignature: string
    point: GeoPoint | null
    hasCoord: boolean
    title: string
    destinationName: string
    iconKey: string
    modeCode: string
    modeName: string
    transitClassName: string | null
    modeLabel: string
    facilityName: string | null
    facilityLabel: string
    busStopNo: string | null
    entranceName: string | null
    facilityAddress: string | null
    distanceKm: number | null
    distanceLabel: string
    walkMin: number | null
    walkLabel: string
    distanceSourceLabel: string | null
    myWalkApprox: TransitWalkApprox | null
}

/**
 * MapTransitOption 1개 → ResolvedTransitOption 1개 변환
 * 
 * - 외부에 노출 x, 진입점은 항상 buildResolvedTransitOptions를 통함
 */
function buildResolvedTransitOption(
    option: MapTransitOption,
    duplicateCount: Map<string, number>,
    myLocation: GeoPoint | null
): ResolvedTransitOption {
    const point = resolveTransitRenderablePoint(option)
    const accessNo = normalizeTransitOptionText(option.accessNo)
    const modeCode = normalizeTransitOptionText(option.modeCode)
    const modeName = resolveTransitModeName(option)
    const transitClassName = toOptionalText(option.transitClassName)
    const facilityName = toOptionalText(option.facilityName)
    const busStopNo = toOptionalText(option.busStopNo)
    const entranceName = toOptionalText(option.entranceName)
    const facilityAddress = toOptionalText(option.facilityAddress)
    const distanceKm = resolveTransitDistanceKm(option)
    const walkMin = resolveTransitWalkMin(option)
    const destinationName = resolveTransitDestinationNameFromParts({
        facilityName,
        busStopNo,
        entranceName,
        fallbackModeName: modeName
    })

    return {
        key: buildTransitOptionStableKey(option, duplicateCount),
        option,
        accessNo,
        lookupSignature: buildTransitOptionLookupSignature(option),
        point,
        // point 존재 여부를 boolean으로 미리 확정해 컴포넌트에서 point !== null 반복을 없앰
        hasCoord: point !== null,
        title: destinationName,
        destinationName,
        // transitClassName이 없으면 빈 문자열로 채워 키 구조를 일정하게 유지
        iconKey: `${modeCode}|${modeName}|${transitClassName ?? ''}`,
        modeCode,
        modeName,
        transitClassName,
        // transitClassName이 있을 때만 슬래시로 구분해 합침 ("버스 / 간선버스")
        modeLabel: transitClassName ? `${modeName} / ${transitClassName}` : modeName,
        facilityName,
        facilityLabel: resolveTransitFacilityLabel({ facilityName, busStopNo, entranceName }),
        busStopNo,
        entranceName,
        facilityAddress,
        distanceKm,
        distanceLabel: formatTransitDistanceLabel(distanceKm),
        walkMin,
        walkLabel: formatTransitWalkLabel(walkMin),
        distanceSourceLabel: resolveDistanceSourceLabel(toOptionalText(option.distanceSource)),
        myWalkApprox: estimateWalkFromCoords(myLocation, point)
    }
}

/**
 * myLocation을 캐시 key 문자열로 직렬화
 * 
 * - 소수점 5자리(=1m 해상도)로 반올림해 미세한 GPS 오차로 캐시가 불필요하게 깨지는 것을 방지
 */
function buildResolvedTransitOptionsMyLocationKey(myLocation: GeoPoint | null): string {
    return isValidGeoPoint(myLocation)
        ? `${myLocation.lat.toFixed(5)},${myLocation.lng.toFixed(5)}`
        : 'none'
}

/**
 * 교통 옵션 배열 전체를 ResolvedTransitOption 배열로 변환
 * 
 * - duplicateCount Map은 호출마다 새로 생성되며 호출 간 상태를 공유하지 않음
 * - 목록 내 동일 시설명이 중복될 때 React key 충돌을 방지하기 위한 내부 카운터로,
 *   반드시 목록 단위로 공유되어야 카운팅이 정확
 * 
 * @param transitOptions - 서버 응답 원시 교통 옵션 배열
 * @param myLocation     - 사용자 현재 위치. null이면 myWalkApprox가 전체 null
 * @returns 정규화·레이블 포맷이 완료된 ResolvedTransitOption 배열
 */
export function buildResolvedTransitOptions(
    transitOptions: MapTransitOption[],
    myLocation: GeoPoint | null
): ResolvedTransitOption[] {
    const duplicateCount = new Map<string, number>()

    return transitOptions.map((option) =>
        buildResolvedTransitOption(option, duplicateCount, myLocation)
    )
}

/**
 * model 계층의 메모이제이션 Map에서 사용할 캐시 key를 생성
 * 
 * key 구성: attractionId | myLocation(소수점 5자리) | 옵션별(서명|좌표|거리|도보)
 *          입력이 동일하면 항상 동일한 문자열을 반환하므로, 재계산 필요 여부 판단에 사용
 * 
 * @param args.selectedAttractionId - 현재 선택된 관광지 ID
 * @param args.transitOptions       - 변환 전 원시 교통 옵션 배열
 * @param args.myLocation           - 사용자 현재 위치
 * @returns 캐시 식별용 직렬화 문자열
 */
export function buildResolvedTransitOptionsCacheKey(args: {
    selectedAttractionId: string
    transitOptions: MapTransitOption[]
    myLocation: GeoPoint | null
}): string {
    const { selectedAttractionId, transitOptions, myLocation } = args
    const myLocationKey = buildResolvedTransitOptionsMyLocationKey(myLocation)
    const optionSignature = transitOptions
        .map((option) => {
            const point = resolveTransitRenderablePoint(option)
            // 좌표가 없는 옵션은 'NaN'으로 고정해 key 구조를 일정하게 유지
            const latKey = point ? point.lat.toFixed(6) : 'NaN'
            const lngKey = point ? point.lng.toFixed(6) : 'NaN'
            const distanceKey = resolveTransitDistanceKm(option)
            const walkKey = resolveTransitWalkMin(option)

            return `${buildTransitOptionLookupSignature(option)}|${latKey},${lngKey}|${distanceKey ?? 'none'}|${walkKey ?? 'none'}`
        })
        .join('||')

    return `${selectedAttractionId}|${myLocationKey}|${optionSignature}`
}

/**
 * 패널에 표시할 교통 옵션을 visibleLimit 만큼 잘라 TransitOptionPanelItem 배열로 반환
 * 
 * - ResolvedTransitOption의 상세 필드 중 패널 렌더링에 불필요한 것을 제거해 컴포넌트가 받는 데이터를 최소화
 * - visibleLimit 정책은 호출부(패널 컴포넌트)가 결정하며, 이 함수는 알지 못함
 * 
 * @param transitOptions - 변환 완료된 ResolvedTransitOption 배열
 * @param visibleLimit   - 패널에 표시할 최대 개수
 * @returns 패널 렌더링용 최소 필드셋 배열
 */
export function buildTransitOptionItems(
    transitOptions: ResolvedTransitOption[],
    visibleLimit: number
): TransitOptionPanelItem[] {
    return transitOptions.slice(0, visibleLimit).map((option) => ({
        key: option.key,
        option: option.option,
        hasCoord: option.hasCoord,
        modeLabel: option.modeLabel,
        facilityLabel: option.facilityLabel,
        distanceLabel: option.distanceLabel,
        walkLabel: option.walkLabel,
        myWalkApprox: option.myWalkApprox
    }))
}

/**
 * 지도 오버레이 마커 재렌더링 여부를 판단하기 위한 데이터셋 식별자를 생성
 * 
 * - 좌표 + iconKey + title이 모두 동일하면 같은 데이터셋으로 간주
 * - 이 식별자를 이전 값과 비교해 변경이 없으면 마커 레이어를 다시 그리지 않음
 * 
 * @param transitOptions - 변환 완료된 ResolvedTransitOption 배열 (readonly)
 * @returns 마커 재렌더 판단용 직렬화 문자열
 */
export function buildTransitOverlayDatasetSignature(
    transitOptions: readonly ResolvedTransitOption[]
): string {
    return transitOptions
        .map((option) => {
            // 좌표 없는 옵션도 'NaN, NaN'으로 고정해 식별자 구조를 일정하게 유지
            const pointKey = option.point
                ? `${option.point.lat.toFixed(6)},${option.point.lng.toFixed(6)}`
                : 'NaN,NaN'

            return `${option.key}|${pointKey}|${option.iconKey}|${option.title}`
        })
        .join('||')
}