// src/domains/attraction/ui/AttractionCarousel.tsx

/**
 * AttractionCarousel.tsx (UI Layer - 관광지 카드 캐러셀 컴포넌트)
 *
 * 역할/목적:
 * - 여러 관광지 카드를 "페이지 단위"로 묶어 슬라이드 방식으로 노출하는 캐러셀 UI
 * - 자동 재생, 수동 이전/다음, 페이지 인디케이터 dot을 함께 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionCarousel  - 관광지 카드 캐러셀 컴포넌트
 *
 * 동작 방식:
 * - items를 itemsPerPage 단위로 쪼개 pages(2차원 배열)로 구성
 * - 트랙(track)을 translateX로 이동시키는 방식으로 슬라이드
 *   (레이아웃 안정성과 구현 단순성을 동시에 확보)
 * - paused=false && pages.length>1일 때만 자동 재생 활성화
 * - 마우스 hover, 키보드 포커스 진입 시 paused=true로 자동 재생 일시 정지
 * - 포커스가 섹션 밖으로 빠질 때만 paused=false로 재개(내부 요소 간 이동 시 재개 방지)
 *
 * 운영 포인트:
 * - DEFAULT_ITEMS_PER_PAGE / MAX_ITEMS_PER_PAGE: 카드 밀도 정책 상수, 변경 시 반응형 grid 매핑도 함께 확인
 * - DEFAULT_AUTO_PLAY_MS / MIN_AUTO_PLAY_MS: 자동 재생 주기 정책, UX 기준으로 조정
 * - LG_GRID_CLASS_BY_ITEMS_PER_PAGE: itemsPerPage 범위 확장 시 lg grid 매핑 추가 필요
 */

import { type FocusEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toAttractionDetailPath } from "@/app/navigation/navigation";
import type { AttractionCard } from "@/domains/attraction";
import AttractionCardView from "./AttractionCard";

type AttractionCarouselProps = {
    /**
     * items
     * - 캐러셀에 표시할 관광지 카드 목록
     * - 외부 데이터(네트워크/캐시) 특성상 길이가 변할 수 있으므로,
     *   내부에서는 pages/pageIndex 보정 로직으로 안정적으로 처리
     */
    items: ReadonlyArray<AttractionCard>

    /**
     * itemsPerPage
     * - 한 화면(한 페이지)에 표시할 카드 개수
     * - 반응형 grid 컬럼 및 페이지 분할 계산에 사용
     */
    itemsPerPage?: number

    /**
     * autoPlayMs
     * - 자동 재생(페이지 자동 전환) 주기(ms)
     * - 너무 짧은 값은 UX를 해치므로 최솟값을 강제
     */
    autoPlayMs?: number

    /**
     * title
     * - 섹션 제목 및 aria-label에 사용되는 표시 텍스트
     */
    title?: string
}

/**
 * 기본/제약 상수
 *
 * 역할/목적:
 * - 캐러셀 동작을 구성하는 기본값과, 과도한 입력을 방지하는 상한/하한 정책을 정의
 *
 * 정책:
 * - itemsPerPage: [1, MAX_ITEMS_PER_PAGE] 범위로 정규화
 * - autoPlayMs: MIN_AUTO_PLAY_MS 이상으로 정규화
 */
const DEFAULT_ITEMS_PER_PAGE = 4
const MAX_ITEMS_PER_PAGE = 6
const DEFAULT_AUTO_PLAY_MS = 4500
const MIN_AUTO_PLAY_MS = 1000
const DEFAULT_TITLE = "추천 관광지"

/**
 * 반응형 grid column 매핑
 *
 * 역할/목적:
 * - 큰 화면(lg)에서 itemsPerPage에 맞춰 컬럼 수를 고정
 *
 * 포인트:
 * - small(sm)에서는 2열, 기본은 1열로 제한하여 작은 화면에서 가독성을 확보
 * - lg 구간에서만 itemsPerPage에 따라 확장하여 "카드 밀도"를 제어
 */
const LG_GRID_CLASS_BY_ITEMS_PER_PAGE: Record<number, string> = {
    1: "lg:grid-cols-1",
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
}

/**
 * normalizeItemsPerPage
 *
 * - itemsPerPage 입력을 안전한 정수 범위로 정규화
 * - 비정상 값(NaN/Infinity 등)은 DEFAULT_ITEMS_PER_PAGE로 대체
 * - 정수로 내림(Math.floor)
 * - 범위를 [1, MAX_ITEMS_PER_PAGE]로 clamp
 * - 페이지 분할(pages)과 grid 컬럼 결정에 직접 영향을 주므로,
 *   정규화를 통해 UI가 깨지는 것을 예방
 */
function normalizeItemsPerPage(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_ITEMS_PER_PAGE

    const normalized = Math.floor(value)
    if (normalized < 1) return 1
    if (normalized > MAX_ITEMS_PER_PAGE) return MAX_ITEMS_PER_PAGE
    return normalized
}

