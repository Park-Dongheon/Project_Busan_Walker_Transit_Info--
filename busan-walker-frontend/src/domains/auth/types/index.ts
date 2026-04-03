// src/domains/auth/types/index.ts

/**
 * auth/types/index.ts (Auth 타입 Barrel)
 *
 * 역할/목적:
 * - auth 도메인의 모든 타입 계약을 단일 경로(index.ts)로 재노출
 *
 * 공개 정책 / 설계 원칙:
 * - commands(API 페이로드), session(세션/상태 계약), guard(가드/리다이렉트 타입)를 한 진입점으로 통합
 * - 상위 레이어는 세부 파일 경로 대신 이 barrel을 통해 auth 타입을 import
 * - 타입만 노출하므로 런타임 번들에 영향 없음
 */

export type {
    BrowserTokens,
    LoginRequest,
    LoginResponse,
    RegisterPayload,
    PasswordResetRequestPayload,
    PasswordResetConfirmPayload,
    EmailVerifyPayload,
    EmailVerificationResendPayload
} from './commands';
export type { AuthUser, LoginParams, AuthState } from './session';
export type { AuthDenyReason, AccessDeniedReason, AuthGuardNavigationState } from './guard';