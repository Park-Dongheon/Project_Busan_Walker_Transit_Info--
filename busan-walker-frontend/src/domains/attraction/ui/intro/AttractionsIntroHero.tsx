// src/domains/attraction/ui/intro/AttractionsIntroHero.tsx

import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react';

/**
 * AttractionsIntroHero.tsx (UI Layer - 소개 페이지 히어로/검색 헤더 컴포넌트)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지 상단에 위치하는 "히어로 섹션"으로, 페이지 제목/설명, 검색 폼, 검색 결과 카운트를 포함
 * - 부모(페이지)가 URL 기반 keyword 상태를 소유하고, 이 컴포넌트는 UI/UX 인터랙션만 담당
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionsIntroHeroProps  - 히어로 컴포넌트 props 타입
 *      · AttractionsIntroHero       - 소개 페이지 히어로/검색 헤더 컴포넌트
 *
 * 동작 방식:
 * - 내부 draft 상태로 "입력 중인 검색어"를 관리하고, 폼 제출 시 onSearch(draft.trim())를 호출
 * - keyword prop이 외부에서 변경되면 useEffect로 draft를 동기화하여 URL과 입력 필드 일치
 * - hasKeyword 판정: keyword.trim().length > 0이면 검색 중인 것으로 간주, 초기화 버튼 노출
 * - 접근성: useId()로 label-input 연결 보장, sr-only label로 시각적 레이아웃과 접근성을 모두 확보
 *
 * 운영 포인트:
 * - 검색 처리(실제 API 호출, URL 업데이트)는 onSearch/onClear 콜백을 통해 부모에 위임
 *   → 이 컴포넌트는 "입력 UX"만 책임지며 상태 변경 로직과 분리됨
 */

/**
 * AttractionsIntroHeroProps
 *
 * 역할/목적:
 * - AttractionsIntroHero 컴포넌트가 받는 props 계약
 *
 * 정책:
 * - keyword: 현재 적용된 검색어 (URL 기반 SSOT에서 전달)
 * - totalElements: 현재 조건에 맞는 총 결과 수
 * - onSearch: 검색어 적용 콜백 (URL/캐시 업데이트는 부모 책임)
 * - onClear: 검색어 초기화 콜백
 */
export type AttractionsIntroHeroProps = {
    keyword: string
    totalElements: number
    onSearch: (nextKeyword: string) => void
    onClear: () => void
}

/**
 * AttractionsIntroHero
 *
 * 역할/목적:
 * - 소개 페이지 상단 히어로/검색 헤더 컴포넌트
 *
 * 상태 설계:
 * - draft: 현재 입력 필드에 작성 중인 검색어(로컬 상태)
 * - keyword(prop): 실제로 적용된 검색어(URL 기반 SSOT, 부모 소유)
 * - keyword가 외부에서 바뀌면 draft를 동기화하여 입력 필드와 URL 상태 일치
 */
export function AttractionsIntroHero({ keyword, totalElements, onSearch, onClear }: AttractionsIntroHeroProps) {
    // draft: 입력 필드의 로컬 상태. keyword(URL 기반)와 분리하여 "입력 중" 상태를 유지
    const [draft, setDraft] = useState(keyword)
    // useId()로 고유 id를 생성하여 label과 input을 연결(접근성 보장, id 충돌 방지)
    const keywordInputId = useId()

    // keyword prop이 외부에서 변경(예: URL 직접 수정, clearKeyword)되면 draft를 동기화
    useEffect(() => {
        setDraft(keyword)
    }, [keyword])

    // 초기화 버튼 노출 여부: 공백만 있는 keyword는 "검색 조건 없음"으로 간주
    const hasKeyword = keyword.trim().length > 0

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault()
        // trim 후 호출하여 공백만 입력된 검색어가 조건으로 적용되는 것을 방지
        onSearch(draft.trim())
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>): void {
        setDraft(event.target.value)
    }

    return (
        <section className='rounded-3xl border border-white/15 bg-white/10 p-7 backdrop-blur md:p-10'>
            <div className='flex flex-col gap-6 md:flex-row md:items-end md:justify-between'>
                <div className='space-y-2'>
                    <h1 className='text-2xl font-bold text-white md:text-3xl'>관광지 소개</h1>
                    <p className='text-sm text-white/70'>부산 도보 여행을 위한 추천 스토리 카드입니다.</p>
                    <div className='text-xs text-white/60'>
                        총 <span className='font-semibold text-white'>{totalElements}</span>개
                        {hasKeyword ? (
                            <>
                                {' '}검색어{' '}
                                <span className='rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-white/80'>
                                    {keyword}
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className='flex w-full gap-2 md:w-auto'>
                    <label htmlFor={keywordInputId} className='sr-only'>
                        관광지 소개 검색어
                    </label>

                    <input
                        id={keywordInputId}
                        name='keyword'
                        type='search'
                        value={draft}
                        onChange={handleChange}
                        placeholder='관광지/주소/카테고리 검색'
                        className='w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none backdrop-blur md:w-72'
                    />

                    <button
                        type='submit'
                        className='rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15'
                    >
                        검색
                    </button>

                    {hasKeyword ? (
                        <button
                            type='button'
                            onClick={onClear}
                            className='rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/15 hover:text-white'
                        >
                            초기화
                        </button>
                    ) : null}
                </form>
            </div>
        </section>
    )
}