/**
 * normalizeAutoPlayMs
 *
 * - autoPlayMs 입력을 안전한 정수 값으로 정규화
 * - 비정상 값은 DEFAULT_AUTO_PLAY_MS로 대체
 * - 정수로 내림(Math.floor)
 * - 최솟값(MIN_AUTO_PLAY_MS) 미만이면 최솟값으로 상향
 * - 너무 짧은 interval은 시각적 피로/조작 난이도를 높이므로 하한을 둠
 */
function normalizeAutoPlayMs(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_AUTO_PLAY_MS

    const normalized = Math.floor(value)
    return normalized >= MIN_AUTO_PLAY_MS ? normalized : MIN_AUTO_PLAY_MS
}

/**
 * AttractionCarousel
 *
 * 역할/목적:
 * - 여러 관광지 카드를 "페이지 단위"로 묶어 슬라이드 방식으로 노출하는 캐러셀 UI
 *
 * 동작 정책:
 * - items를 itemsPerPage 단위로 쪼개 pages(2차원 배열)로 구성
 * - 트랙(track)을 translateX로 이동시키는 방식으로 슬라이드
 *   → 레이아웃 안정성(리플로우 최소화)과 구현 단순성을 동시에 확보
 *
 * 자동 재생 정책(auto play):
 * - paused=false && pages.length>1일 때만 자동 재생 활성화
 * - 사용자 상호작용(마우스 hover, 키보드 포커스) 중에는 paused=true로 전환해 자동 재생 일시 정지
 *
 * 접근성/키보드 UX 포인트:
 * - 섹션 자체에서 focus capture를 사용해, 내부 버튼/링크 탐색 중 자동 재생 정지
 * - blur capture 시 "포커스가 섹션 밖으로 빠질 때만" paused를 해제
 *   → 내부 요소 간 이동(버튼→링크 등)에서는 재생이 재개되지 않아 UX가 안정적
 *
 * 주의:
 * - items 길이가 변하면 pages 길이도 변하므로, 현재 pageIndex가 범위를 벗어나지 않도록 보정 필요(아래 useEffect)
 */
