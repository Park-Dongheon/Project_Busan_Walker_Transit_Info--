// src/domains/account/types/account.ts

/**
 * account.ts (account 도메인 핵심 타입 정의)
 *
 * 역할/목적:
 * - 내 계정(MyAccount) 조회/수정과 관련된 API 요청·응답 타입을 정의
 * - 백엔드 DTO와 1:1 대응하여 타입 안전성을 보장하는 SSOT 역할
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · UserRole                - 계정 역할 유니온 ('ADMIN' | 'MEMBER')
 *      · MyAccount               - 내 계정 조회 응답 타입
 *      · UpdateProfilePayload    - 프로필(표시 이름) 수정 요청 타입
 *      · ChangePasswordPayload   - 비밀번호 변경 요청 타입
 *      · UpdateStatusPayload     - 계정 활성/비활성 상태 변경 요청 타입
 *
 * 동작 방식:
 * - nullable/optional 필드는 백엔드 DTO 정책을 그대로 반영
 * - 필드 의미가 불명확한 경우 백엔드 명세와 대조하여 갱신
 *
 * 운영 포인트:
 * - 백엔드 DTO 변경 시 이 파일의 타입을 먼저 수정
 * - UserRole 값이 추가되면 UI 분기 로직(권한 표시 등)도 함께 검토
 */

/** 계정 역할: ADMIN(관리자) 또는 MEMBER(일반 회원) */
export type UserRole = 'ADMIN' | 'MEMBER'

/** 내 계정 전체 정보 응답 */
export interface MyAccount {
    id: string
    email: string
    displayName: string
    role: UserRole
    active: boolean
    emailVerified: boolean
    createdAt: string
    updatedAt: string
}

/** 프로필(표시 이름) 수정 요청 페이로드 */
export interface UpdateProfilePayload {
    displayName: string
}

/** 비밀번호 변경 요청 페이로드 */
export interface ChangePasswordPayload {
    currentPassword: string
    newPassword: string
}

/** 계정 활성/비활성 상태 변경 요청 페이로드 */
export interface UpdateStatusPayload {
    active: boolean
}