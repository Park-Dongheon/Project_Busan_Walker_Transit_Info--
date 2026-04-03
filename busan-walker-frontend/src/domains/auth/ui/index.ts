// src/domains/auth/ui/index.ts

/**
 * domains/auth/ui (Public UI Entry)
 * 
 * 역할/목적:
 * - auth 도메인의 UI 컴포넌트 중 "외부에 공개할 것"만 모아서 내보내는 배럴(barrel) 엔트리
 * - 상위 레이어(라우팅/레이아웃/페이지)는 내부 파일 경로를 직접 의존하지 않고
 *   "@/domains/auth" 또는 "@/domains/auth/ui"를 통해 일관된 import 경로를 사용
 * 
 * 공개 범위(Contract) 정책
 * - auth/ui는 "인증 UX를 구성하는 UI 컴포넌트"만 노출
 * - 모델 레이어(model)의 AuthState/가드 유틸을 소비하지만, 
 *   ui 자체가 도메인 외부의 화면 구현 세부사항에 의존하지 않도록 경계를 유지
 * 
 * 동작:
 * - default export 컴포넌트 (RequireAuth)를 named export로 재노출하여,
 *   외부에서 { RequireAuth } 형태로 통일된 import를 가능
 * 
 * 포인트:
 * - 배럴 엔트리로 외부 노출면을 고정하면,
 *   내부 파일 이동/분리 같은 리팩토링에도 import 경로가 흔들리지 않음
 * 
 * 주의:
 * - 여기에는 "정말 외부에서 쓸 컴포넌트"만 export
 * - 실험용/내부 전용 UI까지 무분별하게 노출하면 도메인 경계가 흐려지고 유지보수가 어려워짐
 * 
 */

export { default as RequireAuth } from "./RequireAuth";