export function AttractionCarousel(props: AttractionCarouselProps) {
    const {
        items,
        itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
        autoPlayMs = DEFAULT_AUTO_PLAY_MS,
        title = DEFAULT_TITLE,
    } = props

    const normalizedItemsPerPage = normalizeItemsPerPage(itemsPerPage)
    const normalizedAutoPlayMs = normalizeAutoPlayMs(autoPlayMs)

    /**
     * pages
     *
     * 역할/목적:
     * - items를 "페이지 단위 배열"로 분할한 결과(AttractionCard[][])
     *
     * 포인트:
     * - items/normalizedItemsPerPage가 바뀔 때만 계산하도록 useMemo로 고정
     * - 페이지 분할은 렌더링 구조와 슬라이드 트랙 폭 계산에 직접 연결
     */
    const pages: AttractionCard[][] = useMemo(() => {
        const result: AttractionCard[][] = []

        for (let i = 0; i < items.length; i += normalizedItemsPerPage) {
            result.push(items.slice(i, i + normalizedItemsPerPage))
        }

        return result
    }, [items, normalizedItemsPerPage])

    /**
     * pageKeys
     *
     * 역할/목적:
     * - pages를 렌더링할 때 사용할 안정적인 key 집합을 구성
     *
     * 포인트:
     * - key는 React의 리스트 diff 성능과 상태 유지에 영향
     * - index만 사용하는 경우 "페이지 구성이 바뀌는 순간" 불필요한 리마운트가 발생할 수 있으므로,
     *   첫/마지막 아이템 keyId를 섞어 페이지 정체성을 강화
     *
     * 주의:
     * - 아이템 순서가 자주 바뀌는 데이터라면 key 전략은 데이터 특성에 맞게 조정 필요
     */
    const pageKeys: string[] = useMemo(() => {
        return pages.map((page, index) => {
            const first = page[0]?.keyId ?? "empty"
            const last = page[page.length - 1]?.keyId ?? "empty"
            return `${index}-${first}-${last}`
        })
    }, [pages])

    /**
     * pageIndex
     * - 현재 표시 중인 페이지 인덱스(0-based)
     *
     * paused
     * - 자동 재생을 일시 정지할지 여부(사용자 상호작용 중 true)
     */
    const [pageIndex, setPageIndex] = useState<number>(0)
    const [paused, setPaused] = useState<boolean>(false)

    /**
     * 페이지 인덱스 보정
     *
     * 역할/목적:
     * - items/pages 길이가 변하면 기존 pageIndex가 범위를 벗어날 수 있으므로, 현재 인덱스를 유효 범위로 clamp
     *
     * 동작:
     * - pages가 비면 pageIndex=0
     * - pages가 있으면 prev를 [0..pages.length-1] 범위로 보정
     */
    useEffect(() => {
        if (pages.length === 0) {
            setPageIndex(0)
            return
        }

        setPageIndex((prev) => Math.min(prev, pages.length - 1))
    }, [pages.length])

    /**
     * 자동 재생(interval)
     *
     * 정책:
     * - paused=true면 자동 재생 비활성화
     * - pages.length<=1이면 이동 의미가 없으므로 비활성화
     *
     * 동작:
     * - 일정 주기마다 pageIndex를 다음 페이지로 순환 증가(mod 연산)
     *
     * 주의:
     * - interval은 반드시 cleanup에서 clearInterval로 해제하여 언마운트/조건 변경 시 타이머 누수 방지
     */
    useEffect(() => {
        if (paused) return
        if (pages.length <= 1) return

        const id: number = window.setInterval(() => {
            setPageIndex((prev) => (prev + 1) % pages.length)
        }, normalizedAutoPlayMs)

        return () => window.clearInterval(id)
    }, [normalizedAutoPlayMs, pages.length, paused])

    /**
     * canMove
     * - 페이지가 2개 이상일 때만 이동/자동재생이 의미가 있음
     */
    const canMove: boolean = pages.length > 1

    /**
     * lgGridClass
     * - itemsPerPage에 따라 lg 구간에서 컬럼 수를 맞춤
     * - 매핑이 없으면 DEFAULT_ITEMS_PER_PAGE의 설정을 fallback으로 사용
     */
    const lgGridClass =
        LG_GRID_CLASS_BY_ITEMS_PER_PAGE[normalizedItemsPerPage] ??
        LG_GRID_CLASS_BY_ITEMS_PER_PAGE[DEFAULT_ITEMS_PER_PAGE]

    /**
     * goPrev/goNext
     *
     * 역할/목적:
     * - 버튼 기반 이전/다음 페이지 이동을 수행
     *
     * 동작:
     * - 페이지 수를 기준으로 순환 이동(mod 연산)
     * - 이동 불가능(canMove=false)인 경우 아무 동작 없음
     */
    const goPrev = () => {
        if (!canMove) return
        setPageIndex((prev) => (prev - 1 + pages.length) % pages.length)
    }

    const goNext = () => {
        if (!canMove) return
        setPageIndex((prev) => (prev + 1) % pages.length)
    }

    /**
     * handleBlurCapture
     *
     * 역할/목적:
     * - 키보드 사용자 UX를 위해 "캐러셀 내부에서 포커스 이동 중"에는 paused를 유지하고,
     *   "캐러셀 밖으로 포커스가 빠질 때만" paused를 해제
     *
     * 동작:
     * - blur 이벤트의 relatedTarget (다음 포커스 대상)이
     *   현재 섹션(event.currentTarget) 내부에 있으면 paused 유지
     * - 내부에 없으면 paused=false로 자동 재생 재개
     *
     * 주의:
     * - relatedTarget은 상황에 따라 null일 수 있으므로 타입 가드를 통해 안전하게 처리 (null-safe)
     */
    const handleBlurCapture = (event: FocusEvent<HTMLElement>) => {
        const nextTarget = event.relatedTarget
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return
        }
        setPaused(false)
    }

    return (
        <section
            className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur md:p-6"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={handleBlurCapture}
            aria-label={`${title} 캐러셀`}
        >
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold tracking-tight text-white">{title}</h2>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        onClick={goPrev}
                        disabled={!canMove}
                        aria-label="이전"
                    >
                        이전
                    </button>
                    <button
                        type="button"
                        className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                        onClick={goNext}
                        disabled={!canMove}
                        aria-label="다음"
                    >
                        다음
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl">
                {/**
                * 슬라이드 트랙(track)
                *
                * 역할/목적:
                * - 각 페이지를 가로로 나열한 뒤, translateX로 현재 페이지를 노출
                *
                * 포인트:
                * - 각 페이지 컨테이너를 min-w-full로 두어 "한 페이지 = 100% 폭" 보장
                * - transform 기반 이동은 레이아웃 변화 없이 GPU 가속을 기대할 수 있어 스크롤/리사이즈 상황에서 비교적 안정적
                */}
                <div
                    className="flex transition-transform duration-700 ease-out"
                    style={{ transform: `translateX(-${pageIndex * 100}%)` }}
                >
                    {pages.map((page, idx) => (
                        <div key={pageKeys[idx]} className="min-w-full px-1">
                            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lgGridClass}`}>
                                {page.map((a) => (
                                    <Link key={a.keyId} to={toAttractionDetailPath(a.keyId)} className="block">
                                        <AttractionCardView a={a} variant="compact" />
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/**
            * 페이지 인디케이터(dots)
            *
            * 역할/목적:
            * - 현재 페이지를 시각적으로 표시하고, 클릭으로 페이지 점프를 지원
            *
            * 동작 정책:
            * - pages.length > 1일 때만 노출(단일 페이지면 의미가 없음)
            * - 각 dot 버튼은 해당 페이지로 이동(setPageIndex)
            *
            * 접근성 포인트:
            * - aria-label로 각 버튼의 목적(페이지 번호)을 제공
            */}
            {pages.length > 1 && (
                <div className="mt-4 flex justify-center gap-2" aria-label="페이지 인디케이터">
                    {pages.map((_, i) => (
                        <button
                            key={pageKeys[i]}
                            type="button"
                            onClick={() => setPageIndex(i)}
                            className={`h-2 w-2 rounded-full ${i === pageIndex ? "bg-white" : "bg-white/30"}`}
                            aria-label={`페이지 ${i + 1}`}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}