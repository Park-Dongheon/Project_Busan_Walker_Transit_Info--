// src/domains/attraction/api/attractions.ts

/**
 * attractions.ts (API Layer - 관광지 목록/상세 조회 API 및 React Query 훅)
 *
 * 역할/목적:
 * - 관광지 목록(페이징/필터/bbox) 및 상세 정보를 백엔드에서 조회하는 API 함수와
 *   React Query 기반 데이터 훅을 제공
 * - 다양한 입력 형식(URLSearchParams, 객체)을 정규화하여 일관된 네트워크 요청과 캐시 키 보장
 *
 * 데이터 흐름:
 *   Params (URLSearchParams | Partial<AttractionsQuery>)
 *      ↓  normalizeAttractionsQuery()
 *   NormalizedAttractionsQuery
 *      ↓  listAttractionsByNormalized() / useAttractionsPage() / useAttractions()
 *   PageResp<AttractionListCard>
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionsQuery              - 목록 조회 쿼리 파라미터 입력 모델
 *      · BBoxSWNE                      - bbox 구조체 타입 (shared 재노출)
 *      · ATTRACTIONS_API_MAX_PAGE_SIZE - 클라이언트 측 size 상한 정책값
 *      · formatBBoxSWNE                - bbox 구조체를 API 전달 문자열로 직렬화
 *      · listAttractions               - 임의 입력을 정규화 후 목록 API 호출
 *      · useAttractionsPage            - 페이지 전환 UX용 React Query 훅 (keepPreviousData)
 *      · useAttractions                - 일반 목록 조회 React Query 훅
 *      · getAttractionDetail           - 관광지 상세 조회 API 함수
 *      · attractionDetailQueryKey      - 상세 조회 캐시 키 생성 함수
 *      · useAttractionDetail           - 관광지 상세 조회 React Query 훅
 *
 * 동작 방식:
 * - 입력 정규화: readQuerySource → normalize(page/size/sort/keyword/bbox) → 캐시 키 직렬화
 * - bbox: formatBBoxSWNE로 "south,west,north,east" 문자열로 직렬화, 유효성 검증 포함
 * - 상세 조회: attractionId를 encodeURIComponent로 인코딩하여 경로 손상 방지
 *
 * 운영 포인트:
 * - ATTRACTIONS_API_MAX_PAGE_SIZE: 과도한 size 요청 방지를 위한 클라이언트 측 상한 상수
 * - 백엔드 엔드포인트/페이로드가 바뀌면 이 파일의 API 함수와 타입을 함께 갱신
 */

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/shared/api/core/client";
import type { PageResp } from "@/shared/types";
import type { BBoxSWNE as SharedBBoxSWNE } from "@/shared/types";
import type { AttractionDetail, AttractionListCard } from "@/domains/attraction";

/**
 * AttractionsQuery
 *
 * 역할/목적:
 * - 관광지 "목록 조회"에 사용하는 쿼리 파라미터 입력 모델(클라이언트 기반)
 *
 * 파라미터 의미:
 * - page/size: 페이지네이션 (0-based page 전제)
 * - sort: 정렬 규칙("field,asc|desc" 관례)
 * - keyword: 키워드 검색
 * - bbox: 지도 영역 필터("south,west,north,east" 문자열)
 *
 * 정책:
 * - sort/bbox의 최종 유효성(사용 필드/방향, bbox 형식/범위)은 서버에서 화이트리스트/검증으로 강제하는 것을 전제로 함
 * - 클라이언트는 "요청 상태 정규화"와 "캐시 키 결정"에 집중
 */
export type AttractionsQuery = {
    page?: number
    size?: number
    sort?: string
    keyword?: string
    bbox?: string // "south,west,north,east"
}

/**
 * Params
 *
 * 역할/목적:
 * - 목록 파라미터 입력 소스를 유연하게 받기 위한 유니온 타입
 *
 * 입력 소스 시나리오:
 * - URLSearchParams: 주소로 링크가 들어오거나 "문자열 기반" 입력
 * - Partial<AttractionsQuery>: UI 상태(숫자/문자 혼합) 기반 입력
 *
 * 포인트:
 * - 소스가 달라도 normalize 단계에서 단일한 규칙으로 정규화하여, "동일 의미 요청 = 동일 캐시 키" 보장
 */
type Params = URLSearchParams | Partial<AttractionsQuery>

/**
 * NormalizedAttractionsQuery
 *
 * 역할/목적:
 * - 네트워크 요청(params)과 캐시 키(queryKey)를 "정규화된 값"으로 구성하기 위한 내부 모델
 *
 * 정규화 정책:
 * - page/size는 정수로 보정
 * - keyword/sort/bbox는 trim 기반 정리
 * - 값이 비어 있으면 해당 키 자체를 제거하여 요청/캐시 키를 단순화
 *
 * 포인트:
 * - 정규화된 결과를 queryKey와 HTTP request에 동시에 사용하면 캐시 적중률 향상 및 불필요한 재요청 감소
 */
