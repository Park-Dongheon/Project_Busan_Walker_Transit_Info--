// src/domains/map/ui/index.ts

/**
 * map/ui/index.ts (UI Barrel - map 도메인 UI 공개 진입점)
 *
 * map 도메인의 UI 컴포넌트를 한 경로로 묶어 재노출
 * 현재는 MapContainer를 barrel export로 연결해 외부에서 일관된 경로로 import
 * 새 UI 컴포넌트 추가 시 외부 공개 여부를 먼저 판단한 뒤 barrel에 포함
 */

export { default as MapContainer } from "./MapContainer";