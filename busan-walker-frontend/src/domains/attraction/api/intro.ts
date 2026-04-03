// src/domains/attraction/api/attractionIntros.ts

/**
 * intro.ts (API Layer - 관광지 소개 카드 페이징 조회 API 및 React Query 훅)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지에서 관광지 카드 목록을 페이징 방식으로 조회하는 API 함수와
 *   React Query 기반 데이터 훅을 제공
 * - 입력 파라미터를 정규화하여 일관된 네트워크 요청과 캐시 키 보장
 *
 * 데이터 흐름:
 *   AttractionIntroCardsPageParams
 *      ↓  normalizeAttractionIntroCardsPageParams()
 *   NormalizedAttractionIntroCardsPageParams
 *      ↓  listAttractionIntroCardsPage() / useAttractionIntroCardsPage()
 *   AttractionIntroCardsPageResponse
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionIntroCardResponse           - 소개 카드 단건 응답 DTO
 *      · AttractionIntroCardsPageResponse      - 소개 카드 페이지 응답 DTO
 *      · AttractionIntroCardsPageParams        - 소개 카드 목록 조회 입력 파라미터
 *      · attractionIntroCardsPageQueryKey      - 외부에서 queryKey를 직접 생성할 때 사용
 *      · listAttractionIntroCardsPage          - 소개 카드 목록 페이징 API 함수
 *      · useAttractionIntroCardsPage           - 소개 카드 목록 조회 React Query 훅
 *
 * 동작 방식:
 * - 입력 정규화: page/size clamp, keyword trim, sort 방향 검증
 * - 정규화된 파라미터를 직렬화하여 React Query queryKey로 사용
 * - keepPreviousData로 페이지 전환 시 UI 깜빡임 방지
 *
 * 운영 포인트:
 * - ATTRACTION_INTRO_MAX_PAGE_SIZE: 과도한 size 요청 방지 상수, 정책 변경 시 갱신
 * - 백엔드 응답 스키마(ApiPage<T>)가 변경되면 AttractionIntroCardsPageResponse를 함께 갱신
 */

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { api } from "@/shared/api/core/client";

/**
 * AttractionIntroCardResponse
 *
 * 역할/목적:
 * - 관광지 "소개 카드(인트로 UI)" 렌더링에 필요한 최소 응답 데이터 계약(DTO)
 *
 * 응답 정책:
 * - 소개 화면은 많은 그리드 항목을 반복 렌더링하므로, 이 화면에 필요한 최소한의 필드만 포함하지 않는 것을 지양
 * - 백엔드 스키마와 1:1로 매핑하여, 클라이언트의 불필요한 변환/추론을 최소화
 *
 * 정책:
 * - address/categoryName/story* 같은 nullable 필드는 UI에서 null-safe 렌더링이 필요
 * - 목록 DTO와 상세 DTO를 분리하면, 캐시/네트워크/렌더링 비용을 각각 독립적으로 최적화 가능
 */
export type AttractionIntroCardResponse = {
    keyId: string
    placeName: string
    address: string | null
    imageUrl: string | null
    categoryName: string | null
    storyTitle: string | null
    storySummary: string | null
    storyUrl: string | null
    coreKeywords: string | null
}

/**
 * AttractionIntroCardsPageResponse
 *
 * 역할/목적:
 * - 백엔드 페이지네이션 응답(ApiPage<T>)과 1:1로 대응하는 클라이언트 타입
 *
 * 정책:
 * - 이 타입은 GET /api/v1/attractions/intros의 응답 스키마를 반영
 * - content/page/size/totalElements/totalPages 필드는 다음에 사용:
 *   - 목록 UI(페이지네이션 표시/버튼 활성화)
 *   - React Query 캐시 키 관리
 *
 * 주의:
 * - page는 0-based 인덱스(서버/클라이언트 양측에서 일관되게 관리)
 */
export type AttractionIntroCardsPageResponse = {
    content: AttractionIntroCardResponse[]
    page: number
    size: number
    totalElements: number
    totalPages: number
}

/**
 * AttractionIntroCardsPageParams
 *
 * 역할/목적:
 * - 소개 카드 목록 조회에 필요한 "입력 파라미터" 계약
 *
 * 정책:
 * - page는 0-based
 * - sort/keyword는 선택 항목
 * - 허용 필드/정렬 유효성(화이트리스트 검증)은 서버가 책임진다는 전제로 함
 *
 * 주의:
 * - 클라이언트에서 sort 문자열을 그대로 넘기지 않고, normalizeSort를 통해 최소한의 클라이언트 측 정규화 수행
 */