type NormalizedAttractionsQuery = {
    page?: number
    size?: number
    sort?: string
    keyword?: string
    bbox?: string
}

/**
 * ATTRACTIONS_API_MAX_PAGE_SIZE
 *
 * 역할/목적:
 * - 과도한 size 요청을 제한하기 위한 클라이언트 측 상한 정책
 *
 * 정책:
 * - UX/안전장치 목적의 보정이며, 서버에서의 최대 size 강제와 별개
 */
export const ATTRACTIONS_API_MAX_PAGE_SIZE = 200

/**
 * SORT_DIRECTIONS
 *
 * 역할/목적:
 * - sort 입력에서 허용하는 direction의 최소 집합
 *
 * 정책:
 * - 클라이언트는 direction을 asc/desc로 정리하는 정도까지만 담당
 * - "허용 필드"에 대한 서버 화이트리스트 검증이 최종 책임
 */
const SORT_DIRECTIONS = new Set(["asc", "desc"])

/**
 * BBoxSWNE
 *
 * 역할/목적:
 * - 지도 화면에서 bbox를 구조화하여 다루기 위한 타입
 *
 * 정책:
 * - 순서는 south, west, north, east(SWNE)로 고정
 */
export type BBoxSWNE = SharedBBoxSWNE

/**
 * formatBBoxSWNE
 *
 * - 구조화된 bbox를 API 전달 문자열("south,west,north,east")로 직렬화
 * - 각 값이 유한한 수(Number.isFinite)가 아니면 즉시 예외를 발생시켜 잘못된 요청 차단
 * - 위경도 범위(-90~90, -180~180), south<=north 같은 기하 제약은 서버에서 최종 검증되는 것을 전제로 함
 * - 이 함수는 "형태가 깨진 bbox"를 빠르게 걸러내는 1차 안전장치
 */
export function formatBBoxSWNE(b: BBoxSWNE): string {
    const values: Array<[keyof BBoxSWNE, number]> = [
        ["south", b.south],
        ["west", b.west],
        ["north", b.north],
        ["east", b.east],
    ]

    for (const [k, v] of values) {
        if (!Number.isFinite(v)) {
            throw new Error(`Invalid bbox value: ${String(k)}=${String(v)}`)
        }
    }

    return `${b.south},${b.west},${b.north},${b.east}`
}

/**
 * normalizeSort
 *
 * - sort 문자열 입력을 정리(trim)하고 "field,direction" 형태로 정규화
 * - 공백/빈문자열 입력은 undefined로 제거
 * - "field"만 있으면 그대로 반환 (방향은 서버 기본 정렬 정책에 위임)
 * - "field,direction"이면 direction을 소문자로 정리하고 asc/desc로 허용
 * - direction이 비허용이면 field만 반환하여 "형태는 유지하되 방향은 제거"
 * - 필드 허용 목록 검증은 서버가 최종 강제 (서버 화이트리스트에 위임)
 */
function normalizeSort(sort: unknown): string | undefined {
    if (typeof sort !== "string") return undefined

    const trimmed = sort.trim()
    if (trimmed.length === 0) return undefined

    const [fieldRaw, directionRaw] = trimmed.split(",", 2)
    const field = fieldRaw?.trim()
    const direction = directionRaw?.trim().toLowerCase()

    if (!field) return undefined
    if (!direction) return field
    if (!SORT_DIRECTIONS.has(direction)) return field

    return `${field},${direction}`
}

/**
 * normalizePage
 *
 * - page 입력을 0 이상 정수로 보정
 * - undefined/null/빈 문자열은 "미지정"으로 간주하고 undefined를 반환
 * - 숫자 파싱 실패(NaN/Infinity 등): 0으로 보정(첫 페이지로 이동)
 * - 유효 숫자: floor 후 0 이상으로 clamp
 * - URLSearchParams에서 들어오는 문자열 입력에도 동일 규칙으로 안전하게 적용
 */
function normalizePage(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value === "string" && value.trim().length === 0) return undefined

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 0

    return Math.max(0, Math.floor(parsed))
}

/**
 * normalizeSize
 *
 * - size 입력을 1이상 정수로 보정하고, 상한값을 적용
 * - undefined/null/빈 문자열은 "미지정"으로 간주하고 undefined 반환
 * - 숫자 파싱 실패: 1로 보정(최소 단위)
 * - 유효 숫자: floor 후 [1, MAX] 범위로 clamp
 * - 클라이언트에서 보정하더라도 서버에서의 최종 상한 적용이 안전 (이중 방어)
 */
