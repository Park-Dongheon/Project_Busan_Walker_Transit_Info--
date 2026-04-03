// src/pages/ForgotPasswordPage.tsx

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { api as authApi } from '@/domains/auth'
import { getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

/**
 * ForgotPasswordPage.tsx (Page - 비밀번호 찾기/재설정 요청 페이지)
 *
 * 역할/목적:
 * - 이메일 주소를 입력받아 비밀번호 재설정 링크를 발송하는 페이지
 * - 실제 계정 존재 여부와 무관하게 동일한 성공 메시지를 표시하여 계정 열거 공격을 방지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · ForgotPasswordPage  - 비밀번호 찾기 페이지 컴포넌트
 *
 * 동작 방식:
 * - react-hook-form + zod로 이메일 형식 검증
 * - 요청 성공 시 toast + 60초 쿨다운으로 남용 방지
 * - 쿨다운 중에는 버튼 비활성화 + 남은 시간 표시
 * - setInterval cleanup으로 언마운트 시 타이머 누수 방지
 *
 * 운영 포인트:
 * - 쿨다운(60초)은 클라이언트 측 UX 보조 장치이며, 서버에서도 rate-limit 정책이 적용되어야 함
 * - 요청 성공/실패 모두 toast로 표시하되, 계정 존재 여부를 암시하는 메시지는 지양
 */

const schema = z.object({
    email: z.string().email('이메일 형식이 올바르지 않습니다.'),
})

type FormValues = z.infer<typeof schema>

/**
 * ForgotPasswordPage
 *
 * 역할/목적:
 * - 비밀번호 재설정 이메일 발송 요청 폼을 제공하는 컴포넌트
 *
 * 쿨다운 정책:
 * - 요청 성공 후 60초 쿨다운을 설정하여 짧은 시간 내 반복 요청을 클라이언트 측에서 억제
 * - 쿨다운 타이머는 useEffect에서 관리하고 cleanup으로 누수를 방지
 */
export default function ForgotPasswordPage() {
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
    })

    const [cooldown, setCooldown] = useState(0)

    useEffect(() => {
        if (cooldown <= 0) return

        const timerId = window.setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) return 0
                return prev - 1
            })
        }, 1000)

        return () => {
            window.clearInterval(timerId)
        }
    }, [cooldown])

    const onSubmit = async (values: FormValues) => {
        if (cooldown > 0) {
            toast.error('잠시 후 다시 요청해 주세요.')
            return
        }

        try {
            await authApi.requestPasswordReset({ email: values.email })
            toast.success('비밀번호 재설정 링크를 이메일로 보냈습니다. 메일함을 확인해 주세요.')
            setCooldown(60)
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, '비밀번호 재설정 요청 중 오류가 발생했습니다.'))
        }
    }

    return (
        <div className='mx-auto max-w-md space-y-6 rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur'>
            <h2 className='text-xl font-semibold text-white'>비밀번호 찾기</h2>
            <p className='text-xs text-white/75'>가입한 이메일 주소를 입력하면 비밀번호 재설정 링크를 보내드립니다.</p>

            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
                <div>
                    <label className='block text-sm font-medium text-white'>이메일</label>
                    <input type='email' className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35' {...register('email')} />
                    {errors.email ? <p className='mt-1 text-xs text-red-200'>{errors.email.message}</p> : null}
                </div>

                <Button type='submit' variant='secondary' fullWidth loading={isSubmitting} disabled={cooldown > 0} loadingText='전송 중...'>
                    {cooldown > 0 ? `다시 보내기 (${cooldown}s)` : '재설정 링크 보내기'}
                </Button>
            </form>
        </div>
    )
}