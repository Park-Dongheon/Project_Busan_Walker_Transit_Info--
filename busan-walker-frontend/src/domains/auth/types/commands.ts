/**
 * commands.ts (Auth Types - 인증 API 요청/응답 커맨드 타입)
 *
 * 역할/목적:
 * - 인증 관련 API(로그인/회원가입/비밀번호 재설정/이메일 인증)의 요청 및 응답 페이로드 타입을 정의
 * - API 레이어와 UI 레이어가 공유하는 입출력 계약(Contract)을 한곳에서 관리
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · BrowserTokens                      - 브라우저에서 보관하는 토큰 구조 (accessToken)
 *      · LoginRequest                       - 로그인 API 요청 페이로드
 *      · LoginResponse                      - 로그인 API 응답 페이로드 (userId/email/displayName/role/tokens)
 *      · RegisterPayload                    - 회원가입 API 요청 페이로드
 *      · PasswordResetRequestPayload        - 비밀번호 재설정 요청 페이로드
 *      · PasswordResetConfirmPayload        - 비밀번호 재설정 확인 페이로드
 *      · EmailVerifyPayload                 - 이메일 인증 페이로드
 *      · EmailVerificationResendPayload     - 이메일 인증 재발송 페이로드
 *
 * 동작 방식:
 * - 각 타입은 서버 API 계약을 반영하며 타입스크립트 인터페이스/타입으로 선언
 * - UserRole은 account 도메인에서 import하여 역할 정의를 단일 출처로 유지
 *
 * 운영 포인트:
 * - 서버 API 스펙이 변경될 경우 이 파일의 타입을 먼저 업데이트하고 api/auth.ts의 구현을 확인
 * - 새 인증 엔드포인트 추가 시 대응하는 페이로드 타입을 이 파일에 정의한 뒤 index.ts에 재노출
 */

import type { UserRole } from '@/domains/account'

export type BrowserTokens = {
    accessToken: string
}

export interface LoginRequest {
    email: string
    password: string
}

export interface LoginResponse {
    userId: string
    email: string
    displayName: string
    role: UserRole
    tokens: BrowserTokens
}

export interface RegisterPayload {
    email: string
    password: string
    displayName: string
}

export interface PasswordResetRequestPayload {
    email: string
}

export interface PasswordResetConfirmPayload {
    email: string
    token: string
    newPassword: string
}

export interface EmailVerifyPayload {
    email: string
    token: string
}

export interface EmailVerificationResendPayload {
    email: string
}