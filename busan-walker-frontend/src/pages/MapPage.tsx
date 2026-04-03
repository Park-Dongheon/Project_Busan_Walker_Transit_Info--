// src/pages/MapPage.tsx

import { useCallback, useState } from "react";
import { ui as mapUi } from "@/domains/map";
import type { GeoPoint, MapHelpers } from "@/domains/map";

/**
 * MapPage.tsx (Page - 대중교통 안내 지도 페이지)
 *
 * 역할/목적:
 * - 지도 기반으로 부산 관광지 핀과 대중교통 접근 정보를 시각적으로 탐색하는 페이지
 * - 키워드/장소 검색, 내 위치 표시, 검색 패널 토글 등 지도 인터랙션의 제어 레이어를 담당
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · MapPage  - 대중교통 안내 지도 페이지 컴포넌트
 *
 * 동작 방식:
 * - 검색/위치/패널 상태는 이 페이지가 소유하고, MapContainer에 props로 전달
 * - MapHelpers(geocodeAndMove, locateMe, clearMyLocation 등)는 MapContainer가 준비되면
 *   onMapHelpersReady 콜백으로 받아 로컬 상태에 저장하여 사용
 * - 상단 오버레이(검색/상태 패널)는 지도 위에 절대 위치로 배치되어 지도 뷰를 가리지 않음
 *
 * 운영 포인트:
 * - 지도 높이(h-[60dvh] 등)는 반응형 뷰포트 단위로 관리하여 다양한 화면 크기를 대응
 * - pinStatusText 포맷(표시 상한 도달, 전체 N개 중 M개 등)은 사용자 혼란을 줄이기 위한 명시적 안내
 * - handleLocateMe는 async 함수이므로 void 처리가 필요한 시점(onClick 등)에 void 연산자를 사용
 */

/**
 * MapPage
 *
 * 역할/목적:
 * - 지도 페이지의 상태 관리와 MapContainer 제어를 담당하는 최상위 컴포넌트
 *
 * 상태 설계:
 * - q/appliedKeyword: 입력 중인 키워드(q)와 실제 적용된 키워드(appliedKeyword)를 분리하여 관리
 * - mapStatus: MapContainer에서 전달받은 핀 수/로딩/상한 도달 정보를 상태로 유지
 * - mapHelpers: MapContainer가 준비되면 콜백으로 수신한 헬퍼 함수 참조
 */
