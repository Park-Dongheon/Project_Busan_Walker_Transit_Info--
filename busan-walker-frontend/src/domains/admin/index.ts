// src/domains/admin/index.ts

/**
 * admin/index.ts (admin 도메인 공개 API 표면 / Domain Barrel)
 *
 * 역할/목적:
 * - admin 도메인 전체의 공개 인터페이스를 외부 단일 진입점으로 통합
 * - 도메인 외부에서는 이 파일 하나만 import하면 api 전체에 접근 가능
 *
 * 공개 정책 / 설계 원칙:
 * - api: export * as api 형태로 네임스페이스 객체로 노출
 * - 도메인 내부 구현 세부사항은 외부에서 직접 접근 x
 *
 * 운영 포인트:
 * - 신규 서브모듈 추가 시 이 파일에도 export를 함께 등록해야 외부 접근 가능
 */

export type { AttractionImageUploadResponse } from './api'
export * as api from './api'
