// src/shared/ui/Modal.tsx

/**
 * Modal.tsx (Shared UI - 공통 모달 다이얼로그 컴포넌트)
 *
 * 역할/목적:
 * - 공통 모달 상호작용(ESC 닫기, 배경 클릭 닫기, 포커스 트랩, 포커스 복원,
 *   body 스크롤 잠금, portal 렌더링)을 담당하는 기반 컴포넌트
 * - 데이터 로딩/저장/권한/에러 처리 등 도메인 정책은 상위 컨테이너가 담당
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ModalProps  - 컴포넌트 props 타입
 *      · Modal       - 공통 모달 컴포넌트
 * - Controlled component: open 상태를 상위가 소유하고, Modal은 onClose 요청만 발생
 * - 모든 닫기 트리거(ESC/Backdrop/버튼)는 requestClose 단일 지점을 통해 closeDisabled 정책을 강제
 *
 * 동작 방식:
 * - open=true 시 document.body에 portal로 렌더링하여 부모 컨텍스트(overflow/z-index) 영향을 차단
 * - 오픈 시 포커스를 모달 내 첫 번째 focusable 요소로 이동, 닫힘 시 이전 포커스로 복원
 * - Tab/Shift+Tab은 모달 패널 내부에서만 순환(포커스 트랩)
 * - 모달이 열린 동안 body 스크롤을 잠금; 중첩 모달은 reference count로 안전하게 관리
 *
 * 운영 포인트:
 * - closeDisabled=true이면 ESC/Backdrop/닫기 버튼 모두 무효 — 저장/전송 중 데이터 손실 방지 용도
 * - bodyScrollLockCount는 모듈 스코프 전역 상태이므로, 같은 페이지에 여러 Modal이 공존해도 안전
 * - SSR 환경에서는 document가 없으므로 렌더링하지 않음
 */

