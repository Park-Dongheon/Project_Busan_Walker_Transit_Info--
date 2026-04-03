// src/pages/MyAccountPage.tsx

import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import z from 'zod'
import { toast } from 'sonner'

import { queryClient } from '@/app/query/queryClient'
import { api as accountApi, type MyAccount, ui as accountUi } from '@/domains/account'
import { lib as authLib, model as authModel } from '@/domains/auth'
import { getErrorCode, getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'

/**
 * MyAccountPage.tsx (Page - 마이페이지 / 내 계정 관리 페이지)
 *
 * 역할/목적:
 * - 로그인한 사용자의 프로필 수정, 비밀번호 변경, 계정 활성화/비활성화를 한 화면에서 관리하는 페이지
 * - 라우터 레벨의 RequireAuth에 의해 보호되므로, 이 컴포넌트는 "인증 완료 상태"를 전제로 동작
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · MyAccountPage  - 마이페이지 컴포넌트
 *
 * 동작 방식:
 * - useQuery(['me'])로 내 계정 정보를 조회하고, 각 폼에 기본값으로 반영
 * - 프로필 수정(표시명): useMutation + onSuccess에서 queryClient.setQueryData로 캐시 즉시 갱신
 * - 비밀번호 변경: 성공 시 로그아웃(세션 무효화 후 재로그인 유도)
 * - 계정 비활성화: confirm 대화상자로 의도 확인 후 비활성화, 성공 시 로그아웃
 * - 에러 처리: VALIDATION_ERROR 코드로 특정 폼 필드에 서버 에러를 주입하여 정확한 위치를 안내
 *
 * 운영 포인트:
 * - queryClient.setQueryData(['me'], data): 서버 응답으로 캐시를 즉시 업데이트하여 재조회 없이 UI를 갱신
 * - 비밀번호 변경 성공 시 logout()을 호출하여 이전 세션 토큰을 무효화(보안 정책)
 * - 계정 비활성화 후 다시 로그인하면 자동 활성화되도록 백엔드 정책이 설정되어 있음
 */

const profileSchema = z.object({
    displayName: z.string().min(1, '이름(표시명)을 입력해 주세요.').max(80, '최대 80자까지 입력 가능합니다.'),
})

type ProfileFormValues = z.infer<typeof profileSchema>

const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요.'),
        // 비밀번호 복잡도 정책은 authLib에서 중앙 관리하여 RegisterPage와 동일 규칙 적용
        newPassword: authLib.passwordSchema,
        confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: '비밀번호가 일치하지 않습니다.',
        path: ['confirmPassword'],
    })

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

/**
 * MyAccountPage
 *
 * 역할/목적:
 * - 마이페이지의 최상위 컴포넌트: 프로필/비밀번호/계정 상태 관리를 통합
 *
 * 상태/폼 설계:
 * - profileForm: 표시명 수정 폼 (me 데이터가 로드되면 reset으로 기본값 반영)
 * - passwordForm: 비밀번호 변경 폼 (성공 시 reset + logout)
 * - 각 mutation은 독립적으로 관리하여 하나의 실패가 다른 폼에 영향을 주지 않게 분리
 */
