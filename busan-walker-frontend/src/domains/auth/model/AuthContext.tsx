// src/domains/auth/model/AuthContext.tsx

import { createContext } from "react";
import type { AuthState } from '../types';

export type { AuthUser, LoginParams, AuthState } from '../types';

/**
 * AuthContext
 * 
 * 역할/목적:
 * - 인증(auth) 도메인의 상태 계약(AuthState)을 React 컴포넌트 트리에 제공하는 Context
 * - "로그인 여부/사용자 정보/인증 액션(login/logout/refresh 등)"처럼 여러 화면에서 공통으로 필요한 상태를 단일 채널로 전달
 * 
 * 계약(Contract):
 * - Context의 값 타입은 AuthState로 고정
 * - AuthState는 auth 도메인의 외부 계약이므로 types 모듈과 1:1로 정합성을 유지
 * 
 * 정책:
 * - 기본값(default) undefined
 *   → Provider 누락 시 조용히 동작하지 않고, 소비 지점에서 즉시 실패(fail-fast)하도록 하여
 *   "Provider wiring 실수"를 개발 단계에서 빠르게 발견
 * 
 * 사용 규칙:
 * - Consumer는 AuthContext를 직접 useContext로 읽기보다, 도메인에서 제공하는 useAuth() 훅을 통해 접근하는 것을 전제
 *   → useAuth()는 undefined 가드/에러 메시지 표준화/추가 정책(예: dev-only 경고)을 한 곳에서 강제할 수 있어 일관성 향상
 * 
 * 주의:
 * - Context 값이 바뀌면 하위 Consumer들이 리렌더링되므로, AuthState는 "필요한 최소 필드"로 유지하고 업데이트 빈도를 관리하는 것이 성능에 유리
 * - 초기 로딩(세션 확인) 구간에서는 AuthState가 "미확정 상태"를 가질 수 있으므로, UI는 로딩/게스트/인증 완료 상태를 구분해 처리하는 정책 필요(상위 모델에서 책임)
 */
export const AuthContext = createContext<AuthState | undefined>(undefined)