// src/domains/favorite/ui/FavoriteToggleButton.tsx

/**
 * FavoriteToggleButton.tsx (UI Layer - 즐겨찾기 토글 버튼 프리젠테이셔널 컴포넌트)
 *
 * 역할/목적:
 * - 즐겨찾기 상태(on/off)와 진행 중 여부를 시각적으로 표현하는 순수 UI 버튼 컴포넌트
 * - 비즈니스 로직(API 호출, 인증 판단, optimistic update)은 일체 담당하지 않음
 *
 * 공개 정책 / 설계 원칙:
 * - export: FavoriteToggleButton (default export, 단일 컴포넌트)
 * - props로 받는 onToggle 콜백에 인증/네트워크/에러 처리를 위임
 * - 상태 표현과 비즈니스 로직을 분리(SoC)하여 FavoriteButton 컨테이너와 역할을 명확히 구분
 *
 * 동작 방식:
 * - isFavorite: 즐겨찾기 상태에 따라 스타일(강조/비강조)과 라벨 전환
 * - isPending: 진행 중이면 disabled 처리 + aria-busy 속성으로 보조기기에 알림
 * - aria-pressed로 토글형 버튼임을 명확히 선언하여 키보드/스크린리더 접근성 확보
 *
 * 운영 포인트:
 * - data-state / data-busy 속성은 E2E/컴포넌트 테스트에서 상태 선택자로 활용 가능
 * - 스타일 변경 시 isFavorite 분기의 stateClass만 수정하면 전체 상태 표현에 반영됨
 */

type FavoriteToggleButtonProps = {
    /**
     * isFavorite
     * 
     * 의미:
     * - 현재 대상이 즐겨찾기 상태인지 여부
     * 
     * 사용:
     * - 접근성 상태(aria-pressed) 및 시각적 스타일(강조/비강조)에 반영
     */
    isFavorite: boolean

    /*
     * isPending
     * 
     * 의미:
     * - 토글 요청이 "진행 중"인지 여부(예: React Query mutation 진행 상태)
     * 
     * 정책:
     * - 진행 중에는 버튼을 disabled 처리하여 중복 동작을 막고, aria-busy로 보조기기에 상태를 전달
     */
    isPending?: boolean

    /**
     * disabled
     *
     * 의미:
     * - 상위 정책(식별자 무효, 권한 부족, 화면 상태 등)으로 토글을 막아야 할 때 전달되는 비활성 신호
     *
     * 정책:
     * - 내부의 최종 비활성 여부는 (isPending || disabled)로 결정
     */
    disabled?: boolean

    /**
     * onToggle
     * 
     * 역할:
     * - 사용자 클릭(또는 키보드 활성화)에 의해 토글을 요청하는 콜백
     * 
     * 주의:
     * - 이 콜백 내부에서 인증/네트워크/에러 정책을 처리하는 구조를 전제
     */
    onToggle: () => void
}

/**
 * FavoriteToggleButton (Presentational Component)
 * 
 * 역할/목적:
 * - "즐겨찾기 토글"을 수행하는 버튼 UI를 제공
 * - 이 컴포넌트는 상태를 표현만 하고, 실제 토글 로직/네트워크/권한 판단은 상위 컨테이너 담당
 *
 * 책임 범위(Separation of Concerns):
 * - 담당: 시각적 상태(스타일/텍스트) + 접근성 속성(pressed/busy/label) + 비활성(disabled) 표현
 * - 비담당: 로그인 여부 확인, API 호출, optimistic update 전략, 에러 처리/토스트, 캐시 무효화
 *
 * 접근성(Accessibility) 정책:
 * - button disabled는 네이티브 비활성화를 사용하여 키보드/스크린리더 일관성을 확보
 * - aria-pressed로 토글형 버튼임을 명확히 알림(상태: on/off)
 * - aria-busy로 진행 중 상태를 알림(네트워크/처리 중)
 * - aria-label은 화면 텍스트와 동일한 문구를 사용해 QA/테스트/번역에서 불일치를 줄임
 *
 * 테스트/자동화 포인트:
 * - data-state / data-busy는 E2E/컴포넌트 테스트에서 상태를 안정적으로 선택하기 위한 힌트로 사용 가능
 */
export default function FavoriteToggleButton({
    isFavorite,
    isPending = false,
    disabled = false,
    onToggle,
}: FavoriteToggleButtonProps) {
    /**
     * 라벨 정책:
     * - "현재 상태"에 대한 사용자 의도를 그대로 표현
     *   - 즐겨찾기 상태: 해제 액션을 제공
     *   - 비즐겨찾기 상태: 추가 액션을 제공
     * 
     * 진행 중 문구:
     * - 네트워크/처리 중임을 사용자에게 명확히 알리고, 연타를 유도하지 않게 함
     */
    const label = isFavorite ? "즐겨찾기 해제" : "즐겨찾기"
    const pendingLabel = "즐겨찾기 처리 중..."
    const isDisabled = isPending || disabled
    const buttonText = isPending ? pendingLabel : label

    /**
     * stateClass
     * 
     * 역할:
     * - 즐겨찾기 상태에 따라 시각적 강조도를 바꿔 "상태 피드백"을 제공
     * 
     * 포인트:
     * - 토글 UI는 상태 변화가 즉시 드러나는 것이 UX에 중요하므로,
     *   상태별로 대비가 분명한 스타일을 유지
     */
    const stateClass = isFavorite
        ? "border-amber-200/70 bg-amber-300/90 text-black hover:bg-amber-300"
        : "border-white/25 bg-white/10 text-white hover:bg-white/15"

    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={isDisabled}
            aria-pressed={isFavorite}
            aria-busy={isPending || undefined}
            aria-label={buttonText}
            data-state={isFavorite ? "on" : "off"}
            data-busy={isPending ? "true" : "false"}
            className={`rounded-full border px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-60 ${stateClass}`}
        >
            {buttonText}
        </button>
    )
}