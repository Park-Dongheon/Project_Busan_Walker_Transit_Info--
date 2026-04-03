// src/domains/favorite/ui/index.ts

/**
 * domains/favorite/ui (Public UI Entry)
 * 
 * 역할/목적:
 * - favorite 도메인의 UI 컴포넌트를 외부에 공개하는 배럴(barrel) 엔트리
 * - 상위 레이어(페이지/레이아웃)는 개별 파일 경로를 직접 참조하지 않고
 *   "@/domains/favorite" 또는 "@/domains/favorite/ui"를 통해 일관된 import 경로를 사용
 * 
 * 공개 범위(Contract) 정책:
 * - ui 레이어는 "화면에서 사용하는 컴포넌트"만 외부에 노출
 * - api/model/types 같은 다른 레이어의 내부 구성은 ui 엔트리를 통해 노출하지 않으며,
 *   도메인 내부 의존 방향을 유지(types → api/model → ui)
 * 
 * 포인트:
 * - 배럴 엔트리로 외부 노출면을 고정하면,
 *   도메인 내부 파일 이동/분리에도 import 경로가 흔들리지 않아 유지보수성이 좋아짐
 * 
 * 주의:
 * - re-export는 심볼 네이밍 충돌 가능성이 있으므로,
 *   외부에 노출되는 컴포넌트 이름은 도메인 내에서 일관되게 관리
 */

export * from "./FavoriteButton"