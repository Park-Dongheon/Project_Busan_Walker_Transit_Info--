// src/domains/map/model/attractions/useAttractionPins.ts

/**
 * useAttractionPins.ts (관광지 - 지도 핀 조회 및 백그라운드 보강 쿼리 훅)
 *
 * 역할/목적:
 * - 현재 지도 영역(bbox)과 검색어(keyword)를 기준으로 관광지 핀 목록을 조회
 * - 지도 렌더링에 필요한 최소 모델(AttractionPin[])만 만들어 React Query 캐시에 보관
 * - 초기 응답은 빠르게 보여 주고, 필요하면 더 많은 핀을 백그라운드에서 보강하는 전략을 제공
 *
 * 데이터 흐름:
 *   bboxParam + keyword
 *      ↓  fetchAttractionCardsByPages()
 *   AttractionListCard[] (페이지 반복 수집, 중복 제거)
 *      ↓  toPins()
 *   AttractionPin[] → React Query 캐시
 *      ↓  (isTruncated && backgroundMaxItems > maxItems)
 *   enhancePinsInBackground() → 캐시 상향 업데이트
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useAttractionPins       - 지도 핀 목록 조회 훅
 *      · mapPinsQueryKey         - queryKey 생성 함수
 *      · AttractionPinsQueryData - 조회 결과 타입
 * - 지도 마커는 DOM보다 훨씬 무거운 외부 렌더링 자원이므로,
 *   "많이 받는 것"보다 "빠르게 안전한 범위만 먼저 받는 것"을 우선
 * - bboxParam이 비어 있으면 조회하지 않음
 * - keyword의 undefined / 빈 문자열은 같은 의미로 취급하여 캐시 분열을 줄임
 *
 * 동작 방식:
 * - fetchAttractionCardsByPages: 페이지 기반 API를 반복 호출해 카드 데이터를 누적 수집
 * - toPins: 카드 DTO를 지도 핀 최소 모델로 축약
 * - enhancePinsInBackground: 초기 상한보다 더 큰 상한으로 백그라운드 보강을 수행
 * - useAttractionPins: React Query를 통해 조회, 캐시, placeholder, 보강 시작 조건을 연결
 *
 * 운영 포인트:
 * - maxItems, backgroundMaxItems, pageSize 값은 프론트 마커 렌더 성능, API 호출량,
 *   네트워크 페이로드에 동시에 영향
 * - 백엔드 페이지 크기 상한이 바뀌면 normalizePageSize와 기본 정책값을 함께 점검
 * - 목록 API의 응답 메타 계약(totalPages/totalElements)이 바뀌면 종료 조건과 잘림 판단 로직을 같이 확인
 * - isTruncated가 true면 지도에는 일부 마커만 표시된 상태일 수 있음
 */

import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api as attractionApi } from "@/domains/attraction";
import { isValidLatitude, isValidLongitude } from "../../lib/geo";
import type { AttractionPin } from "../../types";
import { MAP_PINS_GC_TIME, MAP_PINS_STALE_TIME } from "../cachePolicy";

type AttractionListResponse = Awaited<ReturnType<typeof attractionApi.listAttractions>>;
type AttractionListCard = NonNullable<AttractionListResponse["content"]>[number];

/**
 * 지도 핀 조회 기본 페이지 크기
 *
 * - 프론트 기본값은 백엔드가 허용하는 최대 페이지 크기를 넘지 않도록 clamp
 */
const MAP_PINS_DEFAULT_PAGE_SIZE = Math.min(100, attractionApi.ATTRACTIONS_API_MAX_PAGE_SIZE)

/**
 * 초기 핀 표시 단계에서 수집할 기본 최대 개수
 *
 * - 초기 렌더 응답성과 지도 마커 밀도를 함께 고려한 값
 */
const MAP_PINS_DEFAULT_MAX_ITEMS = 300

/**
 * 백그라운드 보강 시 목표로 하는 기본 최대 개수
 *
 * - 초기 응답은 가볍게 유지하되, 필요 시 더 풍부한 핀 집합으로 업그레이드하기 위한 상한
 */
const MAP_PINS_DEFAULT_BACKGROUND_MAX_ITEMS = 1000

