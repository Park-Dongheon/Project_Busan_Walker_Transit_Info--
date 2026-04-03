// src/domains/attraction/ui/intro/index.ts

/**
 * index.ts (UI Layer - attraction 소개 UI 진입점)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지 전용 UI 컴포넌트들을 단일 경로로 노출
 * - 하위 UI 파일들을 re-export하여 외부 소비자가 내부 경로를 몰라도 됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionCardSkeleton   - 로딩 중 표시하는 관광지 카드 스켈레톤
 *      · AttractionIntroCard      - 소개 페이지 관광지 카드 컴포넌트
 *      · AttractionsIntroGrid     - 소개 페이지 카드 그리드 컨테이너
 *      · AttractionsIntroHero     - 소개 페이지 히어로/검색 헤더 컴포넌트
 *
 * 운영 포인트:
 * - 새로운 소개 페이지 UI 컴포넌트가 추가되면 이 파일에 export * from 추가
 */

export * from './AttractionCardSkeleton'
export * from './AttractionIntroCard'
export * from './AttractionsIntroGrid'
export * from './AttractionsIntroHero'