// src/domains/account/api/account.ts

/**
 * account.ts (account 도메인 API 함수)
 *
 * 역할/목적:
 * - 내 계정 조회·수정과 관련된 REST API 호출 함수를 제공
 * - axios 클라이언트를 감싸 응답 데이터만 반환하여 호출 측 코드를 단순하게 유지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · getMyAccount      - GET /me  → 내 계정 정보 조회
 *      · updateProfile     - PATCH /me  → 프로필(표시 이름) 수정
 *      · changePassword    - POST /me/password  → 비밀번호 변경
 *      · updateStatus      - PATCH /me/status   → 계정 활성/비활성 전환
 *
 * 동작 방식:
 * - 모든 함수는 axios response.data만 반환하여 상위 레이어가 AxiosResponse를 직접 다루지 않아도 됨
 * - changePassword는 서버가 본문 없이 성공을 응답하므로 void 반환
 *
 * 운영 포인트:
 * - API 경로 변경 시 이 파일의 각 함수를 일괄 수정
 * - 에러 처리는 호출 측(컨테이너/훅)에서 담당
 */
import type { AxiosResponse } from 'axios'

import { api } from '@/shared/api/core/client'
import type {
    ChangePasswordPayload,
    MyAccount,
    UpdateProfilePayload,
    UpdateStatusPayload,
} from '../types'

/** GET /me — 현재 로그인한 사용자의 계정 정보 조회 */
export function getMyAccount(): Promise<MyAccount> {
    return api.get<MyAccount>('/me').then((response: AxiosResponse<MyAccount>) => response.data)
}

/** PATCH /me — 표시 이름(displayName)을 수정 */
export function updateProfile(payload: UpdateProfilePayload): Promise<MyAccount> {
    return api.patch<MyAccount>('/me', payload).then((response: AxiosResponse<MyAccount>) => response.data)
}

/** POST /me/password — 현재 비밀번호를 검증하고 새 비밀번호로 변경 */
export function changePassword(payload: ChangePasswordPayload): Promise<void> {
    return api.post<unknown>('/me/password', payload).then(() => undefined)
}

/** PATCH /me/status — 계정 활성/비활성 상태 전환 */
export function updateStatus(payload: UpdateStatusPayload): Promise<MyAccount> {
    return api.patch<MyAccount>('/me/status', payload).then((response: AxiosResponse<MyAccount>) => response.data)
}