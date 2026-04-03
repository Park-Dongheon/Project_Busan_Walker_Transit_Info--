// src/shared/ui/layout/SiteHeader.tsx

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ROUTES, ATTRACTIONS_PAGE_SIZE, buildAttractionsListSearchParams } from '@/app/navigation/navigation'
import { toAuthRedirectFrom } from '@/app/navigation/authRedirect'
import { model as authModel } from '@/domains/auth'
import { getErrorMessage } from '@/shared/lib/apiError'
import { Button } from '@/shared/ui/Button'
import { AppNavLink } from './AppNavLink'

/**
 * SiteHeader (전역 상단 내비게이션 바)
 *
 * 역할/목적:
 * - 모든 페이지 상단에 고정(sticky)으로 표시되는 전역 헤더 컴포넌트
 * - 로고, 주요 메뉴 내비게이션, 관광지 검색 폼, 로그인/로그아웃/회원가입 버튼 포함
 *
 * 공개 정책 / 설계 원칙:
 * - App.tsx에서 단 한 번 렌더링되며, 외부 props 없이 AuthContext와 Router에서 직접 상태 조회
 * - 인증 상태(user)에 따라 내비게이션 항목(즐겨찾기, 내 정보)과 버튼(로그인/로그아웃) 조건부 표시
 *
 * 동작 방식:
 * - URL의 keyword 파라미터를 읽어 검색 입력창을 초기화하고, 제출 시 attractions 페이지로 이동
 * - 로그아웃은 authModel.logout()을 호출하고 성공 시 홈으로 redirect
 * - 로그인 버튼 클릭 시 현재 위치(location)를 state.from에 담아 로그인 페이지로 이동
 *   (로그인 성공 후 원래 페이지로 돌아오기 위한 authRedirect 흐름)
 * - 반응형: md 이상에서는 수평 nav + 검색 폼, md 미만에서는 아코디언 없이 개별 링크 + 검색 폼 표시
 *
 * 운영 포인트:
 * - z-40 sticky 포지션이므로 하위 UI 오버레이(모달, 드롭다운 등)의 z-index와 충돌하지 않도록 주의
 * - isLoggingOut 플래그로 로그아웃 버튼 중복 클릭 방지
 * - 검색 초안(draft)은 URL keyword와 동기화되므로, 외부에서 URL을 바꾸면 draft도 초기화
 */
