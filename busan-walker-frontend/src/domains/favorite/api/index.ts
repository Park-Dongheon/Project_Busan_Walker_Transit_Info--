// src/domains/favorite/api/index.ts

/**
 * domains/favorite/api (Public API Entry)
 * 
 * 역할/목적:
 * - favorite 도메인의  "네트워크 호출(API) + React Query 훅/캐시 키 정책"을 외부에 공개하는 배럴 엔트리
 * - 상위 레이어(페이지/컨테이너)는 내부 파일 경로를 직접 의존하지 않고,
 *   "@/domains/favorite/api" 또는 "@/domains/favorite"의 네임스페이스 re-export를 통해 일관된 import 경로를 사용
 * 
 * 공개 범위(Contract) 정책:
 * - 이 엔트리는 favorite 도메인의 읽기(Query) / 쓰기(Mutation) 인터페이스를 외부에 제공
 * - UI/라우팅 계층은 여기서 제공하는 훅/함수 계약만 사용하고, 내부 구현(캐시 키 구성/폴백 전략/optimistic 정책)은 캡슐화
 * 
 * 의존 방향(레이어링) 주의:
 * - api 레이어는 transport(예: axios client)와 도메인 타입을 의존 가능
 * - 반대로 api 레이어가 ui를 직접 import하면 순환 의존 및 번들 결합도가 증가할 수 있으므로,
 *   types → api → ui 순서의 단방향 의존을 유지하는 것이 안전
 */

export * from "./favorites"