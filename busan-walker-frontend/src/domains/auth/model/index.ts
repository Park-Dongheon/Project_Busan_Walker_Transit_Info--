// src/domains/auth/model/index.ts

/**
 * domains/auth/model (Public Model Entry)
 * 
 * 역할/목적:
 * - auth 도메인의 "상태 모델/가드/Provider/훅"을 외부에 공개하는 배럴(barrel) 엔트리
 * - 상위 레이어(페이지/레이아웃/라우팅)는 내부 파일 경로를 직접 의존하지 않고, 
 *   "@/domains/auth" 또는 "@/domains/auth/model" 을 통해 일관된 import 경로를 사용
 * 
 * 공개 범위(Contract) 정책
 * - model 레이어는 "인증 상태(user/isLoading) + 인증 액션(login/logout) + 라우터 가드 계약"을 제공
 * - UI 레이어는 model의 계약을 소비(consumption)하며, model은 UI 구현에 의존하지 않음
 * 
 * 구성 요소:
 * - AuthContext:
 *   - 인증 상태/액션(AuthState)을 React Context로 제공하기 위한 타입/컨테이너
 * 
 * - AuthProvider:
 *   - 앱 부팅 세션 복구(silent refresh + /me 확정), 토큰 종료 이벤트 처리, 인증 의존 캐시 정리 등 "전역 인증 라이프사이클"을 담당하는 Provider
 * 
 * - useAuth:
 *   - Context 접근을 캡슐화하고 Provider 누락을 빠르게 감지하기 위한 접근 훅
 * 
 * - authGuard:
 *   - RequireAuth 등 라우터 가드에서 사용할 deny 사유/리다이렉트 컨텍스트, 공개 라우터(예외) 판정 유틸을 제공
 * 
 * 포인트:
 * - model 엔트리로 "외부 노출면"을 고정하면, 내부 리팩토링(파일 이동/분리)에도 import 경로가 흔들리지 않아 유지보수가 쉬움
 * 
 * 주의:
 * - 배럴 재-export는 네임 충돌 가능성이 있으므로, export되는 심볼 이름은 도메인 내에서 일관되게 관리
 * - model 레이어가 ui를 import하기 시작하면 순환 의존 위험이 커지므로, 의존 방향(types/lib → model → ui)을 유지하는 것이 안전
 */

export * from "./AuthContext"
export * from "./authGuard"
export * from "./AuthProvider"
export * from "./useAuth"