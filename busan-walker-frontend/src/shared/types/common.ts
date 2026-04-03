// src/shared/types/common.ts

/**
 * common.ts (Shared Types - 공용 타입 유틸)
 *
 * 역할/목적:
 * - 여러 도메인에서 반복되는 기본 유틸리티 타입을 한 곳에서 관리
 * - 도메인에 종속되지 않는 범용 타입만 이 파일에 정의
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · Nullable<T>  - T | null 유니온 타입 (null 가능 필드에 사용)
 * - 특정 도메인에 종속된 타입은 각 도메인 types 파일에 정의
 *
 * 운영 포인트:
 * - 새로운 공용 유틸 타입은 도메인 비종속적임을 확인 후 이 파일에 추가
 */

/** T 또는 null을 허용하는 유틸리티 타입 - null 가능 필드를 명시적으로 표현할 때 사용 */
export type Nullable<T> = T | null
