// src/domains/map/model/view/useMapResizeObserver.ts

// cspell:ignore navermaps
/// <reference types="navermaps" />

/**
 * useMapResizeObserver.ts (지도 뷰 - 컨테이너 리사이즈 동기화 훅)
 *
 * 역할/목적:
 * - 지도 컨테이너의 실제 크기 변화가 발생할 때, Naver Maps 인스턴스가 이를 인지하도록 동기화
 * - 패널 열림/닫힘, 탭 전환, 레이아웃 애니메이션, 반응형 너비 변경 등으로 DOM 크기가 바뀌어도
 *   지도 타일, 오버레이, 중심 좌표계가 깨지지 않도록 보정
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useMapResizeObserver  - 컨테이너 크기 변화를 감지해 지도 SDK에 반영하는 훅
 * - 이 훅은 "지도 크기 동기화"만 담당
 * - 지도 중심 이동, 줌 조정, 오버레이 재배치 정책은 다른 훅/모듈의 책임
 * - SDK 버전 또는 타입 노출 형태가 달라도 동작할 수 있도록 feature detection 방식으로 resize API를 선택
 *
 * 동작 방식:
 * - measureContainerSize: 컨테이너의 실제 픽셀 크기를 측정하고 최소 크기로 정규화
 * - applyMapResize: SDK가 제공하는 가능한 resize 경로를 우선순위대로 시도
 * - useMapResizeObserver: 관측 시작, 초기 1회 동기화, fallback 연결, cleanup을 담당
 * - 연속적인 크기 변경 이벤트를 requestAnimationFrame 단위로 묶어 과도한 SDK 호출을 줄임
 * - 동일한 width / height가 반복 측정되면 실제 SDK 호출을 생략해 불필요한 재계산을 줄임
 *
 * 운영 포인트:
 * - 사이드 패널이나 상세 패널이 열리면서 지도 영역 폭이 바뀌는 UI에서는 이 훅의 체감 효과가 큼
 * - Naver Maps SDK 버전 변경으로 setSize / refresh 지원 형태가 달라질 수 있으므로,
 *   지도 크기 깨짐 이슈가 생기면 이 파일의 feature detection 순서를 우선 점검
 * - 이 훅은 브라우저 API(ResizeObserver, window, requestAnimationFrame)에 의존하므로
 *   SSR 단계가 아니라 실제 클라이언트 마운트 이후에만 의미 있음
 */

import { useEffect } from "react";

const MIN_MAP_CONTAINER_SIZE_PX = 1

/**
 * 지도 SDK 구현체별 resize 경로를 넓게 수용하기 위한 보조 타입
 *
 * - 공식 타입 선언에 모든 메서드가 항상 드러나지 않을 수 있어,
 *   런타임 feature detection을 위해 선택적 메서드 형태로 다룸
 */
type ResizableMap = naver.maps.Map & {
    setSize?: (size: naver.maps.Size) => void
    refresh?: () => void
}

type MeasuredContainerSize = {
    width: number
    height: number
}

/**
 * 컨테이너의 현재 렌더링 크기를 측정
 *
 * - getBoundingClientRect() 기준으로 width/height를 읽고 정수 픽셀로 반올림
 * - 비정상 값이나 0에 가까운 중간 상태를 방어하기 위해 최소 1px로 보정
 * - transition 중이라면 여러 번 다른 값이 들어올 수 있음
 */
function measureContainerSize(element: HTMLDivElement): MeasuredContainerSize {
    const rect = element.getBoundingClientRect()
    const width = Number.isFinite(rect.width) ? Math.round(rect.width) : 0
    const height = Number.isFinite(rect.height) ? Math.round(rect.height) : 0

    return {
        width: Math.max(MIN_MAP_CONTAINER_SIZE_PX, width),
        height: Math.max(MIN_MAP_CONTAINER_SIZE_PX, height)
    }
}

/**
 * 측정된 크기를 지도 인스턴스에 반영
 *
 * - SDK 버전 또는 타입 노출 방식이 달라도 가능한 resize 경로를 최대한 활용
 * - 1순위: setSize(Size) 지원 시 직접 크기를 전달
 * - 2순위: refresh() 지원 시 내부 재계산 루틴을 호출
 * - 3순위: resize 이벤트를 직접 trigger 하여 fallback
 * - 호출 시점 제어와 중복 방지는 상위 effect에서 담당
 */
