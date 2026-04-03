// src/domains/auth/api/index.ts

/**
 * auth/api/index.ts (Auth API Barrel)
 *
 * 역할/목적:
 * - auth 도메인의 API 호출 함수를 단일 경로로 재노출
 *
 * 공개 정책 / 설계 원칙:
 * - auth.ts에 구현된 모든 함수를 export *로 그대로 노출
 * - 새 API 함수 추가 시 auth.ts에만 구현하면 이 barrel을 통해 자동으로 노출
 * - 호출부는 세부 파일을 직접 참조하지 않고 이 barrel을 통해 import
 */

export * from './auth'