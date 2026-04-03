// src/domains/favorite/api/favorites.ts

/**
 * favorites.ts (Favorite Domain API + React Query SSOT)
 *
 * 역할/목적:
 * - 즐겨찾기 도메인의 API 호출 함수와 React Query 캐시 키/정책을 한 파일로 표준화
 * - 즐겨찾기 존재(exists) 여부 확인을 세 단계로 최적화:
 *   1) 이미 로드된 목록 캐시에서 true 즉시 반환(네트워크 0)
 *   2) 단건 exists API 호출(네트워크 1)
 *   3) 불가능한 경우 전체 목록 스캔 fallback(네트워크 N)
 * - 즐겨찾기 토글(add/remove)은 optimistic update로 UI 즉각성을 확보하고,
 *   성공 후 재검증, 실패 후 롤백으로 최종 일관성(source of truth) 수렴
 *
 * 공개 정책 / 설계 원칙:
 * - 즐겨찾기 추가/제거에 필요한 Command API를 외부에 공개
 * - 클라이언트 UI의 즉각 반응은 이 파일이 담당하고, 최종 서버 상태와의 동기화도 여기서 처리
 * - 인증 401/403/409/5xx 등 롤백/재동기화가 필요한 에러 흐름은 각 호출 측에서 처리
 */

import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
    type QueryKey
} from "@tanstack/react-query";
import { isAxiosError, type AxiosError } from "axios";
import { api } from "@/shared/api/core/client";
import type { AttractionCard } from "@/domains/attraction";
import type { PageResp } from "@/shared/types";
import {
    FAVORITES_SORT_FIELDS,
    type FavoritesQuery,
    type FavoritesSort,
    type FavoritesSortField
} from "@/domains/favorite/types";

/* -------------------------------------------------------------------------- */
/* Domain Limits & Cache Policy                                               */
/* -------------------------------------------------------------------------- */

/**
 * FAVORITES_API_MAX_PAGE_SIZE
 * - favorites 목록 조회 시 클라이언트에서 허용하는 최대 page size.
 * - 과도한 size 입력값이 들어온 요청에도 1차적으로 완화
 * - 실제 서버 제한은 반드시 서버에서도 강제
 *
 * FAVORITES_SCAN_* (fallback 스캔 정책)
 * - ids 전용 API / exists API가 없을 때 페이지네이션으로 전체 keyId를 수집
 * - 페이지 스캔의 네트워크 비용을 제어하기 위해:
 *   - 페이지당 size를 제한
 *   - 최대 스캔할 수 제한(MAX_PAGES)을 두어 무한 루프를 방지
 *
 * staleTime / gcTime
 * - 즐겨찾기는 사용자 액션으로 인해 바뀔 수 있으므로 적절히 짧은 캐시가 타당
 * - 반대로 너무 짧으면 불필요한 재요청이 많아질 수 있어, UX와 네트워크 비용의 균형점을 설정
 */
const FAVORITES_API_MAX_PAGE_SIZE = 200
const FAVORITES_SCAN_PAGE_SIZE = 100
const FAVORITES_SCAN_MAX_PAGES = 100

/**
 * FAVORITES_SCAN_SORT_* (fallback 스캔의 정렬 후보)
 *
 * 목적:
 * - 전체 페이지네이션 조회로 모든 ids를 수집할 때 페이지 중복/누락 없이 안전하게 순회
 * - 일관된 순서로 모든 페이지를 안전히 탐색할 수 있도록 정렬 후보를 둠
 *
 * 전략:
 * - 스캔 시작 전에 후보를 순서대로 시도하고, 성공하는 첫 후보를 선택
 * - 선택된 후보로 이후 스캔 페이지를 탐색
 *
 * 주의:
 * - sort 파라미터는 서버가 허용하는 형식만 동작
 * - 서버가 지원하지 않는 형식이면 400/422가 발생할 수 있고, 이 경우 다음 후보를 시도
 */
const FAVORITES_SCAN_SORT_PRIMARY = "favoredAt:desc,keyId:asc"
const FAVORITES_SCAN_SORT_FALLBACK = "favoredAt,desc"
const FAVORITES_SCAN_SORT_CANDIDATES = [
    FAVORITES_SCAN_SORT_PRIMARY,
    FAVORITES_SCAN_SORT_FALLBACK,
    undefined
] as const

const FAVORITES_STALE_TIME = 10_000
const FAVORITES_GC_TIME = 60_000
const FAVORITE_IDS_STALE_TIME = 30_000
const FAVORITE_IDS_GC_TIME = 120_000
const FAVORITES_SORT_FIELD_SET = new Set<FavoritesSortField>(FAVORITES_SORT_FIELDS)

