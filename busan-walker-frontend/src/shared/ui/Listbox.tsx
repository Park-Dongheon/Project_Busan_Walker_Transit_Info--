// src/shared/ui/Listbox.tsx

/**
 * Listbox.tsx (Shared UI - 커스텀 드롭다운 선택 컴포넌트)
 *
 * 역할/목적:
 * - 기본 <select>를 대체하는 접근성 있는 커스텀 리스트 박스 컴포넌트
 * - 디자인 시스템의 스타일 커스터마이징 요구를 충족하면서,
 *   키보드 탐색과 ARIA 속성을 통해 스크린리더 호환성을 확보
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · ListboxOption  - 단일 옵션 타입 (label/value 쌍)
 *      · ListboxProps   - 컴포넌트 props 타입
 *      · Listbox        - 커스텀 드롭다운 컴포넌트 (기본 export 포함)
 * - value/onChange로 Controlled 방식 운영, 내부 UI 상태(open/activeIndex)만 자체 관리
 * - 스타일은 buttonClassName/listClassName으로 호출 측에서 완전히 교체 가능
 *
 * 동작 방식:
 * - 버튼 클릭 또는 키보드(Enter/Space/ArrowUp/ArrowDown)로 목록 열기
 * - 열린 상태에서 Arrow/Home/End로 activeIndex 이동, Enter/Space로 선택 확정
 * - 외부 클릭(mousedown) 또는 포커스 이탈(focusin) 시 목록 자동 닫힘
 * - active 옵션이 스크롤 영역 밖에 있으면 scrollIntoView로 자동 스크롤
 *
 * 운영 포인트:
 * - 단일 선택(Single-select)만 지원하며, 다중 선택은 별도 구현 필요
 * - options value는 문자열 타입으로 제한 — 라우팅/쿼리스트링/필터 키와의 호환성 의도
 * - open 상태에서만 전역 이벤트 리스너를 등록하여 불필요한 비용 방지
 */

import React, { useEffect, useId, useRef, useState } from "react"

/**
 * ListboxOption
 * - Listbox에 표시되는 단일 옵션
 * - label: 화면에 표시할 텍스트
 * - value: 선택 결과로 확정되는 값(문자열 타입으로 제한하여 라우팅/쿼리스트링/필터 키와의 호환성을 높임)
 */
export type ListboxOption<T extends string = string> = {
    label: string
    value: T
}

/**
 * ListboxProps
 *
 * 역할/목적:
 * - 기본 <select>를 대체하는 "커스텀 리스트 박스" 컴포넌트
 * - 디자인 시스템/스타일 요구사항(버튼/리스트 클래스 커스터마이징)을 만족하면서도,
 *   키보드 조작과 기본 ARIA 속성을 제공해 접근성을 확보
 *
 * 상태 관리 정책:
 * - value/onChange는 외부에서 제어하는 Controlled 컴포넌트 형태
 * - open(드롭다운 열림 여부), activeIndex(키보드/호버로 이동 중인 옵션)는 내부 UI 상태로 관리
 *
 * 스타일 확장 정책:
 * - className: 루트 컨테이너(배치/간격/레이아웃 확장)
 * - buttonClassName: 트리거 버튼 스타일
 * - listClassName: 옵션 목록(드롭다운) 스타일
 *
 * 접근성 포인트:
 * - 버튼: aria-haspopup="listbox", aria-expanded, aria-controls(열렸을 때) 제공
 * - 목록: role="listbox", 옵션: role="option", aria-selected 제공
 * - ariaLabel이 제공되면 버튼의 aria-label로 우선 사용하고, 없으면 선택된 라벨/placeholder로 대체
 *
 * 주의
 * - 이 구현은 "단일 선택(Single-select)"만 지원
 * - 옵션 value는 문자열 타입으로 제한되어 있으며, 외부에서 값 매핑을 관리하는 구조가 적합
 */
export type ListboxProps<T extends string = string> = {
    id?: string
    value: T
    onChange: (v: T) => void
    options: readonly ListboxOption<T>[]
    className?: string
    buttonClassName?: string
    listClassName?: string
    placeholder?: string
    disabled?: boolean
    ariaLabel?: string
}

/**
 * resolveInitialActiveIndex
 *
 * 역할:
 * - 현재 value에 해당하는 옵션 인덱스를 찾아 "활성(active) 인덱스" 초기값으로 사용
 *
 * 정책:
 * - options가 비어있으면 -1(활성 없음)
 * - value가 목록에 없으면 0(첫 항목을 활성으로 두어 키보드 탐색 시작점을 확보)
 */
function resolveInitialActiveIndex<T extends string>(
    options: readonly ListboxOption<T>[],
    value: T
): number {
    if (options.length === 0) return -1

    const idx = options.findIndex((o) => o.value === value)
    return idx >= 0 ? idx : 0
}

