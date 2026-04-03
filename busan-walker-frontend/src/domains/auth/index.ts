// src/domains/auth/index.ts

/**
 * auth/index.ts (auth 도메인 공개 API 표면 / Domain Barrel)
 *
 * 역할/목적:
 * - auth 도메인 전체의 공개 인터페이스를 외부 단일 진입점으로 통합
 * - 도메인 외부에서는 이 파일 하나만 import하면 types·api·lib·model·ui 전체에 접근 가능
 *
 * 공개 정책 / 설계 원칙:
 * - types: 타입 계약은 export *로 직접 노출 (런타임 번들에 영향 없음)
 * - api·lib·model·ui: export * as X 형태로 네임스페이스 객체로 노출하여
 *   호출부에서 authModel.AuthProvider, authUi.RequireAuth 같이 의미 있는 접두사로 구분
 * - 도메인 내부 구현 세부사항은 외부에서 직접 접근 x
 *
 * 운영 포인트:
 * - 신규 서브모듈 추가 시 이 파일에도 export를 함께 등록해야 외부 접근 가능
 * - router.tsx, 페이지 컴포넌트 등 외부에서 import 시 항상 이 파일을 경유
 */

export * from './types'
export * as api from './api'
export * as lib from './lib'
export * as model from './model'
export * as ui from './ui'