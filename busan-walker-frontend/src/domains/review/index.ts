// src/domains/review/index.ts

/**
 * review/index.ts (review 도메인 공개 API 표면 / Domain Barrel)
 *
 * 역할/목적:
 * - review 도메인의 타입, API 훅, 라이브러리, UI 컴포넌트를 단일 진입점으로 통합
 * - 외부 모듈은 이 파일 하나만 import해 review 도메인의 모든 공개 심볼에 접근
 *
 * 공개 정책 / 설계 원칙:
 * - types: export * (타입만 직접 노출하여 import 경로를 단순화)
 * - api·lib·ui: export * as X (네임스페이스로 묶어 심볼 충돌을 방지하고 출처를 명확히)
 *
 * 동작 방식:
 * - import { api as reviewApi } from '@/domains/review' 처럼 네임스페이스 접근
 * - 타입은 import type { ReviewCardResponse } from '@/domains/review' 로 직접 참조
 *
 * 운영 포인트:
 * - 새 서브모듈 추가 시 이 파일에 export를 함께 등록해야 외부에서 접근 가능
 * - 내부 구현 파일을 직접 import하는 것은 도메인 캡슐화 정책 위반
 */

export * from "./types"
export * as api from "./api"
export * as lib from "./lib"
export * as ui from "./ui"