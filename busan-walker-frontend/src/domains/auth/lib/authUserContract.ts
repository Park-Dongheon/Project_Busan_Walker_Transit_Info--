/**
 * authUserContract.ts (Auth Lib - AuthUser 런타임 파싱 및 계약 검증)
 *
 * 역할/목적:
 * - 서버 응답이나 세션 복구 결과에서 받은 임의의 값을 AuthUser 계약에 맞게 파싱하고 검증
 * - 런타임 파싱 실패 시 즉시 예외를 던져 잘못된 인증 상태가 전역에 퍼지지 않도록 차단
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · parseAuthUserSnapshot  - unknown 입력을 AuthUser로 파싱하는 함수 (Zod 기반)
 * - 역할 값(AUTH_USER_ROLE_VALUES)은 account 도메인의 UserRole과 satisfies로 동기화
 * - 파싱 스키마(authUserSchema)는 내부 구현으로 노출하지 않음
 *
 * 동작 방식:
 * - Zod 스키마로 id/email/displayName/role/active/emailVerified 필드를 엄격하게 검증
 * - role은 AUTH_USER_ROLE_VALUES enum으로 제한하여 허용 범위 외 값을 차단
 * - 검증 실패 시 Zod가 ZodError를 throw하며 호출 측에서 처리
 *
 * 운영 포인트:
 * - UserRole 목록이 account 도메인에서 변경될 경우 AUTH_USER_ROLE_VALUES도 함께 업데이트
 * - 서버 /me 응답 필드 구조가 바뀔 경우 authUserSchema의 필드 정의도 함께 수정
 */

import { z } from 'zod';

import type { UserRole } from '@/domains/account';
import type { AuthUser } from '../types';

const AUTH_USER_ROLE_VALUES = ['ADMIN', 'MEMBER'] as const satisfies readonly UserRole[]

const authUserSchema = z.object({
    id: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().min(1),
    role: z.enum(AUTH_USER_ROLE_VALUES),
    active: z.boolean(),
    emailVerified: z.boolean()
})

/**
 * parseAuthUserSnapshot
 *
 * - unknown 입력을 Zod 스키마로 검증해 AuthUser를 반환
 * - 검증 실패 시 ZodError를 throw하므로 호출 측에서 try/catch 또는 에러 경계로 처리
 */
export function parseAuthUserSnapshot(input: unknown): AuthUser {
    return authUserSchema.parse(input)
}