function applyMapResize(
    map: naver.maps.Map,
    maps: typeof naver.maps,
    size: MeasuredContainerSize
): void {
    const resizableMap = map as ResizableMap

    if (typeof resizableMap.setSize === "function") {
        resizableMap.setSize(new maps.Size(size.width, size.height))
        return
    }

    if (typeof resizableMap.refresh === "function") {
        resizableMap.refresh()
        return
    }

    maps.Event.trigger(map, "resize")
}

/**
 * 지도 컨테이너의 크기 변화를 감시하고 지도 인스턴스에 반영
 *
 * - DOM 레이아웃 변화와 지도 SDK 내부 캔버스 크기 계산을 동기화해,
 *   지도 깨짐이나 오버레이 위치 어긋남을 줄이기 위한 모델 훅
 * - map, maps, container가 모두 준비되었을 때만 관측을 시작
 * - 초기 마운트 직후 1회 resize 동기화를 수행
 * - ResizeObserver가 있으면 이를 우선 사용하고, 없으면 window resize 이벤트를 fallback으로 사용
 * - 실제 resize 적용은 requestAnimationFrame으로 스케줄링해 한 프레임에 여러 이벤트가 와도 1회만 실행
 * - cleanup에서 observer, window listener, 예약된 raf를 모두 정리해야 중복 호출을 막을 수 있음
 */
export function useMapResizeObserver(args: {
    map: naver.maps.Map | null
    maps: typeof naver.maps | null
    container: React.RefObject<HTMLDivElement | null>
}): void {
    const { map, maps, container } = args

    useEffect(() => {
        const element = container.current

        if (!map || !maps) return
        if (!element) return

        let rafId: number | null = null
        let lastWidth = -1
        let lastHeight = -1

        /**
         * 현재 컨테이너 크기를 측정해 지도에 즉시 반영
         *
         * - 같은 크기가 반복되면 SDK 호출을 생략하여,
         *   ResizeObserver/resize 이벤트가 빈번한 상황에서도 불필요한 재계산을 줄임
         */
        const applySizeNow = () => {
            const { width, height } = measureContainerSize(element)

            if (width === lastWidth && height === lastHeight) return

            lastWidth = width
            lastHeight = height

            applyMapResize(map, maps, { width, height })
        }

        /**
         * resize 적용을 다음 브라우저 렌더 프레임으로 지연
         *
         * - 연속적인 레이아웃 변경 동안 SDK 호출이 과도하게 누적되는 것을 방지
         * - 이미 예약된 raf가 있으면 추가 예약하지 않음
         * - 결과적으로 한 프레임당 최대 1회만 applySizeNow가 실행됨
         */
        const scheduleApplySize = () => {
            if (rafId != null) return

            rafId = window.requestAnimationFrame(() => {
                rafId = null
                applySizeNow()
            })
        }

        /* 초기 1회 동기화: 마운트 직후 실제 렌더링된 컨테이너 크기를 지도에 맞춰 주기 위해 실행 */
        scheduleApplySize()

        let ro: ResizeObserver | null = null
        let onWindowResize: (() => void) | null = null

        if (typeof ResizeObserver !== "undefined") {
            /**
             * 컨테이너 크기 변화를 가장 직접적으로 감지하는 경로
             *
             * - 패널 토글, flex 레이아웃 변경, 애니메이션 너비 변경처럼 window resize가 아닌 변화도 포착 가능
             */
            ro = new ResizeObserver(() => {
                scheduleApplySize()
            })
            ro.observe(element)
        } else {
            /**
             * 구현 환경 fallback
             *
             * window 크기 변경에만 반응하므로 정밀도는 낮지만, 최소한의 리사이즈 동기화를 보장
             */
            onWindowResize = () => {
                scheduleApplySize()
            }
            window.addEventListener("resize", onWindowResize)
        }

        return () => {
            ro?.disconnect()

            if (onWindowResize) {
                window.removeEventListener("resize", onWindowResize)
            }

            if (rafId != null) {
                window.cancelAnimationFrame(rafId)
            }
        }

    }, [container, map, maps])
}