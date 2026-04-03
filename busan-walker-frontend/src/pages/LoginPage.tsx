// src/pages/LoginPage.tsx

import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { ROUTES } from '@/app/navigation/navigation'
import { resolveAuthRedirectTarget, type AuthRedirectFrom } from '@/app/navigation/authRedirect'
import { api as authApi, model as authModel } from '@/domains/auth'
import { getErrorCode, getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

/**
 * LoginPage.tsx (Page - 로그인 페이지)
 *
 * 역할/목적:
 * - 이메일/비밀번호 기반 로그인 폼을 제공하는 페이지
 * - 인증 리다이렉트(from 상태)를 통해 로그인 후 원래 요청 경로로 복귀 가능
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · LoginPage  - 로그인 페이지 컴포넌트
 *
 * 동작 방식:
 * - react-hook-form + zod로 이메일/비밀번호 유효성 검증
 * - 로그인 성공 시 resolveAuthRedirectTarget으로 원래 경로 또는 홈으로 이동(replace=true)
 * - 에러 코드(AUTH_REQUIRED/RATE_LIMITED/VALIDATION_ERROR) 별로 다른 UI 피드백 제공
 * - 이메일 미인증(AUTH_REQUIRED + '인증') 시 "인증 메일 다시 보내기" UI와 60초 쿨다운을 표시
 * - 비활성 계정(AUTH_REQUIRED + '비활성') 시 안내 메시지와 재활성화 정책 안내를 표시
 *
 * 운영 포인트:
 * - resendCooldown: 인증 메일 재발송 남용 방지를 위한 클라이언트 측 60초 쿨다운 타이머
 * - setInterval은 cleanup에서 반드시 clearInterval로 해제하여 타이머 누수 방지
 */

// 클라이언트 측 입력 유효성 검증 스키마 (서버 검증과 별개로 UX를 위한 1차 방어)
const schema = z.object({
    email: z.string().email('이메일 형식이 올바르지 않습니다.'),
    password: z.string().min(1, '비밀번호를 입력해 주세요.'),
})

type FormValues = z.infer<typeof schema>
// 계정 비활성 이유를 구분하여 다른 안내 메시지를 보여주기 위한 타입
type InactiveReason = 'email' | 'disabled' | null

/**
 * LoginPage
 *
 * 역할/목적:
 * - 로그인 폼 + 에러 처리 + 이메일 인증 재발송 UX를 포함한 로그인 페이지
 *
 * 에러 처리 정책:
 * - RATE_LIMITED: toast 에러 후 즉시 반환 (폼 입력 유지)
 * - AUTH_REQUIRED + 인증: inactiveReason='email', 인증 메일 재발송 UI 표시
 * - AUTH_REQUIRED + 비활성: inactiveReason='disabled', 계정 상태 안내 표시
 * - VALIDATION_ERROR / invalid credentials: 비밀번호 필드에 서버 에러 메시지 주입
 */
export default function LoginPage() {
    const { login } = authModel.useAuth()
    const navigate = useNavigate()
    const location = useLocation() as {
        state?: {
            from?: AuthRedirectFrom
            fromRegister?: boolean
        }
    }

    const [inactiveReason, setInactiveReason] = useState<InactiveReason>(null)
    const [isResending, setIsResending] = useState(false)
    const [resendCooldown, setResendCooldown] = useState(0)

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        watch,
        setError,
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    })

    const emailValue = watch('email')

    // resendCooldown > 0일 때만 1초 간격으로 카운트다운 타이머를 실행
    // cleanup에서 clearInterval로 반드시 해제하여 언마운트 시 타이머 누수 방지
    useEffect(() => {
        if (resendCooldown <= 0) return

        const timerId = window.setInterval(() => {
            setResendCooldown((prev) => {
                if (prev <= 1) {
                    window.clearInterval(timerId)
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => {
            window.clearInterval(timerId)
        }
    }, [resendCooldown])

    const onSubmit = async (values: FormValues) => {
        setInactiveReason(null)

        try {
            const loggedInUser = await login(values)
            // location.state?.from: 인증 가드에서 저장한 원래 요청 경로 (없으면 홈으로 이동)
            const target = resolveAuthRedirectTarget(location.state?.from, ROUTES.home)

            // 이메일 미인증 사용자도 로그인은 허용하되, 제한 사항을 토스트로 안내
            if (!loggedInUser.emailVerified) {
                toast.message('이메일 인증이 아직 완료되지 않았습니다.', {
                    description: '일부 기능은 이메일 인증 이후에만 사용할 수 있습니다.',
                })
            }

            // replace=true로 이동하여 로그인 페이지가 뒤로가기 히스토리에 남지 않게 처리
            navigate(target, { replace: true })
        } catch (error: unknown) {
            const code = getErrorCode(error)
            const msg = getErrorMessage(error, '이메일 또는 비밀번호를 다시 확인해 주세요.')
            const lowerMsg = msg.toLowerCase()

            if (code === 'RATE_LIMITED') {
                toast.error(msg)
                return
            }

            if (code === 'AUTH_REQUIRED') {
                if (lowerMsg.includes('비활성') || lowerMsg.includes('inactive')) {
                    setInactiveReason('disabled')
                    toast.error('현재 로그인할 수 없는 계정 상태입니다.')
                    return
                }

                if (lowerMsg.includes('인증') || lowerMsg.includes('verify')) {
                    setInactiveReason('email')
                    toast.error('이메일 인증이 필요합니다.')
                    return
                }

                setError('password', {
                    type: 'server',
                    message: '이메일 또는 비밀번호가 올바르지 않습니다.',
                })
                return
            }

            if (code === 'VALIDATION_ERROR' || lowerMsg.includes('invalid credentials')) {
                setError('password', {
                    type: 'server',
                    message: '이메일 또는 비밀번호가 올바르지 않습니다.',
                })
                return
            }

            toast.error(msg)
        }
    }

    const handleResend = async () => {
        if (!emailValue) {
            toast.error('이메일을 먼저 입력해 주세요.')
            return
        }

        if (isResending || resendCooldown > 0) {
            return
        }

        try {
            setIsResending(true)
            await authApi.resendEmailVerification({ email: emailValue })
            toast.success('요청을 접수했습니다. 가입한 계정이라면 인증 메일을 다시 보내드립니다.')
            setResendCooldown(60)
        } catch (error: unknown) {
            const code = getErrorCode(error)
            const msg = getErrorMessage(error, '인증 메일 재발송 중 오류가 발생했습니다.')

            if (code === 'VALIDATION_ERROR' && msg.includes('잠시 후 다시 요청')) {
                toast.error(msg)
                return
            }

            toast.error(msg)
        } finally {
            setIsResending(false)
        }
    }

    return (
        <div className='mx-auto max-w-md space-y-4 rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur'>
            {location.state?.fromRegister ? (
                <div className='rounded-2xl border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-xs text-emerald-100'>
                    <p className='font-semibold'>회원가입이 완료되었습니다.</p>
                    <p className='mt-1'>입력하신 이메일로 발송된 인증 메일의 링크를 클릭한 뒤 아래에서 로그인해 주세요.</p>
                </div>
            ) : null}

            <h2 className='text-lg font-semibold text-white'>로그인</h2>

            <form onSubmit={handleSubmit(onSubmit)} className='space-y-3'>
                <div>
                    <label className='block text-sm font-medium text-white'>이메일</label>
                    <input
                        type='text'
                        className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                        {...register('email')}
                    />
                    {errors.email ? <p className='mt-1 text-xs text-red-200'>{errors.email.message}</p> : null}
                </div>

                <div>
                    <label className='block text-sm font-medium text-white'>비밀번호</label>
                    <input
                        type='password'
                        autoComplete='current-password'
                        className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                        {...register('password')}
                    />
                    {errors.password ? <p className='mt-1 text-xs text-red-200'>{errors.password.message}</p> : null}
                </div>

                {inactiveReason === 'email' ? (
                    <div className='mt-1 rounded-2xl border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-xs text-amber-100'>
                        <p className='font-semibold'>이메일 인증이 필요합니다.</p>
                        <p className='mt-1'>회원가입 시 발송된 <span className='font-medium'>인증 메일의 링크</span>를 클릭한 뒤 다시 로그인해 주세요.</p>
                        <p className='mt-1'>메일이 보이지 않으면 스팸 메일함도 함께 확인해 주세요.</p>
                        <div className='mt-2 flex justify-end'>
                            <Button
                                type='button'
                                onClick={handleResend}
                                loading={isResending}
                                disabled={resendCooldown > 0}
                                size='sm'
                                variant='ghost'
                                className='rounded-xl border-amber-200/30 bg-amber-500/30 text-xs font-medium hover:bg-amber-500/40'
                            >
                                {resendCooldown > 0
                                    ? `다시 보내기 (${resendCooldown}s)`
                                    : isResending
                                      ? '전송 중...'
                                      : '인증 메일 다시 보내기'}
                            </Button>
                        </div>
                    </div>
                ) : null}

                {inactiveReason === 'disabled' ? (
                    <div className='mt-1 rounded-2xl border border-sky-300/40 bg-sky-500/20 px-3 py-2 text-xs text-sky-100'>
                        <p className='font-semibold'>현재 로그인할 수 없는 계정 상태입니다.</p>
                        <p className='mt-1'>관리자에 의해 사용이 제한된 계정이거나 서비스 정책에 따라 일시적으로 <span className='font-medium'>비활성화된 계정</span> 상태일 수 있습니다.</p>
                        <p className='mt-1'>마이페이지에서 사용자가 직접 비활성화한 경우에는 다시 로그인하면 계정이 <span className='font-medium'>자동으로 활성화</span>되도록 설정되어 있습니다.</p>
                        <p className='mt-1'>로그인 시도가 계속해서 차단된다면 관리자에게 문의해 주세요.</p>
                    </div>
                ) : null}

                <Button type='submit' variant='secondary' className='mt-3' fullWidth loading={isSubmitting} loadingText='로그인 중...'>
                    로그인
                </Button>
            </form>

            <div className='flex justify-between text-xs text-white/75'>
                <Link to={ROUTES.register} className='text-white/90 hover:text-white hover:underline'>회원가입</Link>
                <Link to={ROUTES.passwordForgot} className='text-white/90 hover:text-white hover:underline'>비밀번호 찾기</Link>
            </div>
        </div>
    )
}