/**
 * FavoritePageSnapshots
 *
 * 의미:
 * - QueryClient에 캐시된 favorites 목록 페이지의 캐시를 (queryKey, pageData) 쌍의 배열로 표현
 *
 * 사용 맥락:
 * - exists 확인 시, 이미 로드된 목록에서 해당 true를 반환하기 위해 참조
 * - remove optimistic update 시, 모든 캐시된 목록 페이지에서 해당 항목을 제거하기 위해 참조
 */
type FavoritePageSnapshots = Array<[QueryKey, PageResp<AttractionCard>]>

/**
 * FavoriteExistsResponse
 *
 * - 단건 exists 엔드포인트 응답 타입.
 * - GET /favorites/{id}/exists -> { exists: boolean }
 */
type FavoriteExistsResponse = {
    exists: boolean
}

/**
 * FavoriteScanPage
 *
 * fallback 스캔 시 1개씩 조회한 결과물로,
 * 해당 스캔에서 선택된 sort 후보를 함께 다루기 위한 내부 타입
 */
type FavoriteScanPage = {
    data: PageResp<AttractionCard>
    selectedSort?: FavoritesSort
}

/**
 * isFavoritesSortField
 *
 * 역할:
 * - 문자열이 favorites 허용 정렬 필드 중 하나인지 검사
 *
 * 포인트:
 * - sort 입력값 처리 시 화이트리스트를 사용하여 잘못된 필드를 초기에 제거
 */
function isFavoritesSortField(value: string): value is FavoritesSortField {
    return FAVORITES_SORT_FIELD_SET.has(value as FavoritesSortField)
}

/**
 * normalizeFavoritesSortDirection
 *
 * 역할:
 * - 정렬 방향 문자열을 "asc" | "desc" 중 하나로 정규화
 *
 * 규칙:
 * - 대소문자 구분 없이 소문자 변환
 * - 빈 값이면 서버 기본값 "asc"를 반환
 * - 유효하지 않은 방향값이면 undefined를 반환
 *
 * 주의:
 * - 이 함수의 기본값 "asc"는 direction 토큰이 비었을 때의 처리이며,
 *   호출 측에서 direction 자체를 생략할 때는 해당 분기 없이 처리하는 것이 안전
 */
function normalizeFavoritesSortDirection(directionRaw?: string): "asc" | "desc" | undefined {
    const normalized = directionRaw?.trim().toLowerCase()
    if (!normalized) return "asc"
    if (normalized === "asc" || normalized === "desc") return normalized

    return undefined
}

/* -------------------------------------------------------------------------- */
/* Normalize & Serialize                                                      */
/* -------------------------------------------------------------------------- */

/**
 * normalizeFavoritesSort
 *
 * 역할:
 * - 외부에서 전달된 sort 문자열을 favorites API 요청에 사용할 수 있는 형태로 정규화
 *
 * 입력 형태(예시):
 * - 단순 정렬: "field,asc|desc"
 * - 복합 정렬: "field:asc,field2:desc"
 *
 * 정책:
 * - 공백 제거, 대소문자 소문자 통일, 기본 방향(asc) 적용을 수행
 * - 허용 필드(FAVORITES_SORT_FIELDS) 외의 필드가 들어오면 잘못된 입력으로 처리
 *
 * 반환 규칙:
 * - 유효하지 않은 sort 입력은 undefined 반환
 * - 정렬 방향이 생략되면 field만 반환하여 서버 기본 정렬 정책을 위임
 *
 * 주의:
 * - sort 파라미터는 서버가 허용하는 형식과 일치 필요
 * - 형식 불일치 시 400/422 발생 가능, fallback 스캔에서는 후보 재시도로 처리
 */
function normalizeFavoritesSort(sort: FavoritesQuery["sort"] | undefined): FavoritesSort | undefined {
    if (typeof sort !== "string") return undefined

    const trimmed = sort.trim()
    if (trimmed.length === 0) return undefined

    if (trimmed.includes(":")) {
        const tokens = trimmed
            .split(",")
            .map((token) => token.trim())
            .filter((token) => token.length > 0)

        if (tokens.length === 0) return undefined

        const normalizedTokens: string[] = []

        for (const token of tokens) {
            const [fieldRaw, directionRaw] = token.split(":", 2)
            const field = fieldRaw?.trim()
            if (!field || !isFavoritesSortField(field)) return undefined

            const direction = normalizeFavoritesSortDirection(directionRaw)
            if (!direction) return undefined
            normalizedTokens.push(`${field}:${direction}`)
        }

        return normalizedTokens.join(",") as FavoritesSort
    }

    const [fieldRaw, directionRaw] = trimmed.split(",", 2)
    const field = fieldRaw?.trim()
    const direction = normalizeFavoritesSortDirection(directionRaw)

    if (!field || !isFavoritesSortField(field)) return undefined
    if (!directionRaw || !directionRaw.trim()) return field

    if (!direction) return undefined
    return `${field},${direction}`
}

