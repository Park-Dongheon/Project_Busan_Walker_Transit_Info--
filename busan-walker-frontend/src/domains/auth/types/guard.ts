/**
 * guard.ts (Auth Types - 인증 가드 및 리다이렉트 상태 타입)
 *
 * 역할/목적:
 * - 인증 가드(RequireAuth)가 차단 사유를 분류하고 라우터 상태로 전달하기 위한 타입을 정의
 * - 보호 라우트에서 비로그인/비활성/미인증/권한 부족 상황을 코드 레벨에서 구분할 수 있게 함
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AuthDenyReason             - 인증 가드가 접근을 차단할 때 분류하는 사유 유니온
 *      · AccessDeniedReason         - unauthenticated를 제외한 "접근 거부" 사유 유니온
 *      · AuthGuardNavigationState   - 가드 리다이렉트 시 router state에 담기는 페이로드 타입
 *
 * 동작 방식:
 * - AuthDenyReason은 네 가지 사유(unauthenticated/inactive_account/email_unverified/insufficient_role)를 리터럴 유니온으로 정의
 * - AccessDeniedReason은 unauthenticated를 Exclude하여 "이미 로그인했지만 거부된" 케이스만 표현
 * - AuthGuardNavigationState는 Navigate state prop에 직접 전달되며 from/denyReason을 포함
 *
 * 운영 포인트:
 * - 새 접근 거부 사유 추가 시 RequireAuth의 검사 로직과 접근 거부 페이지의 안내 문구도 함께 업데이트
 * - AuthRedirectFrom 타입은 navigation/authRedirect에서 관리하므로 해당 모듈 변경 시 영향을 확인
 */

import type { AuthRedirectFrom } from '@/app/navigation/authRedirect'

export type AuthDenyReason =
    | 'unauthenticated'
    | 'inactive_account'
    | 'email_unverified'
    | 'insufficient_role'

export type AccessDeniedReason = Exclude<AuthDenyReason, 'unauthenticated'>

export type AuthGuardNavigationState = {
    from?: AuthRedirectFrom
    denyReason?: AuthDenyReason
}