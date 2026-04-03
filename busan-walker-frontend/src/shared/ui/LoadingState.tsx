// src/shared/ui/LoadingState.tsx

/**
 * LoadingState.tsx (Shared UI - 로딩 상태 텍스트 컴포넌트)
 *
 * 역할/목적:
 * - 데이터 조회, 페이지 전환, 비동기 작업 중 "로딩 상태"를 사용자에게 명확히 전달하는
 *   전역 재사용 텍스트 컴포넌트
 * - 화면마다 제각각 로딩 문구/스타일을 작성하지 않고 공통 UX를 유지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · LoadingStateProps  - 컴포넌트 props 타입
 *      · LoadingState       - 로딩 상태 텍스트 컴포넌트
 * - role="status" + aria-live="polite"로 보조기기에 비간섭적으로 상태를 안내
 *
 * 동작 방식:
 * - message prop으로 로딩 문구를 커스터마이징 가능(기본값: "불러오는 중...")
 * - className prop으로 배치/여백/텍스트 스타일을 상황에 맞게 조정 가능
 *
 * 운영 포인트:
 * - 스피너 아이콘 등 시각 요소가 필요하면 상위에서 감싸거나 확장 컴포넌트를 별도 제작
 * - 동일 aria-live 영역이 너무 자주 바뀌면 스크린리더가 반복 안내할 수 있으므로
 *   상위에서 조건부 렌더링을 명확히 관리
 */

import type { ReactElement } from "react";

/**
 * LoadingState
 *
 * 역할/목적:
 * - 데이터 조회, 페이지 전환, 비동기 작업 중 "로딩 상태"를 사용자에게 명확히 전달하기 위한
 *   전역 재사용 텍스트 컴포넌트
 * - 화면마다 제각각 로딩 문구/스타일을 작성하지 않고, 공통 UX를 유지
 *
 * 접근성 정책:
 * - role="status"
 *   → 스크린리더가 "상태 메시지"로 인식
 * - aria-live="polite"
 *   → 기존 읽기 흐름을 방해하지 않고, 자연스럽게 로딩 메시지를 안내
 *
 * 사용 정책:
 * - 단순 텍스트 기반 로딩 상태에 사용
 * - 스피너 아이콘 등 시각적 요소가 필요하다면,
 *   상위에서 감싸거나 확장 컴포넌트를 만들어 사용하는 것이 적절
 *
 * 주의:
 * - 동일한 aria-live 영역이 너무 자주 바뀌면 스크린리더가 반복 안내를 할 수 있으므로,
 *   불필요한 re-render가 발생하지 않도록 상위에서 조건부 렌더링을 명확히 관리
 * - 전체 페이지 블로킹 로딩(예: Suspense fallback)과 부분 영역 로딩은 구분해서 사용하는 것이 좋음
 */
export type LoadingStateProps = {
    /**
     * 화면에 표시할 로딩 메시지
     * - 기본값: "불러오는 중..."
     */
    message?: string

    /**
     * 루트 div에 적용할 Tailwind 클래스
     * -기본값: 세로 여백 + 중앙 정렬 + 작은 흰색 텍스트
     */
    className?: string
}

/**
 * 앱 전역에서 재사용하는 로딩 상태 텍스트 컴포넌트.
 * - role/status + aria-live를 통해 보조기기에 로딩 상태 전달
 */
export function LoadingState({
    message = "불러오는 중...",
    className = "py-8 text-center text-sm text-white/80",
}: LoadingStateProps): ReactElement {
    return (
        <div role="status" aria-live="polite" className={className}>
            {message}
        </div>
    )
}