/**
 * normalizeFavoritesQuery
 *
 * 역할:
 * - favorites 목록 조회 파라미터(page/size/sort)를 요청 가능한 형태로 정규화
 *
 * 정규화 규칙:
 * - page: 0 이상의 정수로 보정(유효하지 않은 경우 0)
 * - size: 1 이상의 정수로 보정 후 최대값(FAVORITES_API_MAX_PAGE_SIZE) 클램핑
 * - sort: normalizeFavoritesSort 함수를 반영
 *
 * 반환 정책:
 * - 유효한 파라미터가 하나도 없으면 undefined 반환
 *   (불필요한 query string 생성 및 캐시 키 분기 최소화를 위함)
 */
function normalizeFavoritesQuery(params?: FavoritesQuery): FavoritesQuery | undefined {
    if (!params) return undefined

    const normalized: FavoritesQuery = {}

    if (params.page !== undefined && params.page !== null) {
        const pageRaw = Number(params.page)
        normalized.page = Number.isFinite(pageRaw) ? Math.max(0, Math.floor(pageRaw)) : 0
    }

    if (params.size !== undefined && params.size !== null) {
        const sizeRaw = Number(params.size)
        const size = Number.isFinite(sizeRaw) ? Math.floor(sizeRaw) : 1
        normalized.size = Math.min(FAVORITES_API_MAX_PAGE_SIZE, Math.max(1, size))
    }

    const sort = normalizeFavoritesSort(params.sort)
    if (sort) normalized.sort = sort

    return Object.keys(normalized).length > 0 ? normalized : undefined
}

/**
 * serializeFavoritesQuery
 *
 * 역할:
 * - React Query의 queryKey에 사용하기 위해 params를 결정적인 문자열로 직렬화
 *
 * 왜 필요한가?
 * - queryKey에 객체를 그대로 넣으면, 키 순서/타입 차이로 의미상 동일한 요청이 다른 캐시 키로 분기 가능
 * - 정규화 + 키 정렬 + URLSearchParams 직렬화로 안정적인 캐시 키 일치 보장
 *
 * 복잡도:
 * - 파라미터 수 k라면 O(k log k) (정렬 비용)
 * - 실제 k는 매우 적어 의미있는 성능 이슈는 없음
 */
function serializeFavoritesQuery(params?: FavoritesQuery): string {
    const normalized = normalizeFavoritesQuery(params)
    if (!normalized) return ""

    const entries: Array<[string, string]> = Object.entries(normalized)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)] as [string, string])
        .sort(([a], [b]) => a.localeCompare(b))

    return new URLSearchParams(entries).toString()
}

/**
 * encodeAttractionIdForPath
 *
 * 역할:
 * - attractionId(keyId)를 URL path segment에 안전하게 넣기 위해 인코딩
 *
 * 이유:
 * - 식별자에 슬래시/특수문자/한글이 포함될 가능성을 대비한 인코딩 처리
 * - path segment에 사용될 식별자는 encodeURIComponent로 표준화하는 것이 안전
 *
 * 주의:
 * - 이 함수는 URL 경로 처리이며, 식별자의 실제 유효성 검증은 별도로 수행
 */
function encodeAttractionIdForPath(attractionId: string): string {
    return encodeURIComponent(attractionId)
}

/* -------------------------------------------------------------------------- */
/* Cache Introspection Helpers                                                */
/* -------------------------------------------------------------------------- */

/**
 * isFavoriteIdsKey
 *
 * 역할:
 * - favorites 관련 캐시 중 ids 스캔 캐시(["favorites", "ids"]) 식별
 *
 * 사용처:
 * - ["favorites"] prefix로 캐시를 조회할 때 ids 캐시만 제외하고 목록 페이지 캐시만 대상으로 하기 위한 헬퍼
 */
function isFavoriteIdsKey(key: QueryKey): boolean {
    return key.length >= 2 && key[0] === "favorites" && key[1] === "ids"
}

/**
 * isAttractionPageResp
 *
 * 역할:
 * - QueryClient에서 읽어온 unknown 데이터가 PageResp<AttractionCard> 형태의 최소 shape인지 검사
 *
 * 이유:
 * - QueryClient에는 다양한 타입의 캐시 데이터가 혼재 가능
 * - optimistic patch 적용을 위해 최소한의 타입 형태 확인 필요
 *
 * 검사 항목:
 * - content 배열 존재 여부
 * - totalElements / totalPages 숫자 여부
 *
 * 주의:
 * - 완전한 타입 검증이 아니라, 내부 로직에서 필요한 필드 중심의 최소 검사
 */
