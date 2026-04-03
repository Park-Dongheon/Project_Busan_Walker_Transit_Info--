// src/domains/map/model/detail/index.ts

/**
 * index.ts (map/model/detail - 관광지 상세 모델 훅 재내보내기)
 *
 * 선택된 관광지 상세 조회 훅과 상세 데이터 prefetch 훅을
 * 단일 진입점으로 노출
 */

export { usePrefetchAttractionDetail } from './usePrefetchAttractionDetail'
export { useSelectedAttractionDetail } from './useSelectedAttractionDetail'