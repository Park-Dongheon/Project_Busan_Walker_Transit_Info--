/**
 * auth.ts (Auth API Layer - 인증 API 호출 함수 모음)
 *
 * 역할/목적:
 * - 인증 관련 서버 API(로그인/로그아웃/회원가입/비밀번호 재설정/이메일 인증)를 호출하는 함수를 제공
 * - API 레이어와 상위 모델/UI 레이어 사이의 네트워크 호출 책임을 분리
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · login                      - 이메일/비밀번호로 로그인하고 LoginResponse를 반환
 *      · logout                     - 서버 세션을 종료하는 로그아웃 요청
 *      · register                   - 신규 회원가입 요청
 *      · requestPasswordReset       - 비밀번호 재설정 이메일 발송 요청
 *      · confirmPasswordReset       - 토큰을 이용한 비밀번호 재설정 확인 요청
 *      · verifyEmail                - 이메일 인증 토큰 확인 요청
 *      · resendEmailVerification    - 이메일 인증 메일 재발송 요청
 *      · authApi                    - 위 함수 전체를 객체로 묶은 네임스페이스
 *
 * 동작 방식:
 * - 공유 axios 클라이언트(api)를 사용하여 각 엔드포인트에 POST 요청을 전송
 * - 응답 데이터를 직접 반환하거나 void로 처리하여 호출 측 코드를 단순하게 유지
 *
 * 운영 포인트:
 * - 엔드포인트 경로 변경 시 이 파일의 함수 구현과 types/commands.ts 페이로드 타입을 함께 확인
 * - 새 인증 엔드포인트 추가 시 authApi 상수 객체에도 함께 등록해야 외부 일괄 접근 가능
 */

import type { AxiosResponse } from 'axios';

import { api } from '@/shared/api/core/client';
import type {
    EmailVerificationResendPayload,
    EmailVerifyPayload,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirmPayload,
    PasswordResetRequestPayload,
    RegisterPayload
} from '../types';

export function login(payload: LoginRequest): Promise<LoginResponse> {
    return api.post<LoginResponse>('/auth/login', payload).then((response: AxiosResponse<LoginResponse>) => response.data)
}

export function logout(): Promise<void> {
    return api.post<void>('/auth/logout', undefined).then(() => undefined)
}

export function register(payload: RegisterPayload): Promise<void> {
    return api.post<void>('/auth/register', payload).then(() => undefined)
}

export function requestPasswordReset(payload: PasswordResetRequestPayload): Promise<void> {
    return api.post<void>('/auth/password/reset-request', payload).then(() => undefined)
}

export function confirmPasswordReset(payload: PasswordResetConfirmPayload): Promise<void> {
    return api.post<void>('/auth/password/reset-confirm', payload).then(() => undefined)
}

export function verifyEmail(payload: EmailVerifyPayload): Promise<void> {
    return api.post<void>('/auth/email/verify', payload).then(() => undefined)
}

export function resendEmailVerification(payload: EmailVerificationResendPayload): Promise<void> {
    return api.post<void>('/auth/email/resend', payload).then(() => undefined)
}

export const authApi = {
    login,
    logout,
    register,
    requestPasswordReset,
    confirmPasswordReset,
    verifyEmail,
    resendEmailVerification
} as const