function isAttractionPageResp(data: unknown): data is PageResp<AttractionCard> {
    if (!data || typeof data !== "object") return false

    const content = (data as { content?: unknown }).content
    const totalElements = (data as { totalElements?: unknown }).totalElements
    const totalPages = (data as { totalPages?: unknown }).totalPages

    return (
        Array.isArray(content) &&
        typeof totalElements === "number" &&
        Number.isFinite(totalElements) &&
        typeof totalPages === "number" &&
        Number.isFinite(totalPages)
    )
}

/**
 * readFavoritePageSnapshots
 *
 * 역할:
 * - QueryClient 캐시에서 ["favorites", ...] prefix의 데이터를 스냅숏으로 읽고,
 *   ids 캐시를 제외한 뒤 PageResp<AttractionCard> 형태만 필터링하여 반환
 *
 * 사용처:
 * - exists 확인 최적화(네트워크 없이 캐시에서만 true 여부 확인)
 * - remove optimistic update(캐시된 목록 페이지에서 항목 제거 패치)
 */
function readFavoritePageSnapshots(qc: QueryClient): FavoritePageSnapshots {
    const snapshots = qc.getQueriesData<unknown>({ queryKey: ["favorites"] })

    return snapshots
        .filter(([key, data]) => !isFavoriteIdsKey(key) && isAttractionPageResp(data))
        .map(([key, data]) => [key, data] as [QueryKey, PageResp<AttractionCard>])
}

/**
 * patchRemovedFavoriteFromPage
 *
 * 역할:
 * - 특정 favorites 페이지 캐시에서 attractionId 항목을 제거한 새 페이지 반환
 *
 * 변경:
 * - content 배열에서 해당 keyId 제거
 * - totalElements를 1 감소(최소 0)
 * - totalPages를 page.size 기준으로 재계산(페이지 수 집계의 UX 일관성 유지)
 *
 * 반환 정책:
 * - 해당 항목이 없으면 기존 page를 그대로 반환(불필요한 캐시 업데이트 회피)
 *
 * 주의:
 * - 이 패치는 목록 순서/필터링/정렬에 대한 완전한 재구성 x
 * - 이 패치는 UI 즉각 반응을 위한 것이며, 최종 일관성은 invalidate/refetch로 보장
 */
function patchRemovedFavoriteFromPage(page: PageResp<AttractionCard>, attractionId: string): PageResp<AttractionCard> {
    const nextContent = page.content.filter((item) => item.keyId !== attractionId)
    if (nextContent.length === page.content.length) return page

    const nextTotalElements = Math.max(0, page.totalElements - 1)
    const nextTotalPages = page.size > 0
        ? Math.ceil(nextTotalElements / page.size)
        : page.totalPages

    return {
        ...page,
        content: nextContent,
        totalElements: nextTotalElements,
        totalPages: nextTotalPages,
    }
}

/**
 * hasFavoriteInLoadedPages
 *
 * 역할:
 * - 이미 로드된 favorites 목록 캐시에서 attractionId가 있는지 여부를 확인
 *
 * 포인트:
 * - true이면 캐시에서 해당 항목을 찾은 것이므로 네트워크 요청 없이 결과 즉시 반환 가능
 *
 * 복잡도:
 * - 로드된 favorites 페이지 수가 n이라면 최대 O(n)
 */
function hasFavoriteInLoadedPages(snapshots: FavoritePageSnapshots, attractionId: string): boolean {
    return snapshots.some(([, page]) => page.content.some((item) => item.keyId === attractionId))
}

/* -------------------------------------------------------------------------- */
/* Query Key SSOT                                                             */
/* -------------------------------------------------------------------------- */

/**
 * favoritesQueryKey / favoriteExistsQueryKey / favoriteIdsQueryKey
 *
 * 역할:
 * - favorites 도메인의 React Query queryKey 생성 규칙을 한 파일로 표준화
 *
 * 정책:
 * - 동일 의미 요청에 같은 queryKey가 배정되어야 캐시 공유/일관성이 보장
 * - 목록 캐시는 serializeFavoritesQuery 기반으로 파라미터/순서에 무관한 키를 분리
 * - exists 캐시는 attractionId 단위로 분리
 * - ids 캐시는 fallback 스캔 결과를 위한 캐시로 하나만 존재
 *
 * 포인트:
 * - ["favorites"] prefix invalidation으로 목록 캐시와 ids 캐시를 함께 stale 처리 가능
 */
