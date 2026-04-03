// src/shared/types/geo.ts

/**
 * geo.ts (Shared Types - 지리 좌표 타입)
 *
 * 역할/목적:
 * - 지도 표시 및 API 통신에 공통으로 사용되는 지리 좌표 타입을 정의
 * - BBox 튜플과 BBoxSWNE 객체 형태를 모두 제공하여 다양한 사용 맥락을 지원
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · BBox      - [south, west, north, east] 순서의 경계 박스 튜플 타입
 *      · BBoxSWNE  - south/west/north/east 명명 필드를 갖는 경계 박스 객체 타입
 * - BBox 순서(south, west, north, east)는 서버 API 계약이므로 변경 시 API 팀과 협의 필요
 *
 * 운영 포인트:
 * - BBox 필드 순서가 변경되면 이 파일을 사용하는 모든 변환 함수를 함께 수정 필요
 */

/**
 * 지도/API 공용 경계 박스 튜플 타입
 *
 * - 순서: [south, west, north, east]
 * - 서버 API 계약이므로 순서 변경 시 API 팀과 협의 필요
 */
export type BBox = [number, number, number, number]

/**
 * API 유틸리티에서 사용하는 명명 필드 기반 경계 박스 객체 타입
 *
 * - BBox 튜플과 동일한 계약이지만 필드명으로 접근하여 가독성 향상
 * - 튜플과 객체 간 변환 시 south/west/north/east 순서를 참조
 */
export type BBoxSWNE = {
    south: number
    west: number
    north: number
    east: number
}
