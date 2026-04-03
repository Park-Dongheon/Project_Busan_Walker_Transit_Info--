/**
 * session.ts (Auth Types - 세션 상태 및 인증 계약 타입)
 *
 * 역할/목적:
 * - 인증 세션의 핵심 모델(AuthUser)과 Context 계약(AuthState)을 정의
 * - 로그인 파라미터(LoginParams) 타입을 통해 인증 액션의 입력 계약을 표준화
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AuthUser       - 인증된 사용자의 최소 모델 (id/email/displayName/role/active/emailVerified)
 *      · LoginParams    - 로그인 액션 입력 계약
 *      · AuthState      - AuthContext가 제공하는 상태/액션 전체 계약
 * - UserRole은 account 도메인에서 import하여 역할 정의를 단일 출처로 유지
 * - GuardedUserRole 타입 유틸은 리터럴 유니온 여부를 컴파일 타임에 검증해 계약 안전성을 보장
 *
 * 동작 방식:
 * - AuthUser.role은 GuardedUserRole을 통해 리터럴 유니온임을 강제하여 임의 문자열 유입을 차단
 * - AuthState는 인증 상태(user/isLoading)와 액션(login/logout)을 하나의 계약으로 묶음
 *
 * 운영 포인트:
 * - UserRole 정의가 account 도메인에서 변경될 경우 이 파일의 GuardedUserRole 검증도 함께 확인
 * - AuthState에 새 액션을 추가할 때 AuthProvider와 AuthContext 구현도 동시에 업데이트
 */

import type { MyAccount, UserRole } from '@/domains/account';

type IsLiteralUnion<T extends string> = string extends T ? false : true
type Assert<T extends true> = T
type GuardedUserRole = Assert<IsLiteralUnion<UserRole>> extends true ? UserRole : never

export type AuthUser = {
    id: MyAccount['id']
    email: MyAccount['email']
    displayName: MyAccount['displayName']
    role: GuardedUserRole
    active: MyAccount['active']
    emailVerified: MyAccount['emailVerified']
}

export type LoginParams = {
    email: string
    password: string
}

export interface AuthState {
    user: AuthUser | null
    isLoading: boolean
    login: (params: LoginParams) => Promise<AuthUser>
    logout: () => Promise<void>
}