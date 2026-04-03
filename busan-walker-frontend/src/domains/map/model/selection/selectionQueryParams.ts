// src/domains/map/model/selection/selectionQueryParams.ts

/**
 * selectionQueryParams.ts (선택 상태 - URL Query 계약 상수 및 정규화 유틸)
 *
 * 역할/목적:
 * - map 도메인의 "선택 상태 / 복원 상태" URL query key를 한 곳에서 정의
 * - 선택 핀 id 같은 공통 query 값을 같은 규칙으로 정규화하도록 SSOT 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · SELECTED_PIN_QUERY_KEY           - 선택된 핀 ID query key
 *      · SELECTED_BBOX_QUERY_KEY          - 선택 핀 기준 BBox 스냅샷 query key
 *      · TRANSIT_PANEL_COLLAPSED_QUERY_KEY - 교통 패널 접힘 상태 query key
 *      · RESET_VIEW_LAT_QUERY_KEY         - 선택 해제 시 복원할 위도 query key
 *      · RESET_VIEW_LNG_QUERY_KEY         - 선택 해제 시 복원할 경도 query key
 *      · RESET_VIEW_ZOOM_QUERY_KEY        - 선택 해제 시 복원할 줌 query key
 *      · normalizeSelectedPinId           - 선택 핀 id trim 및 빈 값 null 흡수 유틸
 * - 각 훅의 개별 상태 전이 로직은 숨기고, query key와 최소 정규화 유틸만 제공
 *
 * 동작 방식:
 * - URL에 저장되는 query key 이름을 상수로 관리
 * - 선택 핀 id는 trim 후 빈 문자열이면 null로 흡수
 *
 * 운영 포인트:
 * - query key 이름이 바뀌면 useMapContainerInteraction, useSelectedBboxState를 함께 점검
 * - URL 복원 규칙이 늘어나면 여기서 계약을 추가하고, 각 훅은 해석 책임만 가지도록 유지
 */

export const SELECTED_PIN_QUERY_KEY = "sid"
export const SELECTED_BBOX_QUERY_KEY = "sbbox"
export const TRANSIT_PANEL_COLLAPSED_QUERY_KEY = "spc"
export const RESET_VIEW_LAT_QUERY_KEY = "srlat"
export const RESET_VIEW_LNG_QUERY_KEY = "srlng"
export const RESET_VIEW_ZOOM_QUERY_KEY = "srz"

/**
 * 선택 핀 id 값을 정규화
 *
 * - URL query에서 읽은 값이 문자열이 아니거나 공백만 있으면 null을 반환
 * - 유효한 문자열이면 trim 후 반환
 */
export function normalizeSelectedPinId(value: string | null): string | null {
    if (typeof value !== "string") return null

    const trimmed = value.trim()

    return trimmed.length > 0 ? trimmed : null
}