function favoritesQueryKey(params?: FavoritesQuery): QueryKey {
    return ["favorites", serializeFavoritesQuery(params)]
}

function favoriteExistsQueryKey(attractionId: string): QueryKey {
    return ["favorite-exists", attractionId]
}

function favoriteIdsQueryKey(): QueryKey {
    return ["favorites", "ids"]
}

/* -------------------------------------------------------------------------- */
/* API Calls                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * fetchFavorites
 *
 * 역할:
 * - 서버에서 favorites 목록 페이지를 조회
 *
 * 정책:
 * - GET /favorites
 * - 정규화된 query params(page/size/sort) 포함
 * - AbortSignal 지원으로 화면 전환/요청 취소 처리
 */
async function fetchFavorites(
    params?: FavoritesQuery,
    signal?: AbortSignal
): Promise<PageResp<AttractionCard>> {
    const normalizedParams = normalizeFavoritesQuery(params)
    const response = await api.get<PageResp<AttractionCard>>("/favorites", { params: normalizedParams, signal })

    return response.data
}

/**
 * fetchFavoriteExists
 *
 * 역할:
 * - 서버의 단건 exists 엔드포인트로 즐겨찾기 여부를 조회
 *
 * 정책:
 * - GET /favorites/{id}/exists -> { exists: boolean }
 *
 * 포인트:
 * - ids 전체 스캔보다 훨씬 가볍고, 단건 exists가 기본 전략으로 활용
 */
async function fetchFavoriteExists(
    attractionId: string,
    signal?: AbortSignal,
): Promise<boolean> {
    const encodedAttractionId = encodeAttractionIdForPath(attractionId)
    const response = await api.get<FavoriteExistsResponse>(`/favorites/${encodedAttractionId}/exists`, { signal })

    return response.data.exists === true
}

/**
 * addFavorite / removeFavorite
 *
 * 역할:
 * - 즐겨찾기 추가/제거를 서버에 반영하는 Command API.
 *
 * 특성:
 * - 인증/권한이 필요한 요청
 * - 401/403/409/5xx 등 다양한 에러 케이스 발생 가능하므로,
 *   호출 측에서 optimistic update 롤백 및 재동기화 흐름을 함께 처리
 */
async function addFavorite(attractionId: string): Promise<void> {
    const encodedAttractionId = encodeAttractionIdForPath(attractionId)
    await api.post<void>(`/favorites/${encodedAttractionId}`)
}

async function removeFavorite(attractionId: string): Promise<void> {
    const encodedAttractionId = encodeAttractionIdForPath(attractionId)
    await api.delete<void>(`/favorites/${encodedAttractionId}`)
}

/* -------------------------------------------------------------------------- */
/* Query Hooks                                                                */
/* -------------------------------------------------------------------------- */

/**
 * useFavorites
 *
 * 역할:
 * - favorites 목록 페이지를 조회하는 React Query 훅.
 *
 * 캐시 정책:
 * - staleTime / gcTime은 favorites 데이터의 변경 빈도(사용자 액션 기반)를 고려하여 설정
 * - refetchOnWindowFocus=false:
 *   - 탭 포커스만으로 불필요한 재요청이 발생하지 않도록 방지
 *
 * 포인트:
 * - params가 들어오면 normalizeFavoritesQuery로 정규화하여 queryKey/요청 파라미터 일관성 유지
 */
export function useFavorites(params?: FavoritesQuery, enabled: boolean = true) {
    const normalizedParams = normalizeFavoritesQuery(params)

    return useQuery<PageResp<AttractionCard>, AxiosError>({
        queryKey: favoritesQueryKey(normalizedParams),
        queryFn: ({ signal }) => fetchFavorites(normalizedParams, signal),
        enabled,
        staleTime: FAVORITES_STALE_TIME,
        gcTime: FAVORITES_GC_TIME,
        refetchOnWindowFocus: false,
    })
}

/* -------------------------------------------------------------------------- */
/* Fallback: Scan All Favorite IDs                                            */
/* -------------------------------------------------------------------------- */

