// src/domains/account/types/index.ts

/**
 * account/types (타입 레이어 공개 진입점)
 *
 * 역할/목적:
 * - account 도메인의 TypeScript 타입 계약을 외부에 공개하는 배럴 엔트리.
 * - 상위 레이어는 내부 파일 경로를 직접 참조하지 않고 이 파일을 통해 타입을 가져감
 *
 * 공개 정책 / 설계 원칙:
 * - 타입만 re-export하여 번들 사이드 이펙트를 방지
 * - 타입 추가/삭제 시 이 파일에서 노출 여부를 함께 관리
 */

export type {
    UserRole,
    MyAccount,
    UpdateProfilePayload,
    ChangePasswordPayload,
    UpdateStatusPayload,
} from './account'