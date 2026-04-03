// src/domains/attraction/ui/intro/AttractionIntroCard.tsx

import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { toAttractionDetailPath, toMapFocusPath } from '@/app/navigation/navigation';
import { resolveBackendAssetUrl } from '@/shared/api/core/baseURL';

import type { AttractionIntroCardModel } from '../../types';

/**
 * AttractionIntroCard.tsx (UI Layer - 소개 페이지 관광지 카드 컴포넌트)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지 그리드에서 "관광지 1건"을 카드 형태로 표시하는 UI 컴포넌트
 * - 썸네일 이미지, 카테고리 배지, 관광지명, 스토리 타이틀, 요약 텍스트, 주소, 지도 링크를 통합
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionIntroCardProps  - 컴포넌트 props 타입
 *      · AttractionIntroCard       - 소개 페이지 관광지 카드 컴포넌트
 *
 * 동작 방식:
 * - 카드 전체(article)를 덮는 투명 Link로 "상세 페이지 이동" 클릭 영역을 전체 카드에 부여
 * - 그 위에 z-20의 "지도에서 보기" 링크를 올려 독립적인 클릭 이벤트를 허용
 * - 이미지 URL은 resolveBackendAssetUrl로 백엔드 상대경로를 절대 URL로 변환
 * - storySummary가 없으면 대체 문구를 표시하여 빈 카드 노출을 방지
 *
 * 운영 포인트:
 * - 카드 레이아웃 높이는 고정하지 않으므로, 그리드 정렬이 필요하면 상위 그리드 컨테이너에서 관리
 * - 이미지 로딩은 lazy로 처리하여 스크롤 진입 전 네트워크 요청을 억제
 */

/**
 * AttractionIntroCardProps
 *
 * 역할/목적:
 * - AttractionIntroCard 컴포넌트가 받는 props 계약
 *
 * 정책:
 * - attraction: AttractionIntroCardModel 타입(소개 페이지 전용 UI 모델)을 주입
 */
export type AttractionIntroCardProps = {
    attraction: AttractionIntroCardModel
}

/**
 * AttractionIntroCard
 *
 * 역할/목적:
 * - 소개(인트로) 페이지 그리드에서 관광지 1건을 표시하는 카드 컴포넌트
 *
 * 렌더링 정책:
 * - 카드 전체를 상세 페이지로 이동하는 링크로 감싸되, z-10으로 전체 클릭 영역을 확보
 * - "지도에서 보기" 링크는 z-20으로 카드 링크 위에 독립적으로 위치하여 별도 이동 가능
 * - 이미지가 없으면 빈 div로 이미지 자리를 유지하여 레이아웃 안정성 보장
 * - null 허용 필드(categoryName/storyTitle/address)는 조건부 렌더링으로 "없음" 상태를 자연스럽게 처리 (null-safe)
 */
export function AttractionIntroCard({ attraction }: AttractionIntroCardProps) {
    // keyId가 바뀔 때만 경로를 재계산하여 불필요한 re-render 비용 절감
    const detailPath = useMemo(() => toAttractionDetailPath(attraction.keyId), [attraction.keyId])
    const mapFocusPath = useMemo(() => toMapFocusPath(attraction.keyId), [attraction.keyId])
    // 백엔드 상대경로(예: /uploads/...) → 절대 URL로 변환. null이면 null 그대로 반환
    const imageUrl = useMemo(() => resolveBackendAssetUrl(attraction.imageUrl), [attraction.imageUrl])

    // storySummary가 null/공백이면 "준비 중" 대체 문구를 사용해 빈 카드 노출 방지
    const summary = (attraction.storySummary ?? '').trim().length > 0
        ? String(attraction.storySummary)
        : '소개 정보가 준비 중입니다.'

    return (
        <article className='group relative cursor-pointer overflow-hidden rounded-3xl border border-white/15 bg-white/10 backdrop-blur transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'>
            {/* 카드 전체를 상세 페이지 링크로 덮되 z-10으로 내부 링크(지도 보기) 아래에 위치 */}
            <Link
                to={detailPath}
                aria-label={`${attraction.placeName} 상세 보기`}
                className='absolute inset-0 z-10 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'
            />

            <div className='relative h-40 w-full overflow-hidden bg-white/5'>
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt=''
                        className='h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]'
                        loading='lazy'
                    />
                ) : (
                    <div className='h-full w-full' />
                )}
            </div>

            <div className='space-y-3 p-5'>
                {attraction.categoryName ? (
                    <div className='inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white/80'>
                        {attraction.categoryName}
                    </div>
                ) : null}

                <h3 className='line-clamp-1 text-lg font-semibold text-white'>{attraction.placeName}</h3>

                {attraction.storyTitle ? (
                    <p className='line-clamp-1 text-xs text-white/70'>{attraction.storyTitle}</p>
                ) : null}

                <div className='space-y-1'>
                    <div className='text-xs font-semibold text-white/60'>요약 보기</div>
                    <p className='line-clamp-2 text-sm text-white/80'>{summary}</p>
                </div>

                <p className='line-clamp-1 text-xs text-white/60'>
                    {(attraction.address ?? '').trim() || '주소 정보 없음'}
                </p>

                <div className='flex items-center justify-end pt-2'>
                    {/* z-20으로 카드 전체 링크(z-10) 위에 위치시켜 독립적인 클릭 이벤트를 허용 */}
                    <Link
                        to={mapFocusPath}
                        className='relative z-20 text-xs font-semibold text-white/70 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'
                    >
                        지도에서 보기
                    </Link>
                </div>
            </div>
        </article>
    )
}