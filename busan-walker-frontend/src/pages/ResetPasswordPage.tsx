// src/pages/ResetPasswordPage.tsx

import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import z from 'zod'
import { toast } from 'sonner'

import { ROUTES } from '@/app/navigation/navigation'
import { api as authApi, lib as authLib } from '@/domains/auth'
import { getErrorCode, getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

/**
 * ResetPasswordPage.tsx (Page - 비밀번호 재설정 페이지)
 *
 * 역할/목적:
 * - 비밀번호 재설정 이메일 링크(email + token)를 통해 새 비밀번호를 설정하는 페이지
 * - URL 쿼리 파라미터(email, token)를 읽어 폼 기본값으로 설정하고, 재설정 API를 호출
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · ResetPasswordPage  - 비밀번호 재설정 페이지 컴포넌트
 *
 * 동작 방식:
 * - URL에 email/token 파라미터가 없으면 "잘못된 링크" 에러 UI를 즉시 표시
 * - react-hook-form + zod로 이메일/토큰/새 비밀번호/확인 검증
 * - NOT_FOUND 에러: 이메일 필드에 서버 에러 메시지를 주입하여 사용자에게 명확히 안내
 * - 성공 시 로그인 페이지로 이동(replace=true)
 *
 * 운영 포인트:
 * - token 필드는 숨겨진 입력값으로 사용자가 직접 수정하지 않도록 설계
 * - 토큰 만료/오사용 에러는 toast.error + 이메일 필드 에러로 이중 안내
 */

const schema = z
    .object({
        email: z.string().email('이메일 형식이 올바르지 않습니다.'),
        // token은 URL에서 읽어 폼 기본값으로 주입; 입력값 검증은 서버에서 최종 처리
        token: z.string().min(1, '토큰이 없습니다. 메일 링크를 다시 확인해 주세요.'),
        newPassword: authLib.passwordSchema,
        confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: '비밀번호가 일치하지 않습니다.',
        path: ['confirmPassword'],
    })

type FormValues = z.infer<typeof schema>

/**
 * ResetPasswordPage
 *
 * 역할/목적:
 * - 비밀번호 재설정 폼과 제출 처리를 담당하는 최상위 컴포넌트
 *
 * URL 파라미터 처리:
 * - email/token이 없으면 "잘못된 링크" UI를 즉시 반환(조기 반환 패턴)
 * - 유효한 파라미터가 있으면 폼 기본값으로 설정하여 숨겨진 토큰 값으로 API 호출
 */
export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()

    // URL 쿼리에서 email/token 추출 (없으면 "잘못된 링크" 처리)
    const email = searchParams.get('email')
    const token = searchParams.get('token')

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setError,
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            email: searchParams.get('email') ?? '',
            token: searchParams.get('token') ?? '',
        },
    })

    const onSubmit = async (values: FormValues) => {
        if (!email || !token) {
            toast.error('잘못된 비밀번호 재설정 링크입니다.')
            return
        }

        try {
            await authApi.confirmPasswordReset({
                email: values.email,
                token: values.token,
                newPassword: values.newPassword,
            })

            toast.success('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.')
            navigate(ROUTES.login, { replace: true })
        } catch (error: unknown) {
            const code = getErrorCode(error)
            const msg = getErrorMessage(error, '비밀번호 재설정에 실패했습니다. 링크가 만료되었을 수 있습니다.')

            if (code === 'NOT_FOUND') {
                setError('email', {
                    type: 'server',
                    message: msg,
                })
            }

            toast.error(msg)
        }
    }

    if (!email || !token) {
        return (
            <div className='mx-auto max-w-md space-y-4 rounded-3xl border border-red-300/30 bg-red-500/10 p-6 backdrop-blur'>
                <h2 className='text-xl font-semibold text-white'>비밀번호 재설정</h2>
                <p className='text-sm text-red-200'>잘못된 링크입니다. 이메일의 링크를 다시 확인해 주세요.</p>
            </div>
        )
    }

    return (
        <div className='mx-auto max-w-md space-y-6 rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur'>
            <h2 className='text-xl font-semibold text-white'>비밀번호 재설정</h2>
            <p className='text-xs text-white/75'>
                새 비밀번호를 입력해 주세요.
                <span className='mt-1 block text-[11px] text-white/65'>{authLib.passwordComplexityMessage()}</span>
            </p>

            <form className='space-y-4' onSubmit={handleSubmit(onSubmit)}>
                <div>
                    <label className='block text-sm font-medium text-white'>이메일</label>
                    <input type='email' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('email')} />
                    {errors.email ? <p className='mt-1 text-xs text-red-200'>{errors.email.message}</p> : null}
                </div>

                <div>
                    <label className='block text-xs font-medium text-white'>새 비밀번호</label>
                    <input type='password' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('newPassword')} />
                    {errors.newPassword ? <p className='mt-1 text-xs text-red-200'>{errors.newPassword.message}</p> : null}
                </div>

                <div>
                    <label className='block text-xs font-medium text-white'>새 비밀번호 확인</label>
                    <input type='password' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('confirmPassword')} />
                    {errors.confirmPassword ? <p className='mt-1 text-xs text-red-200'>{errors.confirmPassword.message}</p> : null}
                </div>

                <Button type='submit' variant='secondary' fullWidth loading={isSubmitting} loadingText='재설정 중...'>비밀번호 재설정</Button>
            </form>
        </div>
    )
}