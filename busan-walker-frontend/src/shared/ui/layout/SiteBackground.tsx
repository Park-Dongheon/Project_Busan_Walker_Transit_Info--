// src/shared/ui/layout/SiteBackground.tsx

/**
 * SiteBackground.tsx (Shared UI Layout - 사이트 전체 배경 이미지 전환 컴포넌트)
 *
 * 역할/목적:
 * - 사이트 전체 배경 이미지를 고정 레이어로 깔고, 일정 주기로 자연스럽게 페이드 전환
 * - pointer-events-none + fixed -z-10으로 콘텐츠 영역의 인터랙션을 방해하지 않음
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · SiteBackground  - 배경 이미지 전환 컴포넌트
 * - images prop으로 외부에서 이미지 풀을 주입 가능; 미주입 시 DEFAULT_IMAGES 사용
 * - rotationMode(random/cycle)와 rotateEveryMs로 전환 주기/방식을 제어
 *
 * 동작 방식:
 * 1) current 레이어: 항상 표시되는 현재 배경
 * 2) next 레이어: 이미지 프리로드 완료 후 opacity 0→1 페이드 인
 * 3) transitionDurationMs 이후 currentIndex를 next로 커밋하고 전환 상태를 정리
 * 4) overlay 레이어(bg-black + gradient)로 텍스트 가독성 확보
 *
 * 운영 포인트:
 * - setInterval + setTimeout + Image onload가 얽혀 있으므로
 *   언마운트 시 타이머 해제/핸들러 제거/isMountedRef 가드가 필수
 * - 같은 이미지가 연속 선택되는 것을 random 모드에서 최대 5회 재시도로 회피
 * - motion-reduce 미디어 쿼리로 애니메이션 감소 설정 사용자를 배려
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

/**
 * 배경 이미지 전환 정책
 * - random : 현재 이미지를 제외한 임의 이미지를 선택
 * - cycle  : 목록 순서대로 다음 이미지로 전환
 */
type RotationMode = "random" | "cycle"

type SiteBackgroundProps = {
    /**
     * 배경 이미지 URL 목록
     * - 외부에서 주입하지 않으면 DEFAULT_IMAGES 사용
     * - 빈 문자열/공백은 내부에서 제거되어 pool에서 제외됨
     */
    images?: readonly string[]

    /**
     * 이미지 자동 전환 주기(ms)
     * - 0 이하이면 자동 전환 비활성화
     */
    rotateEveryMs?: number

    /**
     * 자동 전환 모드(random/cycle)
     */
    rotationMode?: RotationMode

    /**
     * 페이드 전환 시간(ms)
     * - 다음 레이어 opacity 전환과, "전환 커밋(인덱스 확정)" 타이밍에 사용
     */
    transitionDurationMs?: number
}

/**
 * 기본 배경 이미지 풀
 * - public 경로 기준(예: Vite/React에서 /backgrounds/... 로 서빙)
 */
const DEFAULT_IMAGES: readonly string[] = [
    "/backgrounds/busan_01.jpg",
    "/backgrounds/busan_02.jpg",
    "/backgrounds/busan_03.jpg",
    "/backgrounds/busan_04.jpg",
    "/backgrounds/busan_05.jpg",
]

/**
 * SiteBackground
 *
 * 목적:
 * - 사이트 전체 배경 이미지를 고정 레이어로 깔고, 일정 주기로 자연스럽게 페이드 전환
 *
 * 동작 개요:
 * 1) 현재 배경(current) 레이어는 항상 렌더링
 * 2) 다음 배경(next) 레이어는 별도로 준비하고, 이미지 프리로드 완료 후 opacity를 올려 페이드 인
 * 3) transitionDurationMs 이후 currentIndex를 next로 "커밋"하여 상태를 정리(nextIndex 제거)
 *
 * 성능/UX 포인트:
 * - 프리로드 후 전환: 이미지 로딩 지연으로 인한 깜빡임/흰 화면을 줄임
 * - requestAnimationFrame: opacity 변경이 레이아웃/페인트 타이밍에 안정적으로 반영되도록 유도
 * - will-change-opacity: 전환 구간에서 브라우저 최적화 힌트 제공
 *
 * 주의(운영/유지보수):
 * - setInterval + setTimeout + 이미지 onload 같은 비동기 자원이 얽혀 있으므로,
 *   언마운트 시점 정리(타이머 해제/핸들러 제거/가드)가 없으면 메모리 누수나 setState 경고가 발생
 */