function normalizeSize(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value === "string" && value.trim().length === 0) return undefined

    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return 1

    const floored = Math.floor(parsed)
    return Math.min(ATTRACTIONS_API_MAX_PAGE_SIZE, Math.max(1, floored))
}

/**
 * readQuerySource
 *
 * - Params 입력 소스(URLSearchParams 또는 객체)에서 원시 값을 추출
 * - URLSearchParams: 모든 값이 문자열(또는 null)이므로, 숫자 파싱/trim은 normalize 단계에서 수행
 * - 객체 입력: unknown으로 취급하고 normalize 단계에서 각 값을 안전하게 다룸
 * - 입력 소스 차이를 여기서 흡수하여, 이후 normalize 로직이 단일 규칙으로 동작
 */
function readQuerySource(params?: Params): Partial<Record<keyof AttractionsQuery, unknown>> {
    if (!params) return {}
    if (!(params instanceof URLSearchParams)) return params

    return {
        page: params.get("page"),
        size: params.get("size"),
        sort: params.get("sort"),
        keyword: params.get("keyword"),
        bbox: params.get("bbox"),
    }
}

/**
 * normalizeAttractionsQuery
 *
 * - 원시 입력(문자열/숫자 혼합)을 "요청/캐시 키에 바로 사용 가능한 정규화 모델"로 변환
 * - 정규화 포인트:
 *   - page/size는 number 정수 타입으로 고정(반올림 없음)
 *   - sort/keyword/bbox는 trim 기반 정리 후 빈 값 제거
 * - 캐시 정책:
 *   - 동일한 정규화 결과를 queryKey와 HTTP request에 동시에 사용하여,
 *     "동일 의미 요청 = 동일 캐시 키" 보장
 */
function normalizeAttractionsQuery(params?: Params): NormalizedAttractionsQuery {
    const source = readQuerySource(params)
    const normalized: NormalizedAttractionsQuery = {}

    const page = normalizePage(source.page)
    if (page !== undefined) normalized.page = page

    const size = normalizeSize(source.size)
    if (size !== undefined) normalized.size = size

    const sort = normalizeSort(source.sort)
    if (sort) normalized.sort = sort

    if (typeof source.keyword === "string") {
        const keyword = source.keyword.trim()
        if (keyword.length > 0) normalized.keyword = keyword
    }

    if (typeof source.bbox === "string") {
        const bbox = source.bbox.trim()
        if (bbox.length > 0) normalized.bbox = bbox
    }

    return normalized
}

/**
 * serializeAttractionsQuery
 *
 * - 정규화된 파라미터를 "안정적인 문자열"로 직렬화하여 queryKey 구성에 사용
 * - undefined/null 값은 제거하여 "의미 없는 차이"로 캐시 키가 분리되지 않게 함
 * - key를 정렬하여 입력 객체 프로퍼티 순서가 캐시 키에 영향을 주지 않게 함
 * - 복잡도: 파라미터 개수가 k이면 정렬 비용 O(k log k)
 *   여기서는 k가 작아 사실상 비용은 무시 가능한 수준
 */
function serializeAttractionsQuery(params: NormalizedAttractionsQuery): string {
    const entries: Array<[string, string]> = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)] as [string, string])
        .sort(([a], [b]) => a.localeCompare(b))

    return new URLSearchParams(entries).toString()
}

/**
 * toRequestParams
 *
 * - 정규화된 결과가 비어 있으면 params 자체를 생략
 * - 불필요한 query string 생성을 줄이고, 서버/로그에서 "기본 조회"와 "필터 조회"를 구분하기 쉽게 함
 */
function toRequestParams(params: NormalizedAttractionsQuery): NormalizedAttractionsQuery | undefined {
    return Object.keys(params).length > 0 ? params : undefined
}

/**
 * listAttractionsByNormalized
 *
 * - "정규화된 파라미터"를 입력으로 받아 목록 API를 호출하는 내부 함수
 * - GET /api/v1/attractions (baseURL 기준)
 * - AbortSignal을 전달하면 화면 전환/파라미터 변경 시 진행 중인 요청 취소 가능
 * - 임의 입력 소스(Params)를 직접 받는 도구와 분리됨으로써, 네트워크 계층은 항상 정규화된 입력만 처리
 */
async function listAttractionsByNormalized(
    params: NormalizedAttractionsQuery,
    signal?: AbortSignal
): Promise<PageResp<AttractionListCard>> {
    const response = await api.get<PageResp<AttractionListCard>>("/attractions", {
        params: toRequestParams(params),
        signal,
    })

    return response.data
}

