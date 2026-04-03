// src/domains/favorite/index.ts

/**
 * domains/favorite (Public Domain Entry)
 * 
 * 역할/목적:
 * - favorite 도메인의 외부 노출면(public surface)을 고정하는 배럴(barrel) 엔트리
 * - 상위 레이어(페이지/레이아웃/라우팅/타 도메인)는 내부 파일 경로를 직접 참조하지 않고
 *   "@/domains/favorite"를 통해 일관된 import 경로로 접근
 * 
 * 공개 범위(Contract) 정책:
 * - types:
 *   - favorite 도메인이 외부와 공유하는 데이터 계약(DTO/모델 타입)을 직접 export
 *   - "타입은 얇게 공유, 구현은 숨김" 원칙으로 도메인 결합도를 낮춤
 * 
 * - api/ui:
 *   - 런타임 모듈은 namespace export로 묶어 노출
 *   - 외부에서는 favorite.api.*, favorite.ui.* 형태로 접근하여
 *     동일 도메인 내부에서 API/프레젠테이션 레이어를 명확히 구분 가능
 * 
 * 의존 방향(레이어링) 정책:
 * - 기본적으로 types → api → ui 방향으로 의존을 유지
 * - ui가 api를 소비하는 것은 허용하지만, api가 ui를 import 하면 순환 으존 위험이 커짐
 * 
 * 포인트:
 * - 배럴 엔트리로 외부 노출면을 고정하면, 내부 리팩토링(파일 이동/분리)에도 import 경로가 흔들리지 않아 유지보수가 쉬워짐
 * 
 * 주의:
 * - `export * from "./types"`는 types 파일들이 "값 export"를 포함하지 않도록 관리
 *   (types 레이어는 type-only를 유지하는 것이 번들/사이드 이펙트 측면에서 안전)
 */

export * from "./types"
export * as api from "./api"
export * as ui from "./ui"