/**
 * fetchAllFavoriteIds
 *
 * 역할:
 * - ids 전용 API가 없을 때 페이지네이션 전체 조회로 즐겨찾기 keyId를 수집하는 fallback 전략
 * - /favorites 페이지네이션으로 조회하며 모든 keyId를 반환
 *
 * 종료 조건:
 * - totalPages 메타가 유효하면: 서버 메타 기준으로 마지막 페이지 감지 시 종료
 * - totalPages가 없거나 잘못된 경우: short page(content.length < SCAN_PAGE_SIZE)로 종료 감지
 * - 안전장치: MAX_PAGES 이상이면 네트워크 비용 제어를 위해 종료
 *
 * 서버 호환 정책:
 * - MAX_PAGES까지 조회해도 목록 끝에 도달하지 못하면 서버 메타/무한 데이터 위험성이 있으므로 예외 throw
 *
 * 정렬 호환 정책:
 * - sort 지원 여부가 불확실한 경우를 대비하여 후보를 순서대로 시도
 * - 400/422(주로 sort 형식 문제)에 한해 다음 후보로 재시도
 * - 그 외 에러는 즉시 throw
 *
 * 주의:
 * - 페이지네이션 스캔은 데이터 규모가 클수록 비용이 크므로, 가능하다면 단건 exists API를 우선 사용
 * - 이 함수는 fallback 용도로 최선(best effort) 전략
 */
async function fetchAllFavoriteIds(signal?: AbortSignal): Promise<string[]> {
    /**
     * selectedScanSort
     * - 스캔 전체 기간에 사용할 sort 후보를 첫 1회 요청으로 확정
     *
     * 상태 의미:
     * - null: 아직 후보 탐색이 시작되지 않은 초기 상태
     * - undefined: 정렬 파라미터 없이 서버 기본 정렬에 위임
     * - string: 선택된 sort 문자열
     */
    let selectedScanSort: FavoritesSort | undefined | null = null

    const idSet = new Set<string>()
    let page = 0
    let reachedEnd = false

    while (page < FAVORITES_SCAN_MAX_PAGES) {
        let scanPage: FavoriteScanPage

        // 정렬 후보 확정 이후에는 동일한 정렬 규칙으로 계속 페이지를 조회
        if (selectedScanSort !== null) {
            const params = selectedScanSort
                ? { page, size: FAVORITES_SCAN_PAGE_SIZE, sort: selectedScanSort }
                : { page, size: FAVORITES_SCAN_PAGE_SIZE }

            const { data } = await api.get<PageResp<AttractionCard>>("/favorites", { params, signal })

            scanPage = { data, selectedSort: selectedScanSort }
        } else {
            // 첫 1회에 성공하는 sort 후보를 탐색하고, 선택된 후보로 이후 스캔을 수행
            let lastError: unknown = null
            let resolved: FavoriteScanPage | null = null

            for (const candidateSort of FAVORITES_SCAN_SORT_CANDIDATES) {
                const params = candidateSort
                    ? { page, size: FAVORITES_SCAN_PAGE_SIZE, sort: candidateSort }
                    : { page, size: FAVORITES_SCAN_PAGE_SIZE }

                try {
                    const { data } = await api.get<PageResp<AttractionCard>>("/favorites", { params, signal })
                    resolved = { data, selectedSort: candidateSort }
                    break
                } catch (error: unknown) {
                    lastError = error

                    const status = isAxiosError(error) ? error.response?.status : undefined
                    const isSortCompatibilityError = status === 400 || status === 422
                    if (!isSortCompatibilityError) {
                        throw error
                    }
                }
            }

            if (!resolved) {
                throw lastError ?? new Error("FAVORITES_SCAN_SORT_INCOMPATIBLE")
            }

            scanPage = resolved
            selectedScanSort = resolved.selectedSort
        }

        const { data } = scanPage

        for (const item of data.content) {
            if (item.keyId) idSet.add(item.keyId)
        }

        // totalPages 메타가 유효하면 메타 기준으로 종료를 감지하고, 아니면 short page로 종료 여부 판단
        const totalPagesRaw = Number(data.totalPages)
        const totalPages = Number.isFinite(totalPagesRaw) ? Math.max(0, Math.floor(totalPagesRaw)) : 0
        const hasValidTotalPages = totalPages > 0
        const reachedLastByMeta = hasValidTotalPages ? page + 1 >= totalPages : false
        const reachedLastByShortPage =
            !hasValidTotalPages && data.content.length < FAVORITES_SCAN_PAGE_SIZE

        if (data.content.length === 0 || reachedLastByMeta || reachedLastByShortPage) {
            reachedEnd = true
            break
        }

        page += 1
    }

    if (!reachedEnd) {
        throw new Error("FAVORITES_SCAN_LIMIT_REACHED")
    }

    return Array.from(idSet)
}

/**
 * ensureFavoriteIdsCache
 *
 * 역할:
 * - favorites ids fallback 스캔 캐시(["favorites", "ids"])를 보장
 *
 * 동작:
 * - 캐시가 유효하면 캐시 결과를 즉시 반환
 * - stale 상태이면 fetchAllFavoriteIds로 재스캔하여 캐시 갱신
 *
 * 포인트:
 * - 스캔 결과를 캐시해 두면 exists 확인 시 매번 전체 스캔이 반복되는 상황 회피 가능
 */