/**
 * listAttractions
 *
 * - 임의 입력(Params)을 받아 정규화 후 목록 API를 호출하는 공개 함수
 * - normalizeAttractionsQuery를 1차 정규화 후 listAttractionsByNormalized에 위임
 */
export async function listAttractions(
    params?: Params,
    signal?: AbortSignal
): Promise<PageResp<AttractionListCard>> {
    const normalized = normalizeAttractionsQuery(params)

    return listAttractionsByNormalized(normalized, signal)
}

/**
 * useAttractionsPage
 *
 * - 페이지 전환 UX(이전 데이터 유지)가 필요한 "페이징 목록" 조회용 React Query 훅
 * - 캐시/네트워크 정책:
 *   - queryKey는 serializeAttractionsQuery로 안정적으로 구성
 *   - queryFn은 정규화된 입력을 사용하며 AbortSignal을 전달
 *   - placeholderData: keepPreviousData를 통해 페이지 전환 시 기존 데이터를 유지하여 깜빡임 감소
 * - enabled 정책:
 *   - 지도 bbox 준비 등과 같이 "요청하면 안 되는 상태"에서 조건부로 조회 차단 가능
 * - keepPreviousData 사용 시 "현재 페이지"와 "표시 데이터"가 짧게 불일치할 수 있으므로,
 *   화면 레벨에서 로딩/전환 UX 정책을 명확히 해두는 것이 좋음
 */
export function useAttractionsPage(
    params?: Params,
    enabled: boolean = true
): UseQueryResult<PageResp<AttractionListCard>> {
    const normalizedParams = normalizeAttractionsQuery(params)

    return useQuery<PageResp<AttractionListCard>>({
        queryKey: ["attractions", serializeAttractionsQuery(normalizedParams)],
        queryFn: ({ signal }) => listAttractionsByNormalized(normalizedParams, signal),
        enabled,
        placeholderData: keepPreviousData,
    })
}

/**
 * useAttractions
 *
 * - placeholder(이전 데이터 유지)가 필요 없는 일반 목록 조회용 React Query 훅
 * - 캐시 정책:
 *   - cache namespace를 "attractionsAll"로 분리하여 "페이징용 캐시"와 충돌하지 않게 함
 * - 동일한 정규화/직렬화 규칙을 사용하므로,
 *   입력 의미가 같으면 캐시 키도 동일하게 유지
 */
export function useAttractions(params?: Params): UseQueryResult<PageResp<AttractionListCard>> {
    const normalizedParams = normalizeAttractionsQuery(params)

    return useQuery<PageResp<AttractionListCard>>({
        queryKey: ["attractionsAll", serializeAttractionsQuery(normalizedParams)],
        queryFn: ({ signal }) => listAttractionsByNormalized(normalizedParams, signal),
    })
}

/**
 * getAttractionDetail
 *
 * - 관광지 상세 정보를 조회하는 API 함수
 * - GET /api/v1/attractions/{attractionId}
 * - path segment로 들어가는 식별자는 encodeURIComponent로 인코딩하여 특수 문자로 인한 경로 손상 방지
 * - 식별자의 포맷은 서버/DB 모델과 일치해야 하며, URL에서 의미를 갖는 문자(/, ?, #)가 포함될 수 있는 경우 인코딩 필수
 */
export async function getAttractionDetail(attractionId: string, signal?: AbortSignal): Promise<AttractionDetail> {
    const encodedAttractionId = encodeURIComponent(attractionId)
    const response = await api.get<AttractionDetail>(`/attractions/${encodedAttractionId}`, { signal })

    return response.data
}

/**
 * attractionDetailQueryKey
 *
 * - 상세 조회 캐시 키를 생성하는 유틸리티 함수
 * - 상세는 ID 단위로 캐시가 분리되도록 설계되어, 키 구조를 고정하면 invalidation/프리페치 전략 수립 용이
 */
export function attractionDetailQueryKey(attractionId: string) {
    return ["attractionDetail", attractionId] as const
}

/**
 * useAttractionDetail
 *
 * - 관광지 상세 조회용 React Query 훅
 * - attractionId가 falsy이면 enabled=false로 비활성화하여 불필요한 호출 방지
 * - queryFn에 AbortSignal을 연결하면 언마운트/라우팅 시 자동 요청 취소 가능
 */
export function useAttractionDetail(attractionId: string): UseQueryResult<AttractionDetail> {
    return useQuery<AttractionDetail>({
        queryKey: attractionDetailQueryKey(attractionId),
        queryFn: ({ signal }) => getAttractionDetail(attractionId, signal),
        enabled: Boolean(attractionId),
    })
}