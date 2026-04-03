// src/shared/types/paging.ts

/**
 * paging.ts (Shared Types - 페이지네이션 응답 계약 타입)
 *
 * 역할/목적:
 * - 백엔드 ApiPage<T> 응답 구조와 정확히 일치하는 프론트엔드 타입을 정의
 * - 프로젝트 전역 페이지네이션 SSOT(Single Source of Truth)로 관리
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · PageResp<T>  - 백엔드 ApiPage<T>와 동일한 페이지네이션 응답 인터페이스
 *      · ApiPage<T>   - PageResp<T>의 별칭 (백엔드 명명 선호 팀을 위한 편의 타입)
 * - 이 타입은 최소하고 안정적으로 유지 (불필요한 필드 추가 금지)
 *
 * 운영 포인트:
 * - 백엔드 ApiPage 스키마가 변경되면 이 파일의 PageResp를 먼저 수정
 * - PageResp와 ApiPage는 의도적으로 동일한 계약을 공유하므로 둘 중 하나만 수정하면 안 됨
 */

/**
 * 백엔드 페이지네이션 응답 인터페이스 (백엔드 ApiPage<T>와 동일한 구조)
 *
 * - 백엔드 ApiPage<T> 스키마를 정확히 따르며, 프로젝트 전역 페이지네이션 SSOT
 * - 최소하고 안정적으로 유지 (새 필드 추가는 백엔드 스키마 변경 시에만 반영)
 */
export interface PageResp<T> {
    content: T[]
    page: number
    size: number
    totalElements: number
    totalPages: number
}

/**
 * PageResp의 별칭 타입 (백엔드 명명 방식을 선호하는 경우를 위한 편의 타입)
 *
 * - PageResp와 ApiPage는 의도적으로 동일한 계약을 공유
 * - 두 타입은 상호 교환 가능하므로 팀 컨벤션에 맞는 것을 선택하여 사용
 */
export type ApiPage<T> = PageResp<T>
