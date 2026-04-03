// src/domains/map/index.ts

/**
 * domains/map (Domain Facade / Public Surface)
 *
 * 역할/목적:
 * - map 도메인이 외부 레이어(페이지/라우터/다른 도메인)에 제공하는 공식 진입점 역할을 수행
 * - 내부 폴더 구조(types/ui)를 감추고 외부 import 경로를 안정적으로 유지
 *
 * 공개 정책 / 설계 원칙:
 * - 타입은 지도 화면 조합에 필요한 최소 계약만 `export type`으로 재노출
 * - UI는 `ui` 네임스페이스로 묶어 노출하여 "map 도메인 UI"임을 명확히 표현
 * - lib/model 같은 내부 구현 세부와 내부 전용 타입은 외부에 직접 노출하지 않음
 *
 * 동작 방식:
 * - `./types`에서 외부에 필요한 타입만 선별해 재노출
 * - `./ui`는 namespace export로 묶어 상위 레이어가 `map.ui.*` 형태로 사용하도록 구성
 * - 외부 코드는 이 파일만 기준으로 의존하고, 실제 구현 상세는 하위 모듈에 위임
 *
 * 운영 포인트:
 * - 도메인 내부 파일 이동/분리가 발생해도 상위 레이어의 import 경로는 이 파일 기준으로 유지
 * - 여기서 export 되는 심볼이 곧 map 도메인의 public contract이므로 추가/삭제 시 변경 영향 범위를 함께 검토해야 함
 */

export type {
    BBox,
    GeoPoint,
    MapHelpers,
    MapContainerProps
} from "./types";

export * as ui from "./ui";