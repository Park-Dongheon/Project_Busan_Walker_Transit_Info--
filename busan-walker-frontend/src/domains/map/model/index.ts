// src/domains/map/model/index.ts

/**
 * index.ts (map/model - 지도 도메인 모델 계층 재내보내기)
 *
 * attractions, detail, selection, transit, view 하위 모듈의 공개 훅 전체를
 * 단일 진입점으로 노출
 */

export { useAttractionPinMarkers } from './attractions'
export { useAttractionPins } from './attractions'
export { usePrefetchAttractionDetail } from './detail'
export { useSelectedAttractionDetail } from './detail'
export { useSelectedBboxState } from './selection'
export { useResolvedTransitOptions } from './transit'
export { useTransitOverlay } from './transit'
export { useTransitPanelItems } from './transit'
export { useMapContainerInteraction } from './view'
export { useMapResizeObserver } from './view'
export { useMapViewSync } from './view'
export { useNaverMap } from './view'