function ensureFavoriteIdsCache(qc: QueryClient): Promise<string[]> {
    return qc.ensureQueryData<string[], AxiosError>({
        queryKey: favoriteIdsQueryKey(),
        queryFn: ({ signal }) => fetchAllFavoriteIds(signal),
        staleTime: FAVORITE_IDS_STALE_TIME,
        gcTime: FAVORITE_IDS_GC_TIME
    })
}

/**
 * useFavoriteExists
 *
 * 역할:
 * - 특정 attractionId의 즐겨찾기 여부를 boolean으로 반환하는 React Query 훅
 *
 * 조회 전략(비용 우선순위):
 * 1) 이미 로드된 favorites 목록 캐시에서 해당 항목이 있으면 true 즉시 반환 (네트워크 0)
 * 2) 서버 단건 exists API 호출 (네트워크 1)
 * 3) 엔드포인트가 없음(404/405 등)에 해당하면 ids 스캔 fallback 진행 (네트워크 N)
 *
 * 에러 처리 정책:
 * - exists API가 없다고 판단할 수 있는 코드(404/405)이면 스캔으로 진행
 * - 그 외 에러(인증/서버 오류/네트워크 오류)는 상위로 전파
 *
 * Abort/취소 정책:
 * - QueryFn에 AbortSignal을 전달
 * - fallback 스캔/ensureQueryData 이후에도 signal.aborted를 확인하여 취소 시 abort 처리
 */
export function useFavoriteExists(attractionId: string, enabled: boolean = true) {
    const qc = useQueryClient()

    return useQuery<boolean, AxiosError>({
        queryKey: favoriteExistsQueryKey(attractionId),
        queryFn: async ({ signal }) => {
            const loadedPages = readFavoritePageSnapshots(qc)
            if (hasFavoriteInLoadedPages(loadedPages, attractionId)) return true

            try {
                return await fetchFavoriteExists(attractionId, signal)
            } catch (error: unknown) {
                // exists 엔드포인트가 없는 환경이면 ids 스캔으로 진행
                const shouldFallbackToScan =
                    isAxiosError(error) &&
                    (error.response?.status === 404 || error.response?.status === 405)

                if (!shouldFallbackToScan) {
                    throw error
                }
            }

            const favoriteIds = await ensureFavoriteIdsCache(qc)

            if (signal.aborted) {
                throw new DOMException("Aborted", "AbortError")
            }

            return favoriteIds.includes(attractionId)
        },
        enabled: enabled && Boolean(attractionId),
        staleTime: FAVORITES_STALE_TIME,
        gcTime: FAVORITES_GC_TIME,
        refetchOnWindowFocus: false
    })
}

/* -------------------------------------------------------------------------- */
/* Mutation: Toggle Favorite                                                  */
/* -------------------------------------------------------------------------- */

/**
 * FavoriteToggleContext
 *
 * 역할:
 * - optimistic update 실패 시, 상태를 복원하기 위한 롤백 스냅숏
 *
 * 필드:
 * - prevFavoritePages: favorites 목록 페이지 캐시 스냅숏 (각 queryKey 기준)
 * - prevExists: favorite-exists 캐시 이전 값 (캐시가 없으면 undefined)
 * - prevIds: favorites ids 캐시 이전 값(스캔 캐시가 없으면 undefined)
 */
type FavoriteToggleContext = {
    prevFavoritePages: FavoritePageSnapshots
    prevExists?: boolean
    prevIds?: string[]
}

/**
 * FavoriteToggleVariables
 *
 * 역할:
 * - 토글 mutation 입력값
 * - nextFavorite=true이면 추가, false이면 제거를 의미
 */
type FavoriteToggleVariables = {
    nextFavorite: boolean
}

/**
 * useFavoriteToggle
 *
 * 역할:
 * - 즐겨찾기 토글(add/remove)을 처리하는 Mutation 훅
 *
 * optimistic update 정책:
 * - 클릭 즉시 UI 응답성을 위해 서버 응답을 기다리지 않고 로컬 캐시를 먼저 반영
 * - 실패 시 onError에서 이전 상태로 롤백
 * - 성공/실패에 무관하게 onSettled에서 invalidate로 서버 상태와 동기화
 *
 * 캐시 업데이트 포인트:
 * - remove:
 *   - 이미 로드된 favorites 페이지 캐시에서 해당 항목을 제거하여 즉시 UI 반영
 * - add:
 *   - 추가 시 목록에 새 항목을 삽입하면 정렬/필터/페이지 위치가 불명확하므로,
 *     exists/ids 중심으로만 반영하고 목록은 invalidate 후 서버에서 최신 목록을 가져옴
 */