import {
    useCallback,
    useEffect,
    useId,
    useRef,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * ModalProps
 *
 * 컴포넌트 형태:
 * - Controlled component: open 상태를 상위가 소유하고, Modal은 상호작용(onClose 요청)만 발생
 *
 * closeDisabled 정책
 * - 저장/전송과 같이 "중단되면 안 되는 구간"에서 닫기를 막기 위한 플래그
 * - ESC/Backdrop/닫기 버튼 모두 동일 정책으로 차단되어야 UX가 일관되므로,
 *   실제 닫기 엔트리 포인트(requestClose)에서 단일하게 적용
 */
export type ModalProps = {
    /**
     * 모달의 표시 여부
     * - true일 때만 DOM을 렌더링하고, 포커스 트랩/복원 로직이 활성화
     */
    open: boolean

    /**
     * 모달 헤더 영역에 표시되는 제목
     * - aria-labelledby로 연결되어 스크린리더가 다이얼로그 제목을 인식
     */
    title: string

    /**
     * 모달 본문 컨텐츠
     * - 데이터 텍스트/폼/버튼 구성 등은 상위에서 주입
     */
    children: ReactNode

    /**
     * 닫기 요청 콜백
     * - 실제 상태 전환(open=false)은 상위 컴포넌트가 담당(Controlled component)
     */
    onClose: () => void

    /**
     * 닫기 동작을 일시 차단하는 플래그
     * - 저장/전송 등 "중단되면 안 되는 구간"에서 ESC/Backdrop/닫기 버튼을 막는 용도
     */
    closeDisabled?: boolean
}

/**
 * Body Scroll Lock (전역 상태)
 *
 * 목적:
 * - 모달이 열린 동안 배경 스크롤을 막아 사용자가 "배경 페이지를 움직이는 것"을 방지
 *
 * 정책(중첩 고려):
 * - 모달이 여러 개 중첩될 수 있으므로 reference count로 관리
 * - 첫 잠금 시 기존 body inline style(overflow/paddingRight)을 저장해두고,
 *   마지막 모달이 닫힐 때 원래 값으로 복원
 *
 * UX 포인트(스크롤바 폭 보정)
 * - overflow: hidden 적용 시 스크롤바가 사라져 화면이 좌우로 튀는 현상이 발생
 * - window.innerWidth - documentElement.clientWidth로 스크롤바 폭을 계산해
 *   body paddingRight에 더해 레이아웃 점프를 최소화
 */
let bodyScrollLockCount = 0
let previousBodyOverflow = ""
let previousBodyPaddingRight = ""

function lockBodyScroll(): void {
    if (typeof document === "undefined") return
    const body = document.body

    if (bodyScrollLockCount === 0) {
        previousBodyOverflow = body.style.overflow
        previousBodyPaddingRight = body.style.paddingRight

        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
        const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight || "0") || 0

        body.style.overflow = "hidden"
        if (scrollbarWidth > 0) {
            body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`
        }
    }

    bodyScrollLockCount += 1
}

function unlockBodyScroll(): void {
    if (typeof document === "undefined") return
    const body = document.body

    if (bodyScrollLockCount <= 0) return

    bodyScrollLockCount -= 1
    if (bodyScrollLockCount > 0) return

    body.style.overflow = previousBodyOverflow
    body.style.paddingRight = previousBodyPaddingRight

    previousBodyOverflow = ""
    previousBodyPaddingRight = ""
}

/**
 * isElementVisibleForFocus
 *
 * 목적:
 * - 포커스 트랩(Tab 순환) 대상으로 "실제로 포커스 이동이 의미 있는 요소"만 남김
 *
 * 정책:
 * - hidden/inert/aria-hidden 등으로 사용자에게 노출되지 않는 요소는 제외
 * - display:none / visibility:hidden(collapse) 등 렌더링/가시성 없는 요소 제외
 * - getClientRects 기반으로 레이아웃상 보이는지 검사하여 "숨은 요소로 Tab이 빠지는 UX"를 방지
 *
 * 주의:
 * - 가시성 판정은 레이아웃/애니메이션/포지셔닝에 따라 100% 완벽할 수 없음
 * - 여기서는 모달 UX에 필요한 실용적 수준의 필터링을 목표
 */
function isElementVisibleForFocus(el: HTMLElement): boolean {
    if (el.hidden) return false
    if (el.closest("[inert]")) return false

    const style = window.getComputedStyle(el)
    if (style.display === "none") return false
    if (style.visibility === "hidden" || style.visibility === "collapse") return false

    return el.getClientRects().length > 0 || el === document.activeElement
}

/**
 * getFocusableElements
 *
 * 목적:
 * - 모달 패널 내부에서 Tab 이동 가능한 요소 목록을 수집
 *
 * 정책:
 * - 표준 포커스 가능 셀렉터(button/input/select/textarea/a/[tabindex]/contenteditable 등) 기반 수집
 * - disabled/aria-disabled/aria-hidden 요소 제외
 * - isElementVisibleForFocus로 실제 UX에 맞는 대상만 남김
 *
 * 포인트:
 * - 포커스 트랩은 "현재 focusable 목록"에 의존하므로,
 *   렌더링 상태에 따라 목록이 바뀌어도 동작이 자연스럽게 유지
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
    const FOCUSABLE_SELECTOR =
        [
            'button:not([disabled])',
            '[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
            '[contenteditable="true"]',
            "summary",
        ].join(", ")

    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
        if (el.hasAttribute("disabled")) return false
        if (el.getAttribute("aria-disabled") === "true") return false
        if (el.getAttribute("aria-hidden") === "true") return false
        return isElementVisibleForFocus(el)
    })
}

/**
 * restoreFocusSafely
 *
 * 목적:
 * - 모달이 닫힐 때 "모달 오픈 직전 포커스를 가지고 있던 요소"로 포커스를 복원
 *
 * 왜 필요한가?:
 * - 키보드/스크린리더 사용자는 포커스 위치가 곧 "현재 컨텍스트"이므로,
 *   모달을 닫아도 이전 위치로 돌아갈 수 있어야 탐색 흐름이 끊기지 않음
 *
 * 주의:
 * - 라우트 전환/조건부 렌더링으로 대상 노드가 제거되었을 수 있으므로,
 *   isConnected/disabled 체크 + try/catch로 "복원 실패를 정상 상황"으로 취급
 */
function restoreFocusSafely(target: HTMLElement | null): void {
    if (!target) return
    if (!target.isConnected) return
    if (target.hasAttribute("disabled")) return
    try {
        target.focus()
    } catch {
        // focus 복원 실패는 라우트 전환/DOM 교체 시 자연스럽게 발생 가능
    }
}

/**
 * Modal
 *
 * 책임(역할 분리):
 * - 공통 모달 상호작용(ESC 닫기, 배경 클릭 닫기, 포커스 트랩, 포커스 복원, body 스크롤 잠금, portal 렌더링)만 담당
 * - 데이터 로딩/저장/권한/에러 처리 등 도메인 정책은 상위 컨테이너가 담당
 *
 * 접근성(Accessibility) 정책:
 * - role="dialog" + aria-modal="true": 스크린리더에 모달 컨텍스트를 명시
 * - aria-labelledby: 제목을 연결하여, 다이얼로그의 이름이 명확히 읽히게 함
 *
 * 상호작용(Interaction) 정책:
 * - open=true 시:
 *   - 모달 오픈 직전 포커스 요소를 저장하고, 모달 내부의 첫 포커스 가능 요소로 포커스를 이동
 *   - Tab/Shift + Tab은 모달 패널 내부에서만 순환하도록 포커스 트랩을 적용
 *   - 배경 스크롤을 잠금
 * - open=false 시:
 *   - DOM을 렌더링하지 않아 이벤트/포커스 처리 비용이 발생하지 않음
 *
 * closeDisabled 정책:
 * - true면 닫기 요청(ESC/Backdrop/닫기 버튼)을 무시
 * - 저장/전송 중 "의도치 않은 닫힘"으로 데이터 손실이 생기는 UX를 방지
 */
export function Modal({ open, title, children, onClose, closeDisabled = false }: ModalProps) {

    /**
     * panelRef
     * - 포크스 트랩/초기 포커싱/탭 순환 처리의 기준이 되는 모달 패널 DOM 참조
     */
    const panelRef = useRef<HTMLDivElement | null>(null)

    /**
     * lastFocusedRef
     * - 모달이 열리기 직전 포커스 요소를 저장하여 닫힘 시 복원
     */
    const lastFocusedRef = useRef<HTMLElement | null>(null)

    /**
     * backdropPointerIdRef
     *
     * 목적:
     * - backdrop 클릭 닫기에서 "down/up이 같은 포인터인지"를 확인하기 위한 추적 값
     *
     * 포인트:
     * - 드래그/스크롤/포인터 캔슬 상황에서 오작동(원치 않는 닫힘)을 줄임
     */
    const backdropPointerIdRef = useRef<number | null>(null)

    /**
     * titleId
     * - aria-labelledby 연결을 위한 고유 ID
     * - React 18의 useId는 SSR/CSR에서도 충돌 가능성을 낮추는 용도로 사용
     */
    const titleId = useId()

    /**
     * requestClose
     * - 모든 닫기 트리거(ESC/Backdrop/버튼)가 공유하는 "닫기 요청" 엔트리 포인트
     * - closeDisabled 정책을 단일 지점에서 강제하여 상호작용 일관성을 유지
     */
    const requestClose = useCallback((): void => {
        if (closeDisabled) return
        onClose()
    }, [closeDisabled, onClose])

    /**
     * handleKeyDown
     *
     * 역할:
     * - ESC: 모달 닫기
     * - TAB/Shift+Tab: 모달 패널 내부에서 포커스가 순환하도록 포커스 트랩 적용
     *
     * 포인트:
     * - focusable이 없으면 panel에 포커스를 두어 키보드 사용자가 "포커스 상실" 상태가 되지 않게 함
     */
    function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
        const panel = panelRef.current
        if (!panel) return

        if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            requestClose()
            return
        }

        if (event.key !== "Tab") return

        const focusables = getFocusableElements(panel)
        if (focusables.length === 0) {
            event.preventDefault()
            panel.focus()
            return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement

        if (event.shiftKey) {
            if (active === first || !panel.contains(active)) {
                event.preventDefault()
                last.focus()
            }
            return
        }

        if (active === last) {
            event.preventDefault()
            first.focus()
        }
    }

    /**
     * Backdrop pointer handlers
     *
     * 정책:
     * - backdrop 영역(자식이 아닌 현재 타겟)에 대한 "닫기 클릭"만 닫기 트리거로 인정
     * - pointer down/up이 동일 포인터이고 동일 타겟일 때만 닫힘
     */
    function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
        if (event.target !== event.currentTarget) {
            backdropPointerIdRef.current = null
            return
        }

        backdropPointerIdRef.current = event.pointerId
    }

    function handleBackdropPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
        const isSamePointer = backdropPointerIdRef.current === event.pointerId
        const isBackdropTarget = event.target === event.currentTarget
        backdropPointerIdRef.current = null

        if (!isSamePointer || !isBackdropTarget) return
        requestClose()
    }

    function handleBackdropPointerCancel(): void {
        backdropPointerIdRef.current = null
    }

    /**
     * open 효과: 포커스 저장/초기 포커싱/복원
     *
     * 역할:
     * - 모달 오픈 시:
     *   - 마지막 포커스 요소를 저장하고 모달 내부 첫 포커스 요소로 이동
     * - 모달 언마운트(닫힘) 시:
     *   - 저장된 포커스로 복원
     */
    useEffect(() => {
        if (!open) return

        lastFocusedRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null

        const panel = panelRef.current
        if (!panel) return

        const focusables = getFocusableElements(panel)
        const firstFocusable = focusables[0] ?? panel
        firstFocusable.focus()

        return () => {
            restoreFocusSafely(lastFocusedRef.current)
        }
    }, [open])

    /**
     * body 스크롤 잠금
     * - 모달이 열린 동안 배경 스크롤을 비활성화
     * - 모달 종료 시 원래 상태를 복원
     */
    useEffect(() => {
        if (!open) return

        lockBodyScroll()
        return () => unlockBodyScroll()
    }, [open])

    /**
     * 렌더링 정책
     * - open=false면 null 반환(비활성 상태에서 불필요한 이벤트/DOM 비용 제거)
     * - SSR 환경(document 없음)에서는 렌더링하지 않음
     */
    if (!open) return null
    if (typeof document === "undefined") return null

    /**
     * Portal 렌더링
     * - 모달은 document.body 하위에 렌더링하여,
     *   부모 컨테이너의 overflow/transform/z-index 컨텍스트 영향을 최소화
     */
    return createPortal((
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onKeyDown={handleKeyDown}
            onPointerDown={handleBackdropPointerDown}
            onPointerUp={handleBackdropPointerUp}
            onPointerCancel={handleBackdropPointerCancel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md sm:rounded-2xl"
            >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/25 px-5 py-4 backdrop-blur-sm">
                    <h3 id={titleId} className="text-lg font-bold text-white">{title}</h3>
                    <button
                        type="button"
                        className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                        onClick={requestClose}
                        disabled={closeDisabled}
                    >
                        닫기
                    </button>
                </div>
                <div className="min-h-0 overflow-y-auto px-5 py-4 text-white/90">{children}</div>
            </div>
        </div>
    ), document.body)
}
