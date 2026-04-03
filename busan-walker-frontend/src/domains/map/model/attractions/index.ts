// src/domains/map/model/attractions/index.ts

/**
 * index.ts (map/model/attractions - 관광지 핀 모델 훅 재내보내기)
 *
 * 지도 핀 데이터 조회 훅과 네이버 지도 Marker 동기화 훅을
 * 단일 진입점으로 노출
 */

export { useAttractionPinMarkers } from './useAttractionPinMarkers'
export { useAttractionPins } from './useAttractionPins'