/**
 * 어떤 입력이 들어오더라도 넘지 않는 절대 상한
 *
 * - 과도한 페이로드, 마커 폭증, 요청 수 증가를 강제로 제한하는 최후 방어선
 */
const MAP_PINS_HARD_MAX_ITEMS = 5000

/**
 * 동일 조건에 대한 백그라운드 보강 태스크 중복 실행을 막기 위한 저장소
 *
 * - queryKey 기반 taskKey를 사용하여 single-flight처럼 동작
 */
const MAP_PINS_BG_ENHANCEMENT_TASKS = new Map<string, Promise<void>>()

/**
 * 양의 정수 정책값을 안전하게 정규화
 *
 * - size, maxItems처럼 외부에서 들어오는 숫자 옵션이 NaN, Infinity, 0, 음수여도
 *   안전한 기본값으로 복구하기 위한 함수
 * - 1 이상의 정수면 내림(floor) 후 반환, 그 외 값은 fallback을 반환
 */
function normalizePositiveInt(value: number | undefined, fallback: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback

    const floored = Math.floor(parsed)

    return floored > 0 ? floored : fallback
}

/**
 * 페이지 크기를 백엔드 허용 범위 안으로 정규화
 *
 * - 프론트가 임의의 큰 size를 요청하더라도 서버 상한을 넘지 못하게 함
 */
function normalizePageSize(size?: number): number {
    return Math.min(attractionApi.ATTRACTIONS_API_MAX_PAGE_SIZE, normalizePositiveInt(size, MAP_PINS_DEFAULT_PAGE_SIZE))
}

/**
 * 최대 수집 개수를 절대 상한 안으로 정규화
 *
 * - fallback을 기본값으로 사용하되, 어떤 입력도 HARD MAX를 넘지 못하게 함
 */
function normalizeMaxItems(maxItems?: number, fallback: number = MAP_PINS_DEFAULT_MAX_ITEMS): number {
    return Math.min(MAP_PINS_HARD_MAX_ITEMS, normalizePositiveInt(maxItems, fallback))
}

/**
 * 응답 메타를 "0 이상 정수"로만 해석
 *
 * - totalElements, totalPages처럼 종료 조건에 쓰이는 메타가 비정상이더라도
 *   이후 로직이 안전하게 fallback 동작하도록 만드는 보조 함수
 * - 0 이상 유효한 정수면 반환, 그렇지 않으면 null을 반환
 */
function toNonNegativeInt(value: unknown): number | null {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null

    const floored = Math.floor(parsed)

    return floored >= 0 ? floored : null
}

/**
 * 목록 카드 DTO를 지도 핀 최소 모델로 축약
 *
 * - 지도 마커 렌더링에는 id, 이름, 좌표만 필요하므로, 무거운 상세 필드를 제거하고 필요한 값만 남김
 * - keyId / placeName / latitude / longitude를 AttractionPin으로 매핑
 * - 좌표가 유효하지 않은 항목은 마지막 단계에서 제거
 */
function toPins(cards: AttractionListCard[]): AttractionPin[] {
    return cards
        .map((card) => ({
            id: card.keyId,
            name: card.placeName || "이름 없음",
            lat: card.latitude,
            lng: card.longitude
        }))
        .filter(
            (pin) =>
                Number.isFinite(pin.lat) &&
                Number.isFinite(pin.lng) &&
                isValidLatitude(pin.lat) &&
                isValidLongitude(pin.lng)
        )
}

type FetchAttractionCardsResult = {
    cards: AttractionListCard[]
    totalElements: number | null
    isTruncated: boolean
}

/**
 * 페이지 기반 관광지 목록 API를 반복 호출해 카드 데이터를 수집
 *
 * - bbox, keyword, pageSize를 기준으로 page를 증가시키며 listAttractions를 반복 호출
 * - keyId 기준으로 중복 항목을 제거하면서 collected에 누적
 * - maxItems에 도달하면 즉시 종료해 요청량과 페이로드를 제한
 * - totalPages/totalElements 메타가 유효하면 종료 판단에 활용
 * - 메타가 비정상이더라도 maxPageRequests와 content 길이 조건으로 안전하게 종료
 * - React Query가 전달한 AbortSignal이 중간에 취소되면 즉시 AbortError를 발생시켜 작업 중단
 * - cards: 중복 제거 후 수집된 카드 목록
 * - totalElements: 신뢰 가능한 경우에만 전체 개수
 * - isTruncated: 상한 도달로 인해 결과가 잘렸을 가능성 여부
 */