export default function MyAccountPage() {
    const { logout } = authModel.useAuth()

    const { data: me, isLoading, isError, error, refetch } = useQuery<MyAccount>({
        queryKey: ['me'],
        queryFn: accountApi.getMyAccount,
    })

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: { displayName: '' },
    })

    // me 데이터가 로드되면 프로필 폼에 현재 표시명을 기본값으로 설정
    useEffect(() => {
        if (me) {
            profileForm.reset({ displayName: me.displayName })
        }
    }, [me, profileForm])

    const passwordForm = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(changePasswordSchema),
    })

    const updateProfileMutation = useMutation({
        mutationFn: (values: ProfileFormValues) => accountApi.updateProfile(values),
        onSuccess: (data) => {
            toast.success('프로필이 수정되었습니다.')
            // 서버 응답으로 ['me'] 캐시를 즉시 갱신하여 재조회 없이 UI를 최신 상태로 유지
            queryClient.setQueryData(['me'], data)
        },
        onError: (mutationError: unknown) => {
            toast.error(getErrorMessage(mutationError, '프로필 수정에 실패했습니다.'))
        },
    })

    const changePasswordMutation = useMutation({
        mutationFn: (values: ChangePasswordFormValues) =>
            accountApi.changePassword({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
            }),
        onSuccess: () => {
            toast.success('비밀번호가 변경되었습니다. 다시 로그인해 주세요.')
            passwordForm.reset()
            // 비밀번호 변경 후 세션 무효화를 위해 즉시 로그아웃(보안 정책)
            void logout()
        },
        onError: (mutationError: unknown) => {
            const code = getErrorCode(mutationError)
            const msg = getErrorMessage(
                mutationError,
                '비밀번호 변경에 실패했습니다. 현재 비밀번호를 다시 확인해 주세요.',
            )
            const lowerMsg = msg.toLowerCase()

            if (
                code === 'VALIDATION_ERROR' &&
                (lowerMsg.includes('현재 비밀번호') || lowerMsg.includes('current password'))
            ) {
                passwordForm.setError('currentPassword', {
                    type: 'server',
                    message: '현재 비밀번호가 올바르지 않습니다.',
                })
                passwordForm.setFocus('currentPassword')
                return
            }

            if (
                code === 'VALIDATION_ERROR' &&
                (lowerMsg.includes('동일한 비밀번호') || lowerMsg.includes('recently used'))
            ) {
                passwordForm.setError('newPassword', {
                    type: 'server',
                    message: '이전에 사용한 비밀번호는 다시 사용할 수 없습니다.',
                })
                passwordForm.setError('confirmPassword', {
                    type: 'server',
                    message: '새 비밀번호를 다시 한번 입력해 주세요.',
                })
                passwordForm.setFocus('newPassword')
                return
            }

            toast.error(msg)
        },
    })

    const updateStatusMutation = useMutation({
        mutationFn: (active: boolean) => accountApi.updateStatus({ active }),
        onSuccess: (data) => {
            // 상태 변경 결과를 캐시에 즉시 반영
            queryClient.setQueryData(['me'], data)

            if (!data.active) {
                toast.success('계정이 비활성화되었습니다. 다시 로그인하면 자동으로 활성화되는 계정일 수 있습니다.')
                // 비활성화 후 즉시 로그아웃하여 비활성 상태인 채로 앱을 계속 사용하는 것을 방지
                void logout()
                return
            }

            toast.success('계정이 활성화되었습니다.')
        },
        onError: (mutationError: unknown) => {
            toast.error(getErrorMessage(mutationError, '계정 상태 변경에 실패했습니다.'))
        },
    })

    const onSubmitProfile = (values: ProfileFormValues) => {
        updateProfileMutation.mutate({ displayName: values.displayName.trim() })
    }

    const onSubmitPassword = (values: ChangePasswordFormValues) => {
        passwordForm.clearErrors()
        changePasswordMutation.mutate(values)
    }

    const handleToggleAccountStatus = (): void => {
        if (!me) return

        const nextActive = !me.active
        // 비활성화 시에만 confirm 대화상자로 사용자 의도를 재확인(실수로 비활성화 방지)
        if (!nextActive) {
            const ok = window.confirm(
                '계정을 비활성화하면 바로 로그아웃됩니다. 사용자가 직접 비활성화한 계정은 다시 로그인하면 자동으로 활성화될 수 있습니다. 계속할까요?',
            )
            if (!ok) return
        }

        updateStatusMutation.mutate(nextActive)
    }

    if (isLoading) {
        return (
            <div className='mx-auto max-w-5xl rounded-3xl border border-white/15 bg-white/10 p-6 text-center text-sm text-white/80 backdrop-blur'>
                내 정보를 불러오는 중...
            </div>
        )
    }

    if (isError) {
        return (
            <div className='mx-auto max-w-5xl rounded-3xl border border-red-300/30 bg-red-500/10 p-6 backdrop-blur'>
                <h2 className='text-lg font-semibold text-white'>마이페이지를 불러오지 못했습니다.</h2>
                <p className='mt-2 text-sm text-white/80'>{getErrorMessage(error, '잠시 후 다시 시도해 주세요.')}</p>
                <Button type='button' onClick={() => void refetch()} variant='secondary' className='mt-4'>다시 시도</Button>
            </div>
        )
    }

    if (!me) {
        return (
            <div className='mx-auto max-w-5xl rounded-3xl border border-white/15 bg-white/10 p-6 text-center text-sm text-white/80 backdrop-blur'>
                표시할 계정 정보가 없습니다.
            </div>
        )
    }

    const profileDirty = profileForm.formState.isDirty
    const profileHasError = Boolean(profileForm.formState.errors.displayName)

    return (
        <div className='mx-auto max-w-5xl space-y-6'>
            <accountUi.UserAccountHeader active={me.active} />

            <accountUi.UserBasicInfoSection email={me.email} role={me.role} emailVerified={me.emailVerified}>
                <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className='mt-4 space-y-3'>
                    <div>
                        <label className='block text-sm font-medium text-white'>표시 이름</label>
                        <input
                            type='text'
                            autoComplete='nickname'
                            className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                            {...profileForm.register('displayName')}
                        />
                        {profileForm.formState.errors.displayName ? (
                            <p className='mt-1 text-xs text-red-200'>{profileForm.formState.errors.displayName.message}</p>
                        ) : null}
                    </div>

                    <Button type='submit' variant='secondary' disabled={!profileDirty || profileHasError} loading={updateProfileMutation.isPending} loadingText='저장 중...'>
                        프로필 수정
                    </Button>
                </form>
            </accountUi.UserBasicInfoSection>

            <accountUi.UserPasswordSection passwordPolicyDescription={`${authLib.passwordComplexityMessage()} 이전과 동일한 비밀번호는 다시 사용할 수 없습니다.`}>
                <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className='mt-4 space-y-3'>
                    <div>
                        <label className='block text-sm font-medium text-white'>현재 비밀번호</label>
                        <input
                            type='password'
                            autoComplete='current-password'
                            className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                            {...passwordForm.register('currentPassword')}
                        />
                        {passwordForm.formState.errors.currentPassword ? (
                            <p className='mt-1 text-xs text-red-200'>{passwordForm.formState.errors.currentPassword.message}</p>
                        ) : null}
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-white'>새 비밀번호</label>
                        <input
                            type='password'
                            autoComplete='new-password'
                            className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                            {...passwordForm.register('newPassword')}
                        />
                        {passwordForm.formState.errors.newPassword ? (
                            <p className='mt-1 text-xs text-red-200'>{passwordForm.formState.errors.newPassword.message}</p>
                        ) : null}
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-white'>새 비밀번호 확인</label>
                        <input
                            type='password'
                            autoComplete='new-password'
                            className='mt-1 w-full rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                            {...passwordForm.register('confirmPassword')}
                        />
                        {passwordForm.formState.errors.confirmPassword ? (
                            <p className='mt-1 text-xs text-red-200'>{passwordForm.formState.errors.confirmPassword.message}</p>
                        ) : null}
                    </div>

                    <Button type='submit' variant='secondary' loading={changePasswordMutation.isPending} loadingText='변경 중...'>
                        비밀번호 변경
                    </Button>
                </form>
            </accountUi.UserPasswordSection>

            <accountUi.UserAccountStatusSection active={me.active} isPending={updateStatusMutation.isPending} onToggle={handleToggleAccountStatus} />
        </div>
    )
}