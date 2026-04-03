// src/pages/AttractionsIntroPage.tsx

import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ATTRACTIONS_PAGE_SIZE, ROUTES, buildAttractionsListSearchParams } from '@/app/navigation/navigation'
import { Pagination } from '@/shared/ui/Pagination'
import { getErrorMessage } from '@/shared/lib/apiError'

import {
    api as attractionApi,
    model as attractionModel,
    ui as attractionUi,
    type AttractionIntroCardModel,
} from '@/domains/attraction'

/**
 * AttractionsIntroPage.tsx (Page - 관광지 소개 목록 페이지)
 *
 * 역할/목적:
 * - 부산 관광지를 소개 카드 형태로 탐색할 수 있는 페이지
 * - 키워드 검색 + 페이지네이션을 통해 원하는 관광지를 빠르게 찾을 수 있는 주요 탐색 화면
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · AttractionsIntroPage  - 관광지 소개 목록 페이지 컴포넌트
 *
 * 데이터 흐름:
 *   useIntroSearchParams (URL → page/size/keyword 상태)
 *      ↓
 *   useAttractionIntroCardsPage (API 조회)
 *      ↓
 *   toIntroModel (AttractionIntroCardResponse → AttractionIntroCardModel 변환)
 *      ↓
 *   AttractionsIntroHero / AttractionsIntroGrid / Pagination
 *
 * 동작 방식:
 * - URL searchParams를 SSOT로 사용하여 page/size/keyword를 관리
 * - API 에러/결과 없음/정상 각 상태를 명시적으로 분기 렌더링
 * - API 응답 DTO를 UI 모델로 변환(toIntroModel)하여 API 계약과 UI 계약을 분리
 *
 * 운영 포인트:
 * - ATTRACTIONS_PAGE_SIZE: 소개 페이지 한 화면 카드 수, 변경 시 스켈레톤 수와 함께 검토 필요
 * - 검색 상태 초기화(전체 보기) 링크는 buildAttractionsListSearchParams를 통해 정규화된 URL을 생성
 */

/**
 * AttractionsIntroPage
 *
 * 역할/목적:
 * - 관광지 소개 목록 페이지의 최상위 컴포넌트
 *
 * 상태/데이터 정책:
 * - useIntroSearchParams로 URL 기반 페이지/키워드 상태를 관리
 * - API 응답 content를 useMemo로 toIntroModel에 위임하여 렌더링마다 불필요한 변환을 방지
 */
export default function AttractionsIntroPage() {
    const { page, size, keyword, setPage, setKeyword, clearKeyword } = attractionModel.useIntroSearchParams()

    const listQuery = attractionApi.useAttractionIntroCardsPage({
        page,
        size,
        // 빈 문자열은 "조건 없음"으로 간주하여 API에 keyword 파라미터를 포함하지 않음
        keyword: keyword.length > 0 ? keyword : undefined,
    })

    // API 응답 DTO → UI 모델 변환: listQuery.data가 바뀔 때만 재계산
    const items = useMemo<AttractionIntroCardModel[]>(() => {
        const content: attractionApi.AttractionIntroCardResponse[] = listQuery.data?.content ?? []
        return content.map(toIntroModel)
    }, [listQuery.data])

    const totalElements = listQuery.data?.totalElements ?? 0
    const totalPages = listQuery.data?.totalPages ?? 0

    if (listQuery.isError) {
        return (
            <div className='mx-auto w-full max-w-7xl space-y-6 px-4 py-8'>
                <attractionUi.AttractionsIntroHero keyword={keyword} totalElements={0} onSearch={setKeyword} onClear={clearKeyword} />

                <section className='rounded-3xl border border-white/15 bg-white/10 p-6 text-white backdrop-blur'>
                    <div className='text-sm font-semibold'>불러오기에 실패했습니다.</div>
                    <div className='mt-2 text-sm text-white/70'>
                        {getErrorMessage(listQuery.error, '잠시 후 다시 시도해 주세요.')}
                    </div>

                    <div className='mt-4 flex flex-wrap gap-3'>
                        <Link to={ROUTES.home} className='text-sm font-semibold text-white hover:underline'>홈으로</Link>
                        <Link
                            to={`${ROUTES.attractions}?${buildAttractionsListSearchParams({ page: 0, size: ATTRACTIONS_PAGE_SIZE }).toString()}`}
                            className='text-sm font-semibold text-white/80 hover:text-white hover:underline'
                        >
                            전체 보기
                        </Link>
                    </div>
                </section>
            </div>
        )
    }

    if (!listQuery.isLoading && totalElements === 0) {
        return (
            <div className='mx-auto w-full max-w-7xl space-y-6 px-4 py-8'>
                <attractionUi.AttractionsIntroHero keyword={keyword} totalElements={0} onSearch={setKeyword} onClear={clearKeyword} />

                <section className='rounded-3xl border border-white/15 bg-white/10 p-6 text-white backdrop-blur'>
                    <div className='text-sm font-semibold'>검색 결과가 없습니다.</div>
                    <div className='mt-2 text-sm text-white/70'>다른 키워드로 다시 검색해 보세요.</div>

                    <div className='mt-4 flex flex-wrap gap-3'>
                        <Link to={ROUTES.home} className='text-sm font-semibold text-white hover:underline'>홈으로</Link>
                        <button
                            type='button'
                            onClick={clearKeyword}
                            className='rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/15 hover:text-white'
                        >
                            검색어 초기화
                        </button>
                        <Link
                            to={`${ROUTES.attractions}?${buildAttractionsListSearchParams({ page: 0, size: ATTRACTIONS_PAGE_SIZE }).toString()}`}
                            className='text-sm font-semibold text-white/80 hover:text-white hover:underline'
                        >
                            전체 보기
                        </Link>
                    </div>
                </section>
            </div>
        )
    }

    return (
        <div className='mx-auto w-full max-w-7xl space-y-6 px-4 py-8'>
            <attractionUi.AttractionsIntroHero keyword={keyword} totalElements={totalElements} onSearch={setKeyword} onClear={clearKeyword} />
            <attractionUi.AttractionsIntroGrid items={items} isLoading={listQuery.isLoading} skeletonCount={ATTRACTIONS_PAGE_SIZE} />
            {totalPages > 1 ? (
                <div className='pt-2'>
                    <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </div>
            ) : null}
        </div>
    )
}

/**
 * toIntroModel
 *
 * 역할/목적:
 * - API 응답 DTO(AttractionIntroCardResponse)를 UI 모델(AttractionIntroCardModel)로 변환
 *
 * 설계 이유:
 * - API 계약과 UI 계약을 분리함으로써, 백엔드 응답 스키마가 변경되어도 이 함수에서 흡수 가능
 * - 현재는 필드가 동일하지만, 변환 계층을 두면 이후 정규화/가공 로직 추가가 용이
 */
function toIntroModel(item: attractionApi.AttractionIntroCardResponse): AttractionIntroCardModel {
    return {
        keyId: item.keyId,
        placeName: item.placeName,
        address: item.address,
        categoryName: item.categoryName,
        storyTitle: item.storyTitle,
        storySummary: item.storySummary,
        storyUrl: item.storyUrl,
        coreKeywords: item.coreKeywords,
        imageUrl: item.imageUrl,
    }
}