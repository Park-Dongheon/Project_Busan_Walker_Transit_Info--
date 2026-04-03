// src/pages/EmailVerifyPage.tsx

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ROUTES } from '@/app/navigation/navigation'
import { api as authApi } from '@/domains/auth'
import { getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

/**
 * EmailVerifyPage.tsx (Page - 이메일 인증 처리 페이지)
 *
 * 역할/목적:
 * - 이메일 인증 링크(email + token)를 통해 인증을 자동 처리하고 결과를 표시하는 페이지
 * - 인증 성공 시 3초 카운트다운 후 로그인 페이지로 자동 이동
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · EmailVerifyPage  - 이메일 인증 처리 페이지 컴포넌트
 *
 * 동작 방식:
 * - 마운트 시 URL에서 email/token을 읽어 verifyEmailOnce로 인증 API를 호출
 * - verifyEmailOnce: 동일 email+token 조합의 중복 요청을 Map으로 막아 StrictMode/재마운트 시 중복 API 호출 방지
 * - 상태(pending/success/error)에 따라 다른 UI를 표시
 * - 성공 후 3초 카운트다운 → 로그인 페이지로 자동 이동(replace=true)
 *
 * 운영 포인트:
 * - verifyRequestByKey: 모듈 스코프 Map으로 요청을 deduplicate. 인증 완료 후 finally에서 항목을 삭제하여 재사용을 허용
 * - active 플래그: 언마운트 후 비동기 결과가 도착해도 setState가 호출되지 않도록 처리(메모리 누수 방지)
 * - toast는 owner=true(최초 요청자)인 경우에만 표시하여 중복 toast 방지
 */

type Status = 'pending' | 'success' | 'error'

const EMAIL_VERIFY_TEXT = {
    invalidLink: '잘못된 인증 링크입니다. 이메일과 토큰 정보가 없습니다.',
    successMessage: '이메일 인증이 완료되었습니다.',
    successToast: '이메일 인증 완료',
    errorFallback: '이메일 인증 중 오류가 발생했습니다. 링크가 만료되었을 수 있습니다.',
} as const

// 동일 email+token 조합의 인증 요청을 deduplicate하는 모듈 스코프 Map
// StrictMode의 이중 마운트나 사용자 새로고침 시 중복 API 호출을 방지
const verifyRequestByKey = new Map<string, Promise<void>>()

/**
 * getVerifyKey
 *
 * - email + token 조합을 단일 문자열 키로 직렬화하여 Map 조회에 사용
 */
function getVerifyKey(email: string, token: string): string {
    return `${email}::${token}`
}

/**
 * verifyEmailOnce
 *
 * 역할/목적:
 * - 동일 email+token 조합에 대해 인증 API를 단 1회만 호출하는 deduplicate 함수
 *
 * 동작:
 * - 이미 진행 중인 요청이 있으면 동일 Promise를 반환하고 owner=false로 표시
 * - 새 요청이면 Map에 등록하고 owner=true로 반환, 완료 후 항목 삭제(재사용 허용)
 * - owner 여부는 toast 중복 방지를 위해 호출자에서 활용
 */
function verifyEmailOnce(email: string, token: string): { request: Promise<void>; owner: boolean } {
    const key = getVerifyKey(email, token)
    const existing = verifyRequestByKey.get(key)

    if (existing) {
        return { request: existing, owner: false }
    }

    const request = authApi.verifyEmail({ email, token }).finally(() => {
        // 완료 후 Map에서 제거하여 만료된 링크로 재시도 시 새 요청이 발생하도록 허용
        verifyRequestByKey.delete(key)
    })

    verifyRequestByKey.set(key, request)
    return { request, owner: true }
}

/**
 * EmailVerifyPage
 *
 * 역할/목적:
 * - 이메일 인증 처리 및 결과 표시를 담당하는 최상위 컴포넌트
 *
 * 비동기 처리 정책:
 * - active 플래그로 언마운트 후 setState 호출을 차단하여 메모리 누수를 방지
 * - verifyEmailOnce로 중복 요청을 deduplicate하여 StrictMode에서도 1회만 API 호출
 */
export default function EmailVerifyPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    const email = searchParams.get('email')
    const token = searchParams.get('token')

    const [status, setStatus] = useState<Status>('pending')
    const [message, setMessage] = useState<string | null>(null)
    // 인증 성공 후 로그인 페이지로 자동 이동하는 카운트다운(초)
    const [countdown, setCountdown] = useState(0)

    useEffect(() => {
        // active 플래그: 언마운트 이후 비동기 콜백에서 setState를 호출하지 않도록 처리
        let active = true

        if (!email || !token) {
            setStatus('error')
            setMessage(EMAIL_VERIFY_TEXT.invalidLink)
            return
        }

        const { request, owner } = verifyEmailOnce(email, token)
        void request
            .then(() => {
                if (!active) return
                setStatus('success')
                setMessage(EMAIL_VERIFY_TEXT.successMessage)
                // owner인 경우에만 toast를 표시하여 deduplicate된 요청에서 중복 toast를 방지
                if (owner) {
                    toast.success(EMAIL_VERIFY_TEXT.successToast)
                }
                setCountdown(3)
            })
            .catch((error: unknown) => {
                if (!active) return
                const msg = getErrorMessage(error, EMAIL_VERIFY_TEXT.errorFallback)
                setStatus('error')
                setMessage(msg)
                if (owner) {
                    toast.error(msg)
                }
            })

        return () => {
            active = false
        }
    }, [email, token])

    // 인증 성공 상태에서만 카운트다운 타이머를 실행
    useEffect(() => {
        if (status !== 'success' || countdown <= 0) return

        const timerId = window.setTimeout(() => {
            setCountdown((prev) => Math.max(0, prev - 1))
        }, 1000)

        return () => {
            window.clearTimeout(timerId)
        }
    }, [status, countdown])

    // 카운트다운이 0이 되면 로그인 페이지로 자동 이동 (replace=true로 뒤로가기 히스토리 오염 방지)
    useEffect(() => {
        if (status !== 'success' || countdown !== 0) return
        navigate(ROUTES.login, { replace: true })
    }, [status, countdown, navigate])

    return (
        <div className='mx-auto max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 shadow-sm backdrop-blur'>
            <h2 className='text-lg font-semibold text-white'>이메일 인증</h2>

            {status === 'pending' ? <p className='text-sm text-white/80'>이메일 인증을 진행 중입니다. 잠시만 기다려 주세요.</p> : null}

            {status === 'success' ? (
                <div className='space-y-2'>
                    <p className='text-sm font-medium text-emerald-200'>{message ?? '이메일 인증이 완료되었습니다.'}</p>
                    {email ? <p className='text-xs text-white/75'>이제 해당 계정으로 로그인할 수 있습니다. 인증된 계정: <span className='font-mono'>{email}</span></p> : null}
                    {countdown > 0 ? <p className='text-xs text-white/75'>{countdown}초 후 로그인 페이지로 이동합니다.</p> : null}
                    <div className='mt-2 flex gap-2'>
                        <Button type='button' onClick={() => navigate(ROUTES.login, { replace: true })} variant='secondary' size='sm'>바로 로그인하기</Button>
                        <Button type='button' onClick={() => navigate(ROUTES.home, { replace: true })} variant='ghost' size='sm'>홈으로</Button>
                    </div>
                </div>
            ) : null}

            {status === 'error' ? (
                <div className='space-y-2'>
                    <p className='text-sm font-medium text-red-200'>{message ?? '이메일 인증에 실패했습니다.'}</p>
                    {email ? (
                        <p className='text-xs text-white/75'>
                            이메일 인증에 실패했습니다. 링크가 만료되었거나 이미 사용한 링크일 수 있습니다. 로그인 페이지에서 인증 메일 재발송을 요청한 뒤 다시 시도해 주세요. 인증 실패 이메일: <span className='font-mono'>{email}</span>
                        </p>
                    ) : null}
                    <div className='mt-2 flex gap-2'>
                        <Button type='button' onClick={() => navigate(ROUTES.login, { replace: true })} variant='secondary' size='sm'>로그인 페이지로</Button>
                        <Button type='button' onClick={() => navigate(ROUTES.home, { replace: true })} variant='ghost' size='sm'>홈으로</Button>
                    </div>
                </div>
            ) : null}
        </div>
    )
}