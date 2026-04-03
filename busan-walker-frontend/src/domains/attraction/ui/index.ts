// src/domains/attraction/ui/index.ts

/**
 * index.ts (UI Layer - attraction UI 진입점)
 *
 * 역할/목적:
 * - attraction 도메인의 모든 공개 UI 컴포넌트를 단일 경로로 노출
 * - 하위 UI 파일(AttractionCard, AttractionCarousel, intro/*)을 re-export하여
 *   외부 소비자가 내부 경로를 몰라도 됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionCard       - 목록/캐러셀용 관광지 요약 카드 컴포넌트 (default export를 named로 노출)
 *      · AttractionCarousel   - 관광지 카드 캐러셀 컴포넌트
 *      · intro/* 전체         - 소개 페이지 전용 UI 컴포넌트 일체
 *
 * 운영 포인트:
 * - 새로운 attraction UI 컴포넌트가 추가되면 이 파일에 export 추가
 */

export { default as AttractionCard } from './AttractionCard'
export * from './AttractionCarousel'
export * from './intro'