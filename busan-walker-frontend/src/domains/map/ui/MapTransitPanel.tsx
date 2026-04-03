// src/domains/map/ui/MapTransitPanel.tsx

/**
 * MapTransitPanel.tsx (Map Domain UI - 교통 옵션 오버레이 패널)
 *
 * 역할/목적:
 * - 선택된 관광지의 교통 옵션과 관련 상태를 화면 패널 형태로 표시
 * - 로딩, 오류, 재시도, 옵션 선택, 상세 이동 같은 상호작용 UI를 담당
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · MapTransitPanel  - 교통 옵션 오버레이 패널 기본 내보내기 컴포넌트
 * - 표현과 사용자 이벤트 전달에 집중하고 실제 지도 제어는 상위 컨테이너에 위임
 * - 패널이 사용할 데이터는 가공된 props 형태로만 전달받아 렌더링 책임을 분리
 *
 * 동작 방식:
 * - selectedPin과 transitOptionItems를 바탕으로 요약 정보와 옵션 목록을 렌더링
 * - 상태 props에 따라 로딩, 오류, 빈 상태 UI를 분기하고 클릭 이벤트를 상위로 전달
 *
 * 운영 포인트:
 * - 문구, 접근성 속성, 버튼 상태 변경은 모바일과 데스크톱 사용성에 직접 영향을 줌
 * - 데이터 구조 변경 시 MapContainer와 transit derived 계층의 props 전달 방식도 함께 점검해야 함
 */

import { useId } from "react";
import { Link } from "react-router-dom";

import { formatKmLabel } from "../lib";
import type { AttractionPin, MapTransitOption, TransitOptionPanelItem } from "../types";

type MapTransitPanelProps = {
    selectedPin: AttractionPin
    detailPath: string
    isCollapsed: boolean
    onToggleCollapsed: () => void
    selectedPinWalkApprox: { distanceKm: number; walkMin: number } | null
    isTransitLoading: boolean
    isTransitRefreshing: boolean
    isTransitError: boolean
    canRetryTransitQuery: boolean
    onRetryTransitQuery: () => void
    transitOptionItems: TransitOptionPanelItem[]
    hasTransitOptions: boolean
    isTransitFetching: boolean
    onTransitOptionClick: (option: MapTransitOption) => void
}

export default function MapTransitPanel({
    selectedPin,
    detailPath,
    isCollapsed,
    onToggleCollapsed,
    selectedPinWalkApprox,
    isTransitLoading,
    isTransitRefreshing,
    isTransitError,
    canRetryTransitQuery,
    onRetryTransitQuery,
    transitOptionItems,
    hasTransitOptions,
    isTransitFetching,
    onTransitOptionClick
}: MapTransitPanelProps) {
    const transitPanelContentId = useId()

    return (
        <aside
            className="absolute bottom-3 left-3 right-3 z-20 md:left-auto md:right-3 md:w-[420px]"
            aria-label={`${selectedPin.name} 대중교통 정보 패널`}
        >
            <div className="flex max-h-[min(78vh,34rem)] flex-col overflow-hidden rounded-2xl bg-white/90 p-4 text-sm text-gray-800 shadow">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-base font-extrabold">{selectedPin.name}</div>
                        {!isCollapsed ? (
                            <div className="mt-1 text-xs text-gray-600">
                                거리와 도보 시간, 정류장 정보를 확인하세요.
                            </div>
                        ) : null}
                        {selectedPinWalkApprox ? (
                            <div className="mt-1 text-xs font-medium text-sky-800">
                                내 위치 기준(근사): 도보 {selectedPinWalkApprox.walkMin}분 / {formatKmLabel(selectedPinWalkApprox.distanceKm)}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            to={detailPath}
                            className="rounded-xl bg-black/10 px-3 py-2 text-xs font-bold hover:bg-black/15"
                        >
                            상세 보기
                        </Link>

                        <button
                            type="button"
                            onClick={onToggleCollapsed}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-black/15 bg-white/70 text-gray-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                            aria-label={isCollapsed ? "대중교통 패널 펼치기" : "대중교통 패널 접기"}
                            title={isCollapsed ? "대중교통 패널 펼치기" : "대중교통 패널 접기"}
                            aria-expanded={!isCollapsed}
                            aria-controls={transitPanelContentId}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? "rotate-180" : ""}`}
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
                </div>

                <div
                    id={transitPanelContentId}
                    className="mt-3"
                    role="region"
                    aria-label="대중교통 옵션 목록"
                    aria-busy={isTransitFetching}
                >
                    {!isCollapsed ? (
                        <div className="max-h-[min(48vh,20rem)] space-y-2 overflow-y-auto pr-1 md:max-h-[min(56vh,24rem)]">
                            {isTransitLoading ? (
                                <div role="status" aria-live="polite" className="text-xs text-gray-600">
                                    대중교통 정보를 불러오는 중...
                                </div>
                            ) : null}

                            {isTransitRefreshing ? (
                                <div role="status" aria-live="polite" className="text-xs text-gray-600">
                                    대중교통 정보를 업데이트하는 중...
                                </div>
                            ) : null}

                            {isTransitError ? (
                                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                    대중교통 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            onClick={onRetryTransitQuery}
                                            disabled={!canRetryTransitQuery}
                                            className="rounded-md border border-red-300 bg-white px-2 py-1 font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            다시 시도
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {transitOptionItems.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => onTransitOptionClick(item.option)}
                                    disabled={!item.hasCoord}
                                    className="w-full rounded-xl bg-black/5 p-3 text-left transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <div className="text-xs font-extrabold">{item.modeLabel}</div>
                                    <div className="mt-1 text-xs text-gray-700">{item.facilityLabel}</div>
                                    <div className="mt-1 text-xs text-gray-700">
                                        거리 {item.distanceLabel} / 도보 {item.walkLabel}
                                    </div>
                                    {item.myWalkApprox ? (
                                        <div className="mt-1 text-xs font-medium text-sky-800">
                                            내 위치 기준(근사): 도보 {item.myWalkApprox.walkMin}분 / {formatKmLabel(item.myWalkApprox.distanceKm)}
                                        </div>
                                    ) : null}
                                </button>
                            ))}

                            {!isTransitError && !hasTransitOptions && !isTransitFetching ? (
                                <div role="status" aria-live="polite" className="text-xs text-gray-600">
                                    표시할 대중교통 옵션이 없습니다.
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-xs text-gray-600">
                            대중교통 패널이 접힌 상태입니다. 버튼을 눌러 다시 펼칠 수 있습니다.
                        </div>
                    )}
                </div>
            </div>
        </aside>
    )
}