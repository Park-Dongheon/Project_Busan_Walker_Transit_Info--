// src/domains/map/model/selection/index.ts

/**
 * index.ts (map/model/selection - 선택 상태 모델 재내보내기)
 *
 * 지도 핀 선택 상태와 BBox 스냅샷 관련 query key 상수,
 * 정규화 유틸, 훅을 단일 진입점으로 노출
 */

export {
    normalizeSelectedPinId,
    RESET_VIEW_LAT_QUERY_KEY,
    RESET_VIEW_LNG_QUERY_KEY,
    RESET_VIEW_ZOOM_QUERY_KEY,
    SELECTED_BBOX_QUERY_KEY,
    SELECTED_PIN_QUERY_KEY,
    TRANSIT_PANEL_COLLAPSED_QUERY_KEY
} from './selectionQueryParams';
export { useSelectedBboxState } from './useSelectedBboxState';