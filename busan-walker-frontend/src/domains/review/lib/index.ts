// src/domains/review/lib/index.ts

/**
 * index.ts (Lib Layer - 리뷰 lib 공개 진입점)
 *
 * 역할/목적:
 * - date.ts와 image.ts의 모든 공개 심볼을 단일 경로로 재내보낸다.
 * - 도메인 외부에서 import 경로를 단순하게 유지하기 위한 배럴(barrel) 파일이다.
 *
 * 공개 정책 / 설계 원칙:
 * - lib 레이어는 순수 함수(날짜 포맷, 이미지 유효성 검사)를 제공하며 API/UI를 의존하지 않는다.
 */
export * from "./date"
export * from "./image"