export function useFavoriteToggle(attractionId: string) {
    const qc = useQueryClient()

    return useMutation<void, AxiosError, FavoriteToggleVariables, FavoriteToggleContext>({
        mutationKey: ["favorite-toggle", attractionId],
        mutationFn: async ({ nextFavorite }) => {
            if (nextFavorite) {
                await addFavorite(attractionId)
                return
            }
            await removeFavorite(attractionId)
        },

        onMutate: async ({ nextFavorite }) => {
            const existsKey = favoriteExistsQueryKey(attractionId)
            const idsKey = favoriteIdsQueryKey()

            /**
             * 레이스(경합) 방지:
             * - 진행 중 query를 먼저 cancel하여,
             *   optimistic update 이후 완료된 이전 응답이 캐시를 덮어쓰는 상황 방지
             *
             * 주의:
             * - cancelQueries는 캐시 업데이트 레이스만 방지하는 것이며,
             *   실제 네트워크 취소는 transport/adapter(axios + signal) 지원 상태에 따라 다름
             */
            await Promise.all([
                qc.cancelQueries({ queryKey: ["favorites"] }),
                qc.cancelQueries({ queryKey: existsKey, exact: true }),
                qc.cancelQueries({ queryKey: idsKey, exact: true })
            ])

            const prevFavoritePages = readFavoritePageSnapshots(qc)

            /**
             * remove optimistic patch:
             * - 이미 로드된 favorites 페이지 캐시에서 항목 제거
             * - 목록의 완전한 재구성은 이후 invalidate로 서버에서 수행
             */
            if (!nextFavorite) {
                for (const [key, page] of prevFavoritePages) {
                    const next = patchRemovedFavoriteFromPage(page, attractionId)
                    if (next !== page) {
                        qc.setQueryData<PageResp<AttractionCard>>(key, next)
                    }
                }
            }

            /**
             * exists 캐시 즉시 반영:
             * - 버튼/아이콘 상태에서 단계 없이 UI 클릭 즉시 상태 변경
             */
            const prevExists = qc.getQueryData<boolean>(existsKey)
            qc.setQueryData<boolean>(existsKey, nextFavorite)

            /**
             * ids 캐시 패치:
             * - ids 캐시가 이미 존재하는 경우에만 반영
             * - ids 캐시가 없을 때는 여기서 새로 만들지 않고, 필요 시 조회 측에서 확인 후 생성
             */
            const prevIds = qc.getQueryData<string[]>(idsKey)
            if (prevIds !== undefined) {
                const nextIds = nextFavorite
                    ? (prevIds.includes(attractionId) ? prevIds : [...prevIds, attractionId])
                    : prevIds.filter((id) => id !== attractionId)

                qc.setQueryData<string[]>(idsKey, nextIds)
            }

            return { prevFavoritePages, prevExists, prevIds }
        },

        onError: (_err, _vars, ctx) => {
            const existsKey = favoriteExistsQueryKey(attractionId)
            const idsKey = favoriteIdsQueryKey()

            /**
             * 롤백 정책:
             * - favorites 페이지 캐시는 스냅숏으로 원상 복구
             * - exists / ids 캐시는 이전 값이 있으면 복구하고,
             *   이전 값이 없었으면 캐시를 제거해 다음 조회에서 서버로부터 새로 수신
             */
            if (ctx?.prevFavoritePages) {
                for (const [key, page] of ctx.prevFavoritePages) {
                    qc.setQueryData<PageResp<AttractionCard>>(key, page)
                }
            }

            if (ctx?.prevExists !== undefined) {
                qc.setQueryData<boolean>(existsKey, ctx.prevExists)
            } else {
                qc.removeQueries({ queryKey: existsKey, exact: true })
            }

            if (ctx?.prevIds !== undefined) {
                qc.setQueryData<string[]>(idsKey, ctx.prevIds)
            } else {
                qc.removeQueries({ queryKey: idsKey, exact: true })
            }
        },

        onSettled: () => {
            const existsKey = favoriteExistsQueryKey(attractionId)

            /**
             * 최종 일관성 보장 정책:
             * - 서버가 source of truth이므로 invalidate로 재검증/재조회
             *
             * 포인트:
             * - ["favorites"] prefix invalidation으로 ["favorites","ids"] 캐시도 포함
             *   → ids 스캔 캐시도 stale 처리되어 필요 시 최신 상태로 갱신 가능
             */
            qc.invalidateQueries({ queryKey: ["favorites"] })
            qc.invalidateQueries({ queryKey: existsKey, exact: true })
        }
    })
}