export function SiteHeader() {
    const navigate = useNavigate()
    const location = useLocation()
    const { user, logout } = authModel.useAuth()
    const [searchParams] = useSearchParams()

    // URL의 keyword 파라미터를 검색 입력창의 초기값으로 사용
    const keywordInUrl = searchParams.get('keyword') ?? ''
    const [draft, setDraft] = useState(keywordInUrl)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const isAuthenticated = Boolean(user)

    // 외부에서 URL keyword가 변경(뒤로가기, 직접 링크 등)되면 입력창 draft도 동기화
    useEffect(() => {
        setDraft(keywordInUrl)
    }, [keywordInUrl])

    function handleDraftChange(event: ChangeEvent<HTMLInputElement>): void {
        setDraft(event.target.value)
    }

    /**
     * 검색 폼 제출 핸들러
     * - 현재 draft 키워드로 attractions 목록 페이지로 이동
     * - 항상 page=0부터 시작해 이전 검색 결과가 남아있지 않도록 함
     */
    function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault()
        const search = buildAttractionsListSearchParams({
            page: 0,
            size: ATTRACTIONS_PAGE_SIZE,
            keyword: draft,
        }).toString()

        navigate({ pathname: ROUTES.attractions, search })
    }

    /**
     * 로그인 페이지로 이동
     * - 현재 location을 state.from에 담아 로그인 성공 후 원래 페이지로 복귀 가능하도록 처리
     */
    function requestLogin(): void {
        navigate(ROUTES.login, {
            state: { from: toAuthRedirectFrom(location) },
        })
    }

    async function handleLogout(): Promise<void> {
        // 중복 클릭 방지
        if (isLoggingOut) return

        setIsLoggingOut(true)
        try {
            await logout()
            toast.success('로그아웃 되었습니다.')
            navigate(ROUTES.home, { replace: true })
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, '로그아웃 처리 중 오류가 발생했습니다.'))
        } finally {
            setIsLoggingOut(false)
        }
    }

    return (
        <header className='sticky top-0 z-40 border-b border-white/10 bg-black/25 backdrop-blur'>
            <div className='mx-auto flex max-w-7xl items-center gap-3 px-4 py-3'>
                <Link
                    to={ROUTES.home}
                    className='shrink-0 rounded-2xl px-3 py-2 text-base font-black tracking-tight text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30'
                    aria-label='홈으로 이동'
                >
                    Busan Hiker
                </Link>

                <nav className='hidden items-center gap-1 md:flex' aria-label='주요 메뉴'>
                    <AppNavLink to={ROUTES.home} end label='홈' />
                    <AppNavLink to={ROUTES.attractions} label='관광지 소개' />
                    <AppNavLink to={ROUTES.map} label='대중교통 지도' />
                    {isAuthenticated ? <AppNavLink to={ROUTES.favorites} label='즐겨찾기' /> : null}
                    {user?.role === 'ADMIN' ? <AppNavLink to={ROUTES.adminAttractionImage} label='관리자' /> : null}
                </nav>

                <div className='ml-auto flex items-center gap-2'>
                    <form onSubmit={handleSearchSubmit} className='hidden items-center gap-2 md:flex' aria-label='관광지 검색'>
                        <input
                            value={draft}
                            onChange={handleDraftChange}
                            placeholder='관광지 검색'
                            className='w-64 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/30'
                            aria-label='검색어 입력'
                        />
                        <Button type='submit' variant='secondary' size='md'>검색</Button>
                    </form>

                    {isAuthenticated ? (
                        <div className='flex items-center gap-2'>
                            <Link
                                to={ROUTES.myAccount}
                                className='hidden rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/15 md:block'
                                aria-label='내 정보'
                            >
                                {user?.displayName ?? '내 정보'}
                            </Link>
                            <Button
                                type='button'
                                onClick={() => void handleLogout()}
                                loading={isLoggingOut}
                                loadingText='로그아웃 중...'
                                variant='ghost'
                                size='md'
                            >
                                로그아웃
                            </Button>
                        </div>
                    ) : (
                        <div className='flex items-center gap-2'>
                            <Button type='button' onClick={requestLogin} variant='secondary' size='md' aria-label='로그인'>로그인</Button>
                            <Link
                                to={ROUTES.register}
                                className='hidden rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/15 md:block'
                                aria-label='회원가입'
                            >
                                회원가입
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            <div className='mx-auto max-w-7xl px-4 pb-3 md:hidden'>
                <div className='flex flex-wrap items-center gap-2' aria-label='모바일 메뉴'>
                    <AppNavLink to={ROUTES.home} end label='홈' />
                    <AppNavLink to={ROUTES.attractions} label='관광지 소개' />
                    <AppNavLink to={ROUTES.map} label='대중교통 지도' />
                    {isAuthenticated ? <AppNavLink to={ROUTES.favorites} label='즐겨찾기' /> : null}
                    {isAuthenticated ? <AppNavLink to={ROUTES.myAccount} label='내 정보' /> : null}
                    {user?.role === 'ADMIN' ? <AppNavLink to={ROUTES.adminAttractionImage} label='관리자' /> : null}
                </div>

                <form onSubmit={handleSearchSubmit} className='mt-3 flex items-center gap-2' aria-label='모바일 관광지 검색'>
                    <input
                        value={draft}
                        onChange={handleDraftChange}
                        placeholder='관광지 검색'
                        className='flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/30'
                        aria-label='검색어 입력'
                    />
                    <Button type='submit' variant='secondary' size='md'>검색</Button>
                </form>
            </div>
        </header>
    )
}