async function fetchAttractionCardsByPages(args: {
    bboxParam: string
    keyword?: string
    pageSize: number
    maxItems: number
    signal?: AbortSignal
}): Promise<FetchAttractionCardsResult> {
    const { bboxParam, keyword, pageSize, maxItems, signal } = args

    const collected: AttractionListCard[] = []
    const keyIdSet = new Set<string>()

    /**
     * 필요 페이지 수를 대략 계산한 뒤 여유 버퍼를 더한 안전 상한
     *
     * - totalPages 메타가 깨졌거나, 중복 제거 때문에 실수집량이 줄어드는 상황에서도
     *   무한 루프 없이 보수적으로 종료하기 위한 장치
     */
    const maxPageRequests = Math.max(10, Math.ceil(maxItems / pageSize) + 2)

    let requestCount = 0
    let page = 0
    let totalElements: number | null = null
    let reachedFetchLimit = false

    while (collected.length < maxItems && requestCount < maxPageRequests) {
        /* 화면 전환, bbox 변경 등으로 취소되면 추가 요청과 연산을 즉시 중단 */
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError")
        }

        const response = await attractionApi.listAttractions({bbox: bboxParam, keyword, page, size: pageSize}, signal)

        requestCount += 1

        /**
         * totalElements는 "전체 규모 판단"에 쓰이므로 과소 추정을 피하는 방향으로 해석
         *
         * - 응답 메타가 일시적으로 흔들리는 경우를 감안해, 관측된 값 중 최대치를 유지
         */
        const responseTotalElements = toNonNegativeInt(response.totalElements)
        if (responseTotalElements !== null) {
            totalElements = totalElements === null
                ? responseTotalElements
                : Math.max(totalElements, responseTotalElements)
        }

        const content = response.content ?? []
        if (content.length === 0) break

        /**
         * 현재 페이지 수집 단계
         *
         * - keyId 기준으로 중복을 제거하면서 누적
         * - maxItems에 도달하면 이후 페이지 탐색보다 상한 보호를 우선
         */
        const beforeLength = collected.length

        for (const item of content) {
            if (!item.keyId || keyIdSet.has(item.keyId)) continue

            keyIdSet.add(item.keyId)
            collected.push(item)

            if (collected.length >= maxItems) {
                reachedFetchLimit = true
                break
            }
        }
        if (reachedFetchLimit) break

        /**
         * 이번 페이지에서 신규 수집이 없더라도 즉시 종료하지 않음
         *
         * - 정렬 특성이나 데이터 중복 때문에 특정 페이지가 전부 기존 데이터일 수 있음
         * - totalPages가 남아 있다면 뒤 페이지에 신규 데이터가 존재 가능
         */
        const appendedCount = collected.length - beforeLength
        if (appendedCount === 0) {
            const totalPages = toNonNegativeInt(response.totalPages)
            if (totalPages !== null && page + 1 >= totalPages) break

            page += 1
            continue
        }

        /**
         * 종료 조건:
         *
         * - totalPages를 신뢰할 수 있으면 마지막 페이지 도달 시 종료
         * - totalPages를 신뢰할 수 없으면 content 길이가 pageSize보다 작아지는 지점을 사실상 마지막 페이지로 간주
         */
        const totalPages = toNonNegativeInt(response.totalPages)
        if (totalPages !== null && page + 1 >= totalPages) break
        if (totalPages === null && content.length < pageSize) break

        page += 1
    }

    /**
     * 상한 도달로 인해 일부 결과만 수집했는지 판단
     *
     * - totalElements를 모르는 경우에도, "상한 때문에 멈췄다"는 사실 자체를 잘림 신호로 취급
     */
    const isTruncated = reachedFetchLimit && (totalElements === null || collected.length < totalElements)

    return {cards: collected, totalElements, isTruncated}
}


