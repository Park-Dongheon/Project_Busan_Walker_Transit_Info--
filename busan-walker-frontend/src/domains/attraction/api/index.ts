// src/domains/attraction/api/index.ts

/**
 * index.ts (API Layer - attraction API 진입점)
 *
 * 역할/목적:
 * - attraction 도메인의 모든 공개 API 함수, 훅, 타입을 단일 경로로 노출
 * - 하위 API 파일(intro.ts, attractions.ts)을 re-export하여 외부 소비자가 내부 경로를 몰라도 됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · intro.ts 전체        - 소개 카드 페이징 API/훅/타입
 *      · attractions.ts 전체  - 목록/상세 API/훅/타입
 *
 * 운영 포인트:
 * - 새로운 attraction API 파일이 추가되면 이 파일에 export * from 한 줄만 추가
 */

export * from './intro'
export * from './attractions'