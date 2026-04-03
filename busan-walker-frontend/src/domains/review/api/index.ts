// src/domains/review/api/index.ts

/**
 * index.ts (API Layer - 리뷰 API 레이어 공개 진입점)
 *
 * 역할/목적:
 * - queryKeys, queries, mutations, normalizers의 모든 공개 심볼을 단일 경로로 재내보냄
 * - 도메인 외부에서 import 경로를 단순하게 유지하기 위한 배럴(barrel) 파일
 *
 * 공개 정책 / 설계 원칙:
 * - api 레이어는 types를 의존할 수 있지만 ui를 직접 import하면 순환 의존 위험이 생김
 * - types → api → ui 순서의 단방향 의존을 유지
 */
export * from './queryKeys'
export * from './queries'
export * from './mutations'
export * from './normalizers'