export type AttractionPinsQueryData = {
    pins: AttractionPin[]
    totalElements: number | null
    isTruncated: boolean
}

/**
 * 지도 핀 조회용 queryKey 생성 함수
 *
 * - bbox, keyword, pageSize, maxItems, backgroundMaxItems가 달라지면 서로 다른 결과 집합으로 간주
 */
export function mapPinsQueryKey(
    bboxParam: string,
    keywordParam: string,
    pageSize: number,
    maxItems: number,
    backgroundMaxItems: number
) {
    return ["map-pins", bboxParam, keywordParam, pageSize, maxItems, backgroundMaxItems] as const
}

/**
 * 백그라운드 보강 태스크 dedupe 용 문자열 키를 생성
 *
 * - Map 키 비교를 단순화하기 위한 내부 유틸
 */
function buildPinsEnhancementTaskKey(
    queryKey: ReturnType<typeof mapPinsQueryKey>
): string {
    return queryKey.join("|")
}

/**
 * 현재 캐시 상태를 기준으로 백그라운드 보강이 필요한지 판단
 *
 * - 캐시가 없으면 시작
 * - 이미 잘리지 않은 완전한 데이터라면 시작하지 않음
 * - 캐시 핀 수가 backgroundMaxItems에 도달했다면 더 확장할 필요가 없음
 */
function shouldStartBackgroundEnhancement(cached: AttractionPinsQueryData | undefined, backgroundMaxItems: number): boolean {
    if (!cached) return true
    if (!cached.isTruncated) return false
    if (cached.pins.length >= backgroundMaxItems) return false

    return true
}

/**
 * 백그라운드에서 더 큰 상한으로 핀 데이터를 보강
 *
 * - 초기 응답은 빠르게 표시하고, 이후 여유가 있을 때 더 많은 핀을 수집해 캐시 데이터를 상향 업데이트
 * - 동일 taskKey가 이미 진행 중이면 새 작업을 시작하지 않음
 * - backgroundMaxItems 상한으로 다시 수집한 뒤, 현재 캐시보다 더 좋은 결과일 때만 query cache를 교체
 * - 핀 개수가 더 많거나, 기존 totalElements는 없고 새 결과에는 있거나, 기존 결과가 truncated이고 새 결과가 아닌 경우 업그레이드
 * - 실패하더라도 초기 표시 데이터를 깨지 않도록 조용히 무시
 */
function enhancePinsInBackground(args: {
    taskKey: string
    queryKey: ReturnType<typeof mapPinsQueryKey>
    queryClient: ReturnType<typeof useQueryClient>
    bboxParam: string
    keywordParam?: string
    pageSize: number
    backgroundMaxItems: number
}): void {
    const {
        taskKey,
        queryKey,
        queryClient,
        bboxParam,
        keywordParam,
        pageSize,
        backgroundMaxItems
    } = args

    if (MAP_PINS_BG_ENHANCEMENT_TASKS.has(taskKey)) return

    const task = (async () => {
        const enhanced = await fetchAttractionCardsByPages({bboxParam,
                                                            keyword: keywordParam,
                                                            pageSize,
                                                            maxItems: backgroundMaxItems})

        const nextData: AttractionPinsQueryData = {pins: toPins(enhanced.cards),
                                                   totalElements: enhanced.totalElements,
                                                   isTruncated: enhanced.isTruncated}

        queryClient.setQueryData<AttractionPinsQueryData>(queryKey, (current) => {
            if (!current) return nextData

            const shouldUpgrade = nextData.pins.length > current.pins.length ||
                                  (current.totalElements === null && nextData.totalElements !== null) ||
                                  (current.isTruncated && !nextData.isTruncated)

            return shouldUpgrade ? nextData : current
        })
    })()
        .catch(() => {
            /* 백그라운드 보강 실패는 초기 표시를 깨지 않게 무시 */
        })
        .finally(() => {
            MAP_PINS_BG_ENHANCEMENT_TASKS.delete(taskKey)
        })

    MAP_PINS_BG_ENHANCEMENT_TASKS.set(taskKey, task)
}

