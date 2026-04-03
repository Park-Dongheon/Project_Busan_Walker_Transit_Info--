// src/domains/attraction/ui/intro/AttractionsIntroGrid.tsx

import { AttractionCardSkeleton } from './AttractionCardSkeleton';
import { AttractionIntroCard } from './AttractionIntroCard';
import type { AttractionIntroCardModel } from '../../types';

/**
 * AttractionsIntroGrid.tsx (UI Layer - 소개 페이지 관광지 카드 그리드)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지에서 관광지 카드 목록을 2열 그리드로 표시하는 컨테이너 컴포넌트
 * - 로딩 상태에서는 AttractionCardSkeleton, 완료 후에는 AttractionIntroCard로 교체 렌더링
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionsIntroGridProps  - 그리드 컴포넌트 props 타입
 *      · AttractionsIntroGrid       - 소개 카드 그리드 컴포넌트
 *
 * 동작 방식:
 * - isLoading=true: skeletonCount(정규화)만큼 AttractionCardSkeleton을 렌더링
 * - isLoading=false: items 배열을 AttractionIntroCard로 매핑하여 렌더링
 * - 로딩 중에는 role="status" + aria-live="polite"를 통해 스크린리더에 상태를 알림
 * - skeletonCount는 [1, MAX_SKELETON_COUNT] 범위로 정규화하여 비정상 값 방어
 *
 * 운영 포인트:
 * - MAX_SKELETON_COUNT: 과도한 DOM 생성 방지를 위한 스켈레톤 상한 정책값
 * - 그리드 컬럼(sm:grid-cols-2)은 반응형 정책 변경 시 이 파일에서 수정
 */

/**
 * AttractionsIntroGridProps
 *
 * 역할/목적:
 * - AttractionsIntroGrid 컴포넌트가 받는 props 계약
 *
 * 정책:
 * - items: 렌더링할 소개 카드 모델 배열 (로딩 완료 후 사용)
 * - isLoading: 로딩 상태 플래그 (true면 스켈레톤 표시)
 * - skeletonCount: 로딩 중 표시할 스켈레톤 개수 (정규화 적용됨)
 */
export type AttractionsIntroGridProps = {
    items: AttractionIntroCardModel[]
    isLoading: boolean
    skeletonCount: number
}

// 과도한 DOM 요소 생성을 막기 위한 스켈레톤 카드 최대 개수
const MAX_SKELETON_COUNT = 24

/**
 * AttractionsIntroGrid
 *
 * 역할/목적:
 * - 소개 페이지에서 관광지 카드 목록을 그리드로 렌더링
 * - isLoading 여부에 따라 스켈레톤 또는 실제 카드를 표시하여 로딩 UX를 제어
 */
export function AttractionsIntroGrid({ items, isLoading, skeletonCount }: AttractionsIntroGridProps) {
    // 비정상 입력(NaN/음수/과도한 값)이 들어와도 안전한 범위로 보정
    const rawSkeletonCount = Number(skeletonCount)
    const normalizedSkeletonCount = Number.isFinite(rawSkeletonCount)
        ? Math.min(MAX_SKELETON_COUNT, Math.max(1, Math.floor(rawSkeletonCount)))
        : 1

    return (
        <section className='rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur'>
            {/* 스크린리더에게 로딩 상태를 1회 알리는 sr-only 영역. 개별 스켈레톤이 읽히지 않도록 aria-hidden 처리는 AttractionCardSkeleton에서 담당 */}
            {isLoading ? (
                <p role='status' aria-live='polite' className='sr-only'>
                    관광지 카드 목록을 불러오는 중입니다.
                </p>
            ) : null}

            <div className='grid gap-4 sm:grid-cols-2'>
                {isLoading
                    ? Array.from({ length: normalizedSkeletonCount }, (_, index) => <AttractionCardSkeleton key={index} />)
                    : items.map((item) => <AttractionIntroCard key={item.keyId} attraction={item} />)}
            </div>
        </section>
    )
}