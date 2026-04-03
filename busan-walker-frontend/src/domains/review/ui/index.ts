// src/domains/review/ui/index.ts

/**
 * index.ts (UI Layer - 리뷰 UI 공개 진입점)
 *
 * 역할/목적:
 * - 리뷰 도메인 UI 컴포넌트와 관련 타입을 외부에 공개하는 배럴(barrel) 엔트리.
 * - 상위 레이어(페이지/컨테이너)는 내부 파일 경로를 직접 참조하지 않고 이 경로로 가져간다.
 *
 * 공개 정책 / 설계 원칙:
 * - 화면에서 사용하는 컴포넌트와 그 props 타입만 노출한다.
 * - api/lib 레이어 내부 구현은 이 엔트리를 통해 노출하지 않는다.
 * - 내부 파일 이동·분리 시에도 이 엔트리의 export 목록을 유지하면 import 경로가 흔들리지 않는다.
 */
export * from "./ReviewCard"
export * from "./ReviewCommentForm"
export * from "./ReviewCommentList"
export * from "./ReviewFormModal"
export * from "./ReviewList"
export * from "./ReviewListPanel"
export * from "./ReviewSection"
export * from "./ReviewToolbar"