export type AttractionIntroCardsPageParams = {
    page: number
    size: number
    sort?: string
    keyword?: string
}

/**
 * NormalizedAttractionIntroCardsPageParams
 *
 * 역할/목적:
 * - 네트워크 요청(params)과 캐시 키(queryKey) 구성을 위한 중간
 *   "정규화된 값"으로 구성된 파라미터 타입
 *
 * 정규화 정책:
 * - page/size: 정수로 보정 및 클램프
 * - keyword: trim 후 빈 값은 undefined
 * - sort: normalizeSort 정책 적용(방향 정규화, direction 검증)
 *
 * 포인트:
 * - "정규화된 입력"을 캐시 키에 사용하면, 입력 문자열의 흔들림(공백/대소문자/NaN 등)이
 *   캐시 미스로 이어지는 불필요한 재요청 방지
 */
type NormalizedAttractionIntroCardsPageParams = {
    page: number
    size: number
    sort?: string
    keyword?: string
}

/**
 * 클라이언트 측 page size 상한
 * - 서버에서도 독립적으로 상한을 적용하더라도, 클라이언트에서도 과도한 요청을 제한
 */
const ATTRACTION_INTRO_MAX_PAGE_SIZE = 200

/**
 * 허용되는 sort direction
 * - 클라이언트는 최소한의 방향 유효성만 검증하고,
 *   실제 필드/정책에 대한 판단은 서버 화이트리스트에 위임
 */
const VALID_SORT_DIRECTIONS = new Set(["asc", "desc"])

/**
 * normalizeSort
 *
 * - sort 문자열을 "field,direction" 형태로 정규화하여 요청/캐시 키를 일관화
 * - 동작 정책:
 *   - 입력이 없거나 빈 문자열이면 undefined로 반환
 *   - "field"만 있는 경우: field를 반환(방향은 서버 기본 정렬 정책에 위임)
 *   - "field,direction" 형식인 경우:
 *     - direction을 소문자로 정규화
 *     - asc/desc 외 나머지이면 direction을 무시하고 field만 반환
 * - 실제 "필드 허용 목록" 검증은 서버 화이트리스트에서 최종 처리 (서버 위임)
 */
function normalizeSort(sort: string | undefined): string | undefined {
    if (typeof sort !== "string") return undefined

    const trimmed = sort.trim()
    if (trimmed.length === 0) return undefined

    const [fieldRaw, directionRaw] = trimmed.split(",", 2)
    const field = fieldRaw?.trim()
    const direction = directionRaw?.trim().toLowerCase()

    if (!field) return undefined
    if (!direction) return field
    if (!VALID_SORT_DIRECTIONS.has(direction)) return field

    return `${field},${direction}`
}

/**
 * normalizeAttractionIntroCardsPageParams
 *
 * - 다양한 입력/URLSearchParams/혼합 값 등 "틀릴 수 있는 입력"을
 *   네트워크 요청과 캐시에 바로 사용할 수 있는 형태로 정규화
 * - 동작 정책:
 *   - page: 0 이상 정수로 클램프 (미달 시 0)
 *   - size: 1 이상 정수로 클램프 (미달 시 1), 그리고 상한(ATTRACTION_INTRO_MAX_PAGE_SIZE)
 *   - keyword: trim 후 빈 값은 undefined
 *   - sort: normalizeSort 적용
 * - 정규화된 "API 요청 파라미터"와 "캐시 키 파라미터"에 동시에 기여
 */
function normalizeAttractionIntroCardsPageParams(
    params: AttractionIntroCardsPageParams,
): NormalizedAttractionIntroCardsPageParams {
    const pageRaw = Number(params.page)
    const sizeRaw = Number(params.size)

    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0
    const sizeUnclamped = Number.isFinite(sizeRaw) && sizeRaw >= 1 ? Math.floor(sizeRaw) : 1
    const size = Math.min(ATTRACTION_INTRO_MAX_PAGE_SIZE, sizeUnclamped)

    const keywordRaw = typeof params.keyword === "string" ? params.keyword.trim() : ""
    const keyword = keywordRaw.length > 0 ? keywordRaw : undefined

    const sort = normalizeSort(params.sort)

    return { page, size, keyword, sort }
}

