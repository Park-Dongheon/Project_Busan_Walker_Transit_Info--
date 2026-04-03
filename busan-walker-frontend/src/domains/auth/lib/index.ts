// src/domains/auth/lib/index.ts

/**
 * domains/auth/lib (Public Lib Entry)
 * 
 * 역할/목적:
 * - auth 도메인의 "순수 유틸/정책 모듈"을 외부에 공개하는 배럴(barrel) 엔트리
 * - 상위 레이어는 "@/domains/auth" 또는 "@/domains/auth/lib" 경로만 import 대상으로 삼아,
 *   내부 파일 구조 변경에 대한 결합도를 낮춤
 * 
 * 공개 범위(Contract) 정책:
 * - lib 레이어는 "상태를 소유하지 않는" 순수 함수/상수/정책(SSOT)을 제공하는 것을 전제
 * - 네트워크 호출/세션 상태/스토어와 결합되는 로직은 model 레이어의 책임으로 둠
 * 
 * 동작:
 * - 하위 모듈에서 export된 심볼을 재-export
 * 
 * 포인트:
 * - 이 엔트리를 통해 정책/유틸 import 경로를 단일화하면,
 *   화면마다 규칙/문구가 달라지는 불일치 품질 문제를 예방하는 데 유리
 * 
 * 주의:
 * - 배럴 재-export는 네임 충돌 가능성이 있으므로,
 *   공개 심볼 이름은 도메인 내에서 의미가 명확하고 충돌 가능성이 낮게 유지하는 것이 좋음
 * - lib 레이어가 model/ui를 import하기 시작하면 순환 의존 위험이 커지므로,
 *   의존 방향을 단방향(types → lib → model → ui)으로 유지하는 것이 안전
 */

export * from "./passwordPolicy"
export * from "./authUserContract"