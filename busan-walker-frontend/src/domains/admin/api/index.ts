// src/domains/admin/api/index.ts

/**
 * admin/api/index.ts (Admin API Barrel)
 *
 * 역할/목적:
 * - admin 도메인의 API 호출 함수를 단일 경로로 재노출
 *
 * 공개 정책 / 설계 원칙:
 * - adminAttractions.ts에 구현된 모든 함수·타입을 export *로 노출
 * - 호출부는 세부 파일을 직접 참조하지 않고 이 barrel을 통해 import
 */

export * from './adminAttractions'