/**
 * serializeAttractionIntroCardsParams
 *
 * - 정규화된 파라미터를 "안정적인 문자열"로 직렬화하여 캐시 키 요소로 사용
 * - 정책:
 *   - undefined/null 값은 제외하여 "의미 없는 차이"로 캐시 키가 분리되지 않도록 함
 *   - key 이름 순 정렬로 전체 프로퍼티 순서가 결과에 영향을 주지 않도록 함
 * - 포인트(캐시 안정성):
 *   - React Query에서 queryKey는 "동일 요청이면 동일 키"가 되어야 캐시 재활용 가능
 *   - 문자열 직렬화는 이 안정성(키 확정)을 위한 수단
 * - 복잡도:
 *   - 파라미터 수가 k이면 정렬 비용 O(k log k)
 *   - 여기서는 k가 매우 작아 성능에 영향 없음
 */
function serializeAttractionIntroCardsParams(
    params: NormalizedAttractionIntroCardsPageParams
): string {
    const entries: Array<[string, string]> = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)] as [string, string])
        .sort(([a], [b]) => a.localeCompare(b))

    return new URLSearchParams(entries).toString()
}

/**
 * attractionIntroCardsPageQueryKeyFromNormalized
 *
 * - 정규화된 파라미터를 기반으로 React Query queryKey를 생성
 * - 키 구성 정책:
 *   - ["attractions", "intros", "page", <serializedParams>]
 *     - 도메인(attractions) / 리소스(intros) / 유형(page)으로 계층 분리
 *     - 마지막 요소로 정규화된 파라미터를 넣어 "동일 요청 = 동일 캐시 키" 보장
 */
function attractionIntroCardsPageQueryKeyFromNormalized(
    params: NormalizedAttractionIntroCardsPageParams
) {
    return ["attractions", "intros", "page", serializeAttractionIntroCardsParams(params)] as const
}

/**
 * attractionIntroCardsPageQueryKey
 *
 * - 외부 호출자가 원시 파라미터를 전달하면 내부에서 정규화 후 queryKey를 반환
 * - 포인트:
 *   - queryKey 생성 과정에 정규화를 포함하면, 입력 값의 흔들림(공백/NaN 등)이 캐시 키 분리를 유발하지 않음
 */
export function attractionIntroCardsPageQueryKey(
    params: AttractionIntroCardsPageParams
) {
    const normalized = normalizeAttractionIntroCardsPageParams(params)
    return attractionIntroCardsPageQueryKeyFromNormalized(normalized)
}

/**
 * listAttractionIntroCardsPage
 *
 * - 소개(인트로)에서 관광지 카드 목록을 페이징 방식으로 조회하는 API 함수
 * - 동작:
 *   - GET /api/v1/attractions/intros
 *   - params를 normalize 후 전달하여 항상 정규화된 상태를 사용
 *   - AbortSignal을 지원하며, 화면 전환/파라미터 변경 시 진행 중인 요청 취소 가능
 * - 주의:
 *   - page는 0-based로 관리
 */
export async function listAttractionIntroCardsPage(
    params: AttractionIntroCardsPageParams,
    signal?: AbortSignal,
): Promise<AttractionIntroCardsPageResponse> {
    const normalized = normalizeAttractionIntroCardsPageParams(params)

    const response = await api.get<AttractionIntroCardsPageResponse>("/attractions/intros", {
        params: normalized,
        signal,
    })
    return response.data
}

/**
 * useAttractionIntroCardsPage
 *
 * - 소개 카드 목록의 페이징 조회를 React Query로 캡슐화한 커스텀 훅
 * - 캐시/네트워크 정책:
 *   - queryKey는 "정규화 + 직렬화"를 조합하여 안정적으로 구성
 *   - placeholderData: keepPreviousData
 *     로 페이지 전환 시 이전 데이터를 유지하여 UI 깜빡임 방지(스켈레톤 UX)
 *   - queryFn에서 signal을 list 함수에 전달하여, 언마운트/파라미터 변경 시 요청 취소
 * - 주의:
 *   - keepPreviousData는 UX를 부드럽게 만드는 반면,
 *     화면에서의 "현재 페이지"와 "표시 데이터"가 잠깐 불일치할 수 있으므로
 *     로딩 인디케이터/오버레이 등 정책을 화면 레벨에서 명확히 정의
 */
export function useAttractionIntroCardsPage(
    params: AttractionIntroCardsPageParams,
): UseQueryResult<AttractionIntroCardsPageResponse, AxiosError> {
    const normalizedParams = normalizeAttractionIntroCardsPageParams(params)

    return useQuery<AttractionIntroCardsPageResponse, AxiosError>({
        queryKey: attractionIntroCardsPageQueryKeyFromNormalized(normalizedParams),
        queryFn: ({ signal }) => listAttractionIntroCardsPage(normalizedParams, signal),
        placeholderData: keepPreviousData,
    })
}