export function SiteBackground({
    images = DEFAULT_IMAGES,
    rotateEveryMs = 10000,
    rotationMode = "random",
    transitionDurationMs = 1200,
}: SiteBackgroundProps) {
    /**
     * pool
     * - 입력 images에서 공백 제거(trim) 후, 빈 문자열은 제외
     * - 실제 선택/전환 대상이 되는 "정제된 이미지 목록"
     */
    const pool = useMemo(() => images.map((x) => x.trim()).filter((x) => x.length > 0), [images])

    /**
     * currentIndex
     * - 현재 배경 레이어에 표시되는 이미지 인덱스
     *
     * nextIndex / isNextVisible
     * - 전환 중에만 사용되는 "다음 배경 레이어" 상태
     * - nextIndex: 다음 배경 이미지 인덱스
     * - isNextVisible: next 레이어 opacity(0 -> 1) 전환 트리거
     */
    const [currentIndex, setCurrentIndex] = useState<number>(0)
    const [nextIndex, setNextIndex] = useState<number | null>(null)
    const [isNextVisible, setIsNextVisible] = useState<boolean>(false)

    /**
     * currentIndexRef
     * - setInterval 콜백 등 "오래 살아있는 클로저"에서 최신 currentIndex를 읽기 위한 참조값
     *
     * isTransitionRef
     * - 전환 중 재진입 방지(중복 fade 시작 방지)
     *
     * commitTimeoutRef
     * - fade 완료 후 "커밋(현재 인덱스 확정)"을 위한 setTimeout ID
     *
     * pendingImageRef
     * - 프리로드 중인 Image 객체 참조
     * - 이전 프리로드 작업을 무효화하고 핸들러를 제거하기 위해 보관
     *
     * isMountedRef
     * - 언마운트 이후 비동기 콜백에서 setState가 실행되지 않도록 가드
     */
    const currentIndexRef = useRef<number>(0)
    const isTransitioningRef = useRef<boolean>(false)
    const commitTimeoutRef = useRef<number | null>(null)
    const pendingImageRef = useRef<HTMLImageElement | null>(null)
    const isMountedRef = useRef<boolean>(true)

    /**
     * currentIndex가 바뀔 때 ref도 동기화
     * - 타이머/비동기 콜백에서 항상 최신 인덱스를 읽게 함
     */
    useEffect(() => {
        currentIndexRef.current = currentIndex
    }, [currentIndex])

    /**
     * commit 타이머 정리
     * - 전환 완료 커밋 타이밍(setTimeout)이 남아 있으면 상태 꼬임의 원인이 됨
     */
    const clearCommitTimeout = useCallback(() => {
        if (commitTimeoutRef.current === null) return
        window.clearTimeout(commitTimeoutRef.current)
        commitTimeoutRef.current = null
    }, [])

    /**
     * 프리로드 이미지 정리
     * - onload/onerror 핸들러 제거 + 참조 해제
     * - 이전 요청의 늦은 완료가 현재 전환에 영향을 주지 않도록 차단
     */
    const clearPendingImage = useCallback(() => {
        const img = pendingImageRef.current
        if (!img) return
        img.onload = null
        img.onerror = null
        pendingImageRef.current = null
    }, [])

    /**
     * 다음 인덱스 선택 정책
     * - len <= 1: 전환 의미 없음(현재 유지)
     * - cycle: (prev + 1) % len
     * - random: 현재(prev)와 다른 후보를 몇 번 시도 후, 그래도 같으면 다음 인덱스로 폴백
     *
     * 포인트:
     * - 완전 랜덤이라도 "바로 같은 이미지 재선택"은 UX가 나쁘므로 회피
     */
    const pickNextIndex = useCallback((prev: number, len: number, mode: RotationMode): number => {
        if (len <= 1) return prev
        if (mode === "cycle") return (prev + 1) % len

        let next = prev
        for (let i = 0; i < 5; i += 1) {
            const candidate = Math.floor(Math.random() * len)
            if (candidate !== prev) {
                next = candidate
                break
            }
        }

        if (next === prev) next = (prev + 1) % len
        return next
    }, [])

    /**
     * scheduleFadeTo
     *
     * 역할:
     * - "다음 인덱스(next)"로 페이드 전환을 시작
     *
     * 동작:
     * 1) 전환 가능 조건을 검사(폴 크기, 동일 인덱스, 전환 중 재진입)
     * 2) nextIndex를 세팅하여 next 레이어를 준비하고, isNextVisible=false로 opacity 초기화
     * 3) Image 프리로드 완료(onload/onerror) 후 requestAnimationFrame에서 isNextVisible=true로 전환 시작
     * 4) transitionDurationMs 이후 currentIndex를 next로 커밋하고, 전환용 상태(nextIndex/isNextVisible)를 정리
     *
     * 주의:
     * - 이미지 프리로드 완료가 늦게 도착할 수 있으므로,
     *   pendingImageRef 비교로 "현재 우효한 프리로드"만 반영
     */
    const scheduleFadeTo = useCallback(
        (next: number) => {
            if (pool.length <= 1) return
            if (next === currentIndexRef.current) return
            if (isTransitioningRef.current) return

            const url = pool[next] ?? ""
            if (!url) return

            isTransitioningRef.current = true
            setNextIndex(next)
            setIsNextVisible(false)

            clearPendingImage()
            const img = new Image()
            pendingImageRef.current = img

            const startFade = () => {
                if (!isMountedRef.current) return
                if (pendingImageRef.current !== img) return
                pendingImageRef.current = null

                window.requestAnimationFrame(() => {
                    if (!isMountedRef.current) return
                    setIsNextVisible(true)
                    clearCommitTimeout()

                    commitTimeoutRef.current = window.setTimeout(() => {
                        if (!isMountedRef.current) return
                        setCurrentIndex(next)
                        setNextIndex(null)
                        setIsNextVisible(false)
                        isTransitioningRef.current = false
                        commitTimeoutRef.current = null
                    }, transitionDurationMs)
                })
            }

            img.onload = startFade
            img.onerror = startFade
            img.src = url
        },
        [clearCommitTimeout, clearPendingImage, pool, transitionDurationMs]
    )

    /**
     * pool 변경 시 초기화
     * - 이전 전환 상태를 모두 정리
     * - pool이 비어있으면 currentIndex를 0으로 두고(결과적으로 backgroundImage undefined),
     *   pool이 있으면 초기 배경을 임의로 선택
     */
    useEffect(() => {
        clearCommitTimeout()
        clearPendingImage()
        isTransitioningRef.current = false
        setNextIndex(null)
        setIsNextVisible(false)

        if (pool.length === 0) {
            setCurrentIndex(0)
            return
        }

        setCurrentIndex(Math.floor(Math.random() * pool.length))
    }, [pool, clearCommitTimeout, clearPendingImage])

    /**
     * 자동 전환 타이머
     * - rotateEveryMs 간격으로 다음 인덱스를 선택하고 scheduleFadeTo 호출
     * - 전환 중에는 skip하여 중복 전환을 방지
     */
    useEffect(() => {
        if (rotateEveryMs <= 0) return
        if (pool.length <= 1) return

        const timerId = window.setInterval(() => {
            if (isTransitioningRef.current) return
            const prev = currentIndexRef.current
            const next = pickNextIndex(prev, pool.length, rotationMode)
            scheduleFadeTo(next)
        }, rotateEveryMs)

        return () => {
            window.clearInterval(timerId)
        }
    }, [pickNextIndex, pool.length, rotateEveryMs, rotationMode, scheduleFadeTo])

    /**
     * 마운트/언마운트 가드
     * - 언마운트 이후 비동기 콜백이 setState를 호출하지 않도록 플래그로 차단
     * - 타이머/프리로드 이미지도 함께 정리
     */
    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
            clearCommitTimeout()
            clearPendingImage()
        }
    }, [clearCommitTimeout, clearPendingImage])

    /**
     * 랜더링용 URL 계산
     * - pool 범위를 벗어날 수 있으므로 안전하게 ?? "" 처리
     */
    const currentUrl = pool[currentIndex] ?? ""
    const nextUrl = nextIndex === null ? "" : (pool[nextIndex] ?? "")
    const nextOpacityClass = isNextVisible ? "opacity-100" : "opacity-0"

    /**
     * 렌더링 구조
     * - current 레이어: 항상 표시되는 배경
     * - next 레이어   : 전환 시에만 opacity로 덮어씌우는 배경
     * - overlay 레이어: 가독성(텍스트 대비) + 블러 효과
     */
    return (
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
            <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: currentUrl ? `url(${currentUrl})` : undefined }}
            />

            <div
                className={[
                    "absolute inset-0 bg-cover bg-center will-change-opacity",
                    "transition-opacity ease-in-out motion-reduce:transition-none motion-reduce:duration-0",
                    nextOpacityClass,
                ].join(" ")}
                style={{
                    backgroundImage: nextUrl ? `url(${nextUrl})` : undefined,
                    transitionDuration: `${transitionDurationMs}ms`,
                }}
            />

            <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
            <div className="absolute inset-0 bg-linear-to-b from-black/25 via-black/15 to-black/60" />
        </div>
    )
}
