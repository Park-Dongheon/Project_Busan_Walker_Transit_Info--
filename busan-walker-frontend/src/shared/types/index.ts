// src/shared/types/index.ts

/**
 * shared/types/index.ts (공용 타입 Barrel)
 *
 * 역할/목적:
 * - 프로젝트 전역에서 사용하는 공통 타입을 단일 경로로 재노출
 *
 * 공개 정책 / 설계 원칙:
 * - Nullable, PageResp/ApiPage, BBox/BBoxSWNE 등 실제로 여러 도메인에서 공유되는 타입만 노출
 * - 특정 도메인에 종속된 타입은 각 도메인의 types/index.ts를 통해 노출
 * - 타입만 export하므로 런타임 번들에 영향 없음
 */

export type { Nullable } from "@/shared/types/common"
export type { PageResp, ApiPage } from "@/shared/types/paging"
export type { BBox, BBoxSWNE } from "@/shared/types/geo"