export default function MapPage() {
    // q: 입력 중인 검색어, appliedKeyword: 실제 지도 필터에 적용된 검색어 (두 상태를 분리)
    const [q, setQ] = useState<string>("")
    const [appliedKeyword, setAppliedKeyword] = useState<string>("")
    const [isLocating, setIsLocating] = useState<boolean>(false)
    const [locationStatus, setLocationStatus] = useState<string>("")
    const [isSearchPanelCollapsed, setIsSearchPanelCollapsed] = useState<boolean>(false)
    // MapContainer에서 콜백으로 전달받는 핀/로딩/상한 상태
    const [mapStatus, setMapStatus] = useState<{
        mapReady: boolean
        pinCount: number
        totalPinCount: number | null
        isPinsFetching: boolean
        isPinsTruncated: boolean
    }>({
        mapReady: false,
        pinCount: 0,
        totalPinCount: null,
        isPinsFetching: false,
        isPinsTruncated: false,
    })
    const [myLocation, setMyLocation] = useState<GeoPoint | null>(null)
    // mapHelpers: MapContainer가 마운트 완료 후 onMapHelpersReady로 주입받는 지도 조작 인터페이스
    const [mapHelpers, setMapHelpers] = useState<MapHelpers | null>(null)
    const trimmedQ = q.trim()
    // 핀 상태 텍스트: 로딩 중/상한 도달/정상 3가지 상태를 명시적으로 구분하여 표시
    const pinStatusText = mapStatus.isPinsFetching
        ? "로딩 중..."
        : mapStatus.isPinsTruncated
            ? mapStatus.totalPinCount !== null && mapStatus.totalPinCount > mapStatus.pinCount
                ? `${mapStatus.pinCount}개 / 전체 ${mapStatus.totalPinCount}개`
                : `${mapStatus.pinCount}개 (표시 상한 도달)`
            : `${mapStatus.pinCount}개`

    const handleSearch = useCallback((): void => {
        if (!trimmedQ) {
            setAppliedKeyword("")
            return
        }
        mapHelpers?.geocodeAndMove(trimmedQ)
        setAppliedKeyword(trimmedQ)
    }, [trimmedQ, mapHelpers])

    const handleLocateMe = useCallback(async (): Promise<void> => {
        if (!mapHelpers?.locateMe) {
            setLocationStatus("지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.")
            return
        }

        setIsLocating(true)
        setLocationStatus("위치 권한을 확인하는 중입니다...")

        try {
            const { lat, lng } = await mapHelpers.locateMe()
            setMyLocation({ lat, lng })
            setLocationStatus(`내 위치 표시 완료 (${lat.toFixed(5)}, ${lng.toFixed(5)})`)
        } catch (error: unknown) {
            if (error instanceof Error && error.message.trim().length > 0) {
                setLocationStatus(error.message)
            } else {
                setLocationStatus("내 위치를 가져오지 못했습니다.")
            }
        } finally {
            setIsLocating(false)
        }
    }, [mapHelpers])

    const handleClearMyLocation = useCallback((): void => {
        mapHelpers?.clearMyLocation()
        setMyLocation(null)
        setLocationStatus("내 위치 표시를 해제했습니다.")
    }, [mapHelpers])

    const toggleSearchPanel = useCallback((): void => {
        setIsSearchPanelCollapsed((prev) => !prev)
    }, [])

    const handleResetToInitialView = useCallback((): void => {
        mapHelpers?.clearMyLocation()
        setQ("")
        setAppliedKeyword("")
        setMyLocation(null)
        setLocationStatus("")
        setIsSearchPanelCollapsed(false)
    }, [mapHelpers])

    return (
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen -my-4">
            <div className="absolute left-1/2 top-14 z-20 w-[min(95vw,760px)] -translate-x-1/2 sm:top-16 md:top-4">
                <div className="rounded-2xl border border-white/20 bg-black/45 p-2.5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-md sm:p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold tracking-wide text-white/85">키워드/장소 검색</div>
                        <button
                            type="button"
                            onClick={toggleSearchPanel}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/30 bg-white/10 text-white/90 shadow-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                            aria-label={isSearchPanelCollapsed ? "검색 패널 펼치기" : "검색 패널 숨기기"}
                            title={isSearchPanelCollapsed ? "검색 패널 펼치기" : "검색 패널 숨기기"}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className={`h-4 w-4 transition-transform duration-200 ${isSearchPanelCollapsed ? "rotate-180" : ""}`}
                                fill="none"
                            >
                                <path
                                    d="M6 9l6 6 6-6"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </button>
                    </div>

                    {!isSearchPanelCollapsed ? (
                        <>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    id="mapSearch"
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSearch()
                                    }}
                                    placeholder="예: 오션뷰, 박물관, 카페거리, 부산역"
                                    className="w-full rounded-xl border border-white/25 bg-black/25 px-3 py-2 text-sm text-white placeholder:text-white/55 outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/35 sm:flex-1"
                                    aria-label="키워드/장소 검색어 입력"
                                />
                                <button
                                    type="button"
                                    onClick={handleSearch}
                                    className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                                >
                                    이동 + 필터
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleLocateMe()}
                                    disabled={isLocating}
                                    className="rounded-xl border border-sky-200/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isLocating ? "위치 확인 중..." : "내 위치 표시"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearMyLocation}
                                    className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                                >
                                    위치 숨기기
                                </button>
                                {trimmedQ.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQ("")
                                            setAppliedKeyword("")
                                        }}
                                        className="rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm font-medium text-white/85 transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                                    >
                                        지우기
                                    </button>
                                ) : null}
                            </div>
                            <p className="mt-1 hidden text-[11px] text-white/75 sm:block">
                                장소명, 지역명, 테마 키워드(예: 야경, 시장, 해산물)로 검색할 수 있습니다.
                            </p>
                            <p className="mt-1 text-[11px] text-white/75">
                                내 위치 표시는 버튼 클릭 후 브라우저 권한 허용이 필요합니다.
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                                    주변 관광지 수 {pinStatusText}
                                </span>
                                {appliedKeyword ? (
                                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                                        검색어 필터: {appliedKeyword}
                                    </span>
                                ) : null}
                                {mapStatus.isPinsTruncated ? (
                                    <span className="rounded-full border border-amber-200/30 bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-100">
                                        주변 관광지 수 표시 상한에 도달해 일부만 표시됩니다.
                                    </span>
                                ) : null}
                                {locationStatus ? (
                                    <span className="rounded-full border border-sky-200/30 bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-100">
                                        {locationStatus}
                                    </span>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                                검색/필터 패널 숨김
                            </span>
                            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                                주변 관광지 수 {pinStatusText}
                            </span>
                            {appliedKeyword ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                                    검색어: {appliedKeyword}
                                </span>
                            ) : null}
                            {mapStatus.isPinsTruncated ? (
                                <span className="rounded-full border border-amber-200/30 bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-100">
                                    일부 관광지 수만 표시 중
                                </span>
                            ) : null}
                            {locationStatus ? (
                                <span className="rounded-full border border-sky-200/30 bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-100">
                                    {locationStatus}
                                </span>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>

            <mapUi.MapContainer
                className="h-[60dvh] sm:h-[72dvh] md:h-[calc(100dvh-3.5rem)]"
                mapClassName="rounded-none"
                keyword={appliedKeyword}
                myLocation={myLocation}
                onMapHelpersReady={setMapHelpers}
                onResetToInitialView={handleResetToInitialView}
                onMapStatusChange={setMapStatus}
            />
        </div>
    )
}
