// src/domains/attraction/model/index.ts

/**
 * index.ts (Model Layer - attraction 모델 진입점)
 *
 * 역할/목적:
 * - attraction 도메인의 모든 공개 모델 훅과 타입을 단일 경로로 노출
 * - 하위 모델 폴더(intro 등)를 re-export하여 외부 소비자가 내부 경로를 몰라도 됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · intro/* 전체  - 소개 페이지 URL 파라미터 상태 훅(useIntroSearchParams) 및 관련 타입
 *
 * 운영 포인트:
 * - 새로운 attraction 모델 폴더/파일이 추가되면 이 파일에 export * from 한 줄만 추가
 */

export * from './intro'