/**
 * Listbox
 *
 * 동작 개요:
 * - 버튼 클릭 또는 키보드(Enter/Space/ArrowUp/ArrowDown)로 목록을 열 수 있음
 * - 열려있는 동안:
 *   - ArrowUp/ArrowDown: activeIndex 이동(순환)
 *   - Home/End: 첫/끝으로 이동
 *   - Enter/Space: activeIndex 항목을 선택(커밋)
 *   - Escape: 닫고 버튼으로 포커스 복귀
 *   - Tab: 닫고 자연스러운 포커스 이동 허용
 *
 * 외부 상호작용 정책:
 * - 드롭다운이 열린 상태에서 컴포넌트 밖을 클릭하거나(focusin 포함) 포커스가 외부로 이동하면 닫음
 *
 * UX 포인트:
 * - open 상태 + activeIndex 변경 시, active 옵션이 목록 밖에 있으면 scrollIntoView로 화면에 보이도록 함
 */
export function Listbox<T extends string>({
    id,
    value,
    onChange,
    options,
    className = "",
    buttonClassName = "",
    listClassName = "",
    placeholder = "선택",
    disabled = false,
    ariaLabel,
}: ListboxProps<T>) {
    /**
     * ID 정책
     * - 접근성/연결성을 위해 버튼/리스트/옵션에 일관된 id를 부여
     * - id가 주어지면 이를 사용하고, 없으면 useId 기반 자동 id를 생성
     */
    const autoId = useId()
    const baseId = id ?? `listbox-${autoId}`
    const buttonId = `${baseId}-button`
    const listId = `${baseId}-listbox`

    /**
     * ref
     * - rootRef: 외부 클릭/포커스 감지를 위해 컴포넌트 루트를 참조
     * - btnRef : 선택 커밋/닫기 후 버튼으로 포커스 복귀에 사용
     * - listRef: active 옵션 스크롤 이동(scrollIntoView)에 사용
     */
    const rootRef = useRef<HTMLDivElement | null>(null)
    const btnRef = useRef<HTMLButtonElement | null>(null)
    const listRef = useRef<HTMLUListElement | null>(null)

    /**
     * open
     * - 드롭다운 열림 상태
     *
     * activeIndex
     * - 키보드/마우스 호버 기준으로 "현재 활성화된 옵션 인덱스"
     * - 선택(value)과는 다르며, Enter/Space/클릭 시 commitIndex로 value가 확정
     */
    const [open, setOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState<number>(() =>
        resolveInitialActiveIndex(options, value)
    )

    /**
     * canInteract
     * - disabled 이거나 options가 비어있으면 상호작용(열기/이동/선택)을 막음
     * - 버튼 disabled 처리에도 동일  조건을 사용해 UX 일관성을 유지
     */
    const canInteract = !disabled && options.length > 0

    /**
     * value/options 변경 시 activeIndex 동기화
     * - 외부에서 value가 바뀌거나(Controlled), options가 바뀌면
     *   현재 활성 인덱스를 다시 계산하여 키보드 탐색 시작점이 올바르게 유지
     */
    useEffect(() => {
        setActiveIndex(resolveInitialActiveIndex(options, value))
    }, [value, options])

    /**
     * 외부 클릭/포커스 이탈 감지(열림 상태에서만 활성)
     * - document 레벨에서 mousedown/focusin을 감지하고,
     *   이벤트 타겟이 rootRef 내부가 아니면 목록을 닫음
     *
     * 주의:
     * - open일 때만 리스너를 등록/해제하여 불필요한 전역 이벤트 비용을 줄임
     */
    useEffect(() => {
        if (!open) return

        function closeIfOutside(target: EventTarget | null) {
            const node = target as Node | null
            if (!node) return
            if (rootRef.current?.contains(node)) return
            setOpen(false)
        }

        function onDocMouseDown(e: MouseEvent) {
            closeIfOutside(e.target)
        }

        function onDocFocusIn(e: FocusEvent) {
            closeIfOutside(e.target)
        }

        document.addEventListener("mousedown", onDocMouseDown)
        document.addEventListener("focusin", onDocFocusIn)

        return () => {
            document.removeEventListener("mousedown", onDocMouseDown)
            document.removeEventListener("focusin", onDocFocusIn)
        }
    }, [open])

    /**
     * active 옵션 자동 스크롤
     * - 목록이 열려 있고(activeIndex >= 0),
     *   active 옵션이 스크롤 영역 밖으로 나가면 scrollIntoView({ block: "nearest" })로 보이게 함
     */
    useEffect(() => {
        if (!open) return
        if (activeIndex < 0) return

        const el = listRef.current?.querySelectorAll("[role=option]")[activeIndex] as
            | HTMLElement
            | undefined
        if (el) el.scrollIntoView({ block: "nearest" })
    }, [open, activeIndex])

    /**
     * 목록 닫기
     * - open=false로 전환
     */
    function closeList() {
        setOpen(false)
    }

    /**
     * 목록 열기
     * - 상호작용 가능(canInteract)할 때만 open=true
     * - activeIndex가 유효하지 않으면(예: -1) 0으로 보정하여 키보드 조작 시작점을 확보
     */
    function openList() {
        if (!canInteract) return
        setOpen(true)
        setActiveIndex((prev) => {
            if (prev >= 0) return prev
            return 0
        })
    }

    /**
     * 목록 토글
     * - 버튼 클릭으로 열림/닫힘 전환
     */
    function toggleOpen() {
        if (!canInteract) return
        setOpen((s) => !s)
    }

    /**
     * moveActive
     *
     * 역할:
     * - ArrowUp/ArrowDown으로 activeIndex를 이동
     *
     * 정책:
     * - options가 비면 -1 유지
     * - activeIndex가 -1이면 이동 방향에 따라 0 또는 마지막으로 보정
     * - 이후에는 (prev + step + length) % length로 순환 이동
     */
    function moveActive(step: 1 | -1) {
        if (!canInteract) return

        setActiveIndex((prev) => {
            if (options.length === 0) return -1
            if (prev < 0) return step > 0 ? 0 : options.length - 1
            return (prev + step + options.length) % options.length
        })
    }

    /**
     * commitIndex
     *
     * 역할:
     * - 특정 인덱스의 옵션을 "선택 확정"하고 onChange로 외부 value를 갱신하도록 위임
     *
     * 동작:
     * - onChange(value) 호출 → 목록 닫기 → 버튼으로 포커스 복귀(키보드 UX)
     */
    function commitIndex(idx: number) {
        const opt = options[idx]
        if (!opt) return
        onChange(opt.value)
        closeList()
        btnRef.current?.focus()
    }

    /**
     * onKeyDown
     *
     * 키보드 정책
     * - Tab    : 목록을 닫고 기본 탭 이동을 허용(포커스 트랩을 만들지 않음)
     * - Arrow↓ : 목록이 닫혀 있으면 열고, activeIndex를 다음으로 이동
     * - Arrow↑ : 목록이 닫혀 있으면 열고, activeIndex를 이전으로 이동
     * - Home   : 첫 옵션 활성화
     * - End    : 마지막 옵션 활성화
     * - Enter/Space: 닫혀 있으면 열기, 열려 잇으면 activeIndex를 선택 확정
     * - Escape : 목록 닫기 + 버튼 포커스 복귀
     *
     * 주의:
     * - Arrow/Home/End/Enter/Space/Escape는 기본 브라우저 동작을 방지(e.preventDefault)하여
     *   스크롤/버튼 클릭 등 의도치 않은 동작을 막음
     */
    function onKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Tab") {
            closeList()
            return
        }

        if (!canInteract) return

        if (e.key === "ArrowDown") {
            e.preventDefault()
            if (!open) openList()
            moveActive(1)
            return
        }

        if (e.key === "ArrowUp") {
            e.preventDefault()
            if (!open) openList()
            moveActive(-1)
            return
        }

        if (e.key === "Home") {
            e.preventDefault()
            setActiveIndex(0)
            return
        }

        if (e.key === "End") {
            e.preventDefault()
            setActiveIndex(options.length - 1)
            return
        }

        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            if (!open) {
                openList()
                return
            }

            if (activeIndex >= 0) {
                commitIndex(activeIndex)
            }
            return
        }

        if (e.key === "Escape") {
            e.preventDefault()
            closeList()
            btnRef.current?.focus()
        }
    }

    /**
     * 현재 선택된 옵션 라벨 계산
     * - value와 일치하는 옵션이 있으면 label을 사용
     * - 없으면 placeholder를 표시
     */
    const selected = options.find((o) => o.value === value)
    const selectedLabel = selected?.label ?? placeholder

    return (
        <div ref={rootRef} className={["inline-block", className].filter(Boolean).join(" ")}>
            <div className="relative">
                <button
                    id={buttonId}
                    ref={btnRef}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    aria-label={ariaLabel ?? selectedLabel}
                    disabled={!canInteract}
                    className={buttonClassName}
                    onClick={toggleOpen}
                    onKeyDown={onKeyDown}
                >
                    <span className="truncate">{selectedLabel}</span>
                </button>

                {open ? (
                    <ul
                        id={listId}
                        role="listbox"
                        aria-labelledby={buttonId}
                        ref={listRef}
                        className={listClassName}
                        onKeyDown={onKeyDown}
                    >
                        {options.map((opt, idx) => {
                            const active = idx === activeIndex
                            const selectedOpt = opt.value === value

                            return (
                                <li
                                    id={`${baseId}-option-${idx}`}
                                    key={opt.value}
                                    role="option"
                                    aria-selected={selectedOpt}
                                    className={[
                                        "cursor-pointer px-3 py-2",
                                        active ? "bg-white/10" : "",
                                        selectedOpt ? "font-semibold" : "",
                                    ].join(" ")}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                    onClick={() => commitIndex(idx)}
                                >
                                    {opt.label}
                                </li>
                            )
                        })}
                    </ul>
                ) : null}
            </div>
        </div>
    )
}

export default Listbox
