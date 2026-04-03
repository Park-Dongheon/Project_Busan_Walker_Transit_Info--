// src/domains/attraction/model/intro/index.ts

/**
 * index.ts (Model Layer - intro 모델 진입점)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지 관련 모델 훅과 타입을 단일 경로로 노출
 * - 하위 모델 파일(useIntroSearchParams.ts)을 re-export하여 외부 소비자가 내부 경로를 몰라도 됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · IntroSearchParamsState  - 소개 페이지 URL 파라미터 상태 타입
 *      · useIntroSearchParams    - URL 기반 소개 페이지 파라미터 상태 훅
 *
 * 운영 포인트:
 * - 소개 페이지 모델 훅이 추가되면 이 파일에 export 추가
 */

export * from './useIntroSearchParams'