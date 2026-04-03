// src/pages/RegisterPage.tsx

import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { ROUTES } from '@/app/navigation/navigation'
import { api as authApi, lib as authLib } from '@/domains/auth'
import { getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

/**
 * RegisterPage.tsx (Page - 회원가입 페이지)
 *
 * 역할/목적:
 * - 이메일/표시명/비밀번호를 입력받아 신규 계정을 생성하는 페이지
 * - 가입 완료 후 이메일 인증 안내와 함께 로그인 페이지로 이동
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · RegisterPage  - 회원가입 페이지 컴포넌트
 *
 * 동작 방식:
 * - react-hook-form + zod로 이메일/표시명/비밀번호/확인 유효성 검증
 * - authLib.passwordSchema로 비밀번호 복잡도 정책을 공유 라이브러리에서 재사용
 * - .refine으로 비밀번호 일치 여부를 폼 수준에서 검증
 * - 가입 성공 시 toast + navigate(로그인 페이지, fromRegister=true 상태)로 안내
 *
 * 운영 포인트:
 * - 비밀번호 복잡도 메시지는 authLib.passwordComplexityMessage()로 표시하여 정책 변경 시 단일 지점에서 관리
 * - 가입 오류는 toast.error로 표시하며, 세분화된 에러 코드 처리는 현재 하지 않음(추후 필요 시 확장)
 */

const schema = z
    .object({
        email: z.string().email('이메일 형식이 올바르지 않습니다.'),
        displayName: z.string().min(1, '이름(표시명)을 입력해 주세요.').max(80, '최대 80자까지 입력 가능합니다.'),
        // 비밀번호 복잡도 규칙은 authLib에서 중앙 관리하여 LoginPage/ResetPasswordPage와 동일 정책 적용
        password: authLib.passwordSchema,
        confirmPassword: z.string(),
    })
    // refine으로 두 비밀번호 필드 일치 여부를 폼 수준에서 검증
    .refine((data) => data.password === data.confirmPassword, {
        message: '비밀번호가 일치하지 않습니다.',
        path: ['confirmPassword'],
    })

type FormValues = z.infer<typeof schema>

/**
 * RegisterPage
 *
 * 역할/목적:
 * - 회원가입 폼과 제출 처리를 담당하는 최상위 컴포넌트
 *
 * 가입 성공 흐름:
 * - 성공 toast → navigate(로그인 페이지, { fromRegister: true }) → 로그인 페이지에서 가입 완료 안내 표시
 * - replace=true로 이동하여 가입 폼이 뒤로가기 히스토리에 남지 않게 처리
 */
export default function RegisterPage() {
    const navigate = useNavigate()
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    })

    const onSubmit = async (values: FormValues) => {
        try {
            await authApi.register({
                email: values.email,
                password: values.password,
                displayName: values.displayName,
            })

            toast.success('회원가입이 완료되었습니다.', {
                description: '입력하신 이메일로 인증 메일을 보냈습니다. 메일의 링크를 클릭한 뒤 로그인해 주세요.',
            })

            navigate(ROUTES.login, { replace: true, state: { fromRegister: true } })
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, '회원가입 처리 중 오류가 발생했습니다.'))
        }
    }

    return (
        <div className='mx-auto max-w-md space-y-6 rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur'>
            <h2 className='text-xl font-semibold text-white'>회원가입</h2>
            <p className='text-xs text-white/75'>{authLib.passwordComplexityMessage()}</p>

            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
                <div>
                    <label className='block text-sm font-medium text-white'>이메일</label>
                    <input type='email' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('email')} />
                    {errors.email ? <p className='mt-1 text-xs text-red-200'>{errors.email.message}</p> : null}
                </div>

                <div>
                    <label className='block text-sm font-medium text-white'>이름(표시명)</label>
                    <input type='text' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('displayName')} />
                    {errors.displayName ? <p className='mt-1 text-xs text-red-200'>{errors.displayName.message}</p> : null}
                </div>

                <div>
                    <label className='block text-sm font-medium text-white'>비밀번호</label>
                    <input type='password' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('password')} />
                    {errors.password ? <p className='mt-1 text-xs text-red-200'>{errors.password.message}</p> : null}
                </div>

                <div>
                    <label className='block text-sm font-medium text-white'>비밀번호 확인</label>
                    <input type='password' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('confirmPassword')} />
                    {errors.confirmPassword ? <p className='mt-1 text-xs text-red-200'>{errors.confirmPassword.message}</p> : null}
                </div>

                <Button type='submit' variant='secondary' fullWidth loading={isSubmitting} loadingText='가입 중...'>회원가입</Button>
            </form>

            <p className='text-sm text-white/75'>이미 계정이 있으신가요? <Link to={ROUTES.login} className='text-sky-200 hover:text-sky-100 hover:underline'>로그인</Link></p>
        </div>
    )
}