/**
 * bbox와 keyword를 기준으로 지도 핀 데이터를 조회
 *
 * - 지도 화면에서 마커 렌더링에 필요한 최소 핀 데이터를 React Query로 관리
 * - 조건 변경 시 이전 데이터를 잠시 유지해 마커 깜빡임을 줄이고, 필요 시 백그라운드 보강으로 표시 품질을 높임
 * - bboxParam이 있어야만 조회를 시작
 * - size, maxItems, backgroundMaxItems를 안전한 정책값으로 정규화
 * - queryFn에서 페이지 기반 수집을 수행한 뒤 AttractionPin[]으로 변환
 * - select 단계에서 현재 캐시 상태를 보고 백그라운드 보강 시작 여부를 판단
 * - isTruncated가 true면 화면에 보이는 마커가 전체 결과의 일부일 수 있음
 */
export function useAttractionPins(args: {
    bboxParam: string
    keyword?: string
    size?: number
    maxItems?: number
    backgroundMaxItems?: number
}): UseQueryResult<AttractionPinsQueryData> {
    const queryClient = useQueryClient()
    const { bboxParam, keyword = "", size, maxItems, backgroundMaxItems } = args

    /**
     * keyword는 공백만 있는 값과 미입력을 동일하게 취급
     *
     * - 같은 의미의 요청이 서로 다른 queryKey를 만들지 않도록 정규화
     */
    const normalizedKeyword = keyword.trim()
    const keywordParam = normalizedKeyword.length > 0 ? normalizedKeyword : undefined

    const pageSize = normalizePageSize(size)
    const safeMaxItems = normalizeMaxItems(maxItems)

    /**
     * 백그라운드 보강 상한은 초기 상한보다 작지 않도록 강제
     *
     * - 초기 결과보다 더 적은 개수로 "보강"하는 비정상 구성을 방지
     */
    const safeBackgroundMaxItems = Math.max(safeMaxItems, normalizeMaxItems(backgroundMaxItems, MAP_PINS_DEFAULT_BACKGROUND_MAX_ITEMS))

    const queryKey = mapPinsQueryKey(
        bboxParam,
        keywordParam ?? "",
        pageSize,
        safeMaxItems,
        safeBackgroundMaxItems
    )
    const enhancementTaskKey = buildPinsEnhancementTaskKey(queryKey)

    return useQuery<AttractionPinsQueryData>({
        /**
         * queryKey 설계:
         * - bbox / keyword / pageSize / maxItem / backgroundMaxItems 조합이 결과 집합을 정의
         * - keyword는 undefined와 빈 문자열을 동일 의미로 정규화하여 캐시 분열을 줄임
         */
        queryKey,
        enabled: Boolean(bboxParam),
        staleTime: MAP_PINS_STALE_TIME,
        gcTime: MAP_PINS_GC_TIME,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,

        /**
         * 조건 변경 중에는 이전 결과를 잠시 유지
         *
         * - 지도 핀은 사라졌다 다시 생기는 깜빡임이 UX에 크게 드러나므로, keepPreviousData로 시각적 안정성을 우선
         */
        placeholderData: keepPreviousData,

        queryFn: async ({ signal }) => {
            const result = await fetchAttractionCardsByPages({
                bboxParam,
                keyword: keywordParam,
                pageSize,
                maxItems: safeMaxItems,
                signal
            })

            return {pins: toPins(result.cards), totalElements: result.totalElements, isTruncated: result.isTruncated}
        },

        /**
         * select 단계에서 백그라운드 보강 시작 여부를 결정
         *
         * - 반환 데이터 자체는 그대로 유지하고, 필요할 때만 별도 태스크를 띄워 캐시를 상향 업데이트
         */
        select: (data) => {
            if (safeBackgroundMaxItems <= safeMaxItems) return data

            const cached = queryClient.getQueryData<AttractionPinsQueryData>(queryKey)
            if (!shouldStartBackgroundEnhancement(cached, safeBackgroundMaxItems)) return data

            enhancePinsInBackground({taskKey: enhancementTaskKey,
                                     queryKey,
                                     queryClient,
                                     bboxParam,
                                     keywordParam,
                                     pageSize,
                                     backgroundMaxItems: safeBackgroundMaxItems})

            return data
        }
    })
}