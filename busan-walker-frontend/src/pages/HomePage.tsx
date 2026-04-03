// src/pages/HomePage.tsx

import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";

import { ATTRACTIONS_PAGE_SIZE, ROUTES } from "@/app/navigation/navigation";
import { api as attractionApi, ui as attractionUi } from "@/domains/attraction";

/**
 * HomePage.tsx (Page - 서비스 메인 진입 페이지)
 *
 * 역할/목적:
 * - 사용자가 처음 접하는 랜딩 페이지로, 서비스 소개 + 추천 관광지 캐러셀 + 핵심 기능 카드 3개를 포함
 * - 부산 도보 여행의 주요 기능(관광지 소개/지도/즐겨찾기)으로 빠르게 진입할 수 있는 허브 역할
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · HomePage         - 서비스 메인 페이지 컴포넌트
 * - 내부 전용 컴포넌트:
 *      · FeatureCard      - 기능 소개 카드(Link 기반)
 *      · IconCards/IconMapPin/IconHeart/IconArrowRight - 아이콘 SVG
 *
 * 동작 방식:
 * - 마운트 시 추천 관광지 목록(page=0, size=ATTRACTIONS_PAGE_SIZE*3)을 비동기 조회
 * - 로딩/에러/결과 없음 상태를 각각 분기 렌더링하여 사용자에게 항상 유의미한 UI를 제공
 * - 추천 데이터는 AttractionCarousel에 전달하여 슬라이드 형태로 표시
 *
 * 운영 포인트:
 * - 추천 관광지 조회 size는 ATTRACTIONS_PAGE_SIZE * 3으로 고정하여 캐러셀이 충분한 페이지를 갖도록 설계
 * - FeatureCard의 icon/title/description/to는 서비스 기능 변경 시 이 파일에서 직접 수정
 */

type FeatureCardProps = {
    title: string;
    description: string;
    to: string;
    cta: string;
    icon: ReactNode;
};

/**
 * HomePage
 *
 * 역할/목적:
 * - 서비스 메인 페이지: 히어로 섹션 + 추천 캐러셀 + 핵심 기능 카드
 *
 * 데이터 흐름:
 * - useAttractionsPage로 추천 관광지 목록을 조회하고 AttractionCarousel에 전달
 * - 로딩/에러/빈 결과 각 상태를 명확히 분기하여 항상 유의미한 UI 제공
 */
export default function HomePage(): ReactElement {
    const recommendedQuery = attractionApi.useAttractionsPage({
        page: 0,
        // 캐러셀이 여러 페이지를 가질 수 있도록 기본 페이지 크기의 3배를 요청
        size: ATTRACTIONS_PAGE_SIZE * 3,
    });

    // content가 없으면 빈 배열로 초기화하여 캐러셀이 undefined를 받지 않게 처리
    const recommendedItems = recommendedQuery.data?.content ?? [];

    return (
        <div className="mx-auto w-full max-w-7xl space-y-8">
            <section className="rounded-3xl border border-white/15 bg-white/10 p-7 backdrop-blur md:p-10">
                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-3">
                        <h1 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                            부산 도보 여행을 위한 대중교통 접근 안내
                        </h1>
                        <p className="max-w-2xl text-sm leading-relaxed text-white/80 md:text-base">
                            관광지 소개를 빠르게 확인하고, 지도에서 대중교통 접근 정보를 한 번에 살펴보세요.
                        </p>
                    </div>
                </div>
            </section>

            {recommendedQuery.isLoading ? (
                <section className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur">
                    <div className="h-6 w-40 animate-pulse rounded-xl bg-white/15" />
                    <div className="mt-4 h-56 animate-pulse rounded-2xl bg-white/10" />
                </section>
            ) : null}

            {recommendedQuery.isError ? (
                <section className="rounded-3xl border border-white/15 bg-white/10 p-6 text-white backdrop-blur">
                    <div className="text-sm font-semibold">추천 관광지를 불러오지 못했습니다.</div>
                    <Link
                        to={ROUTES.attractions}
                        className="mt-3 inline-block text-sm font-semibold text-white/85 hover:text-white hover:underline"
                    >
                        관광지 소개 페이지로 이동
                    </Link>
                </section>
            ) : null}

            {!recommendedQuery.isLoading && !recommendedQuery.isError && recommendedItems.length > 0 ? (
                <attractionUi.AttractionCarousel
                    items={recommendedItems}
                    itemsPerPage={ATTRACTIONS_PAGE_SIZE}
                    title="추천 관광지"
                />
            ) : null}

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6" aria-label="핵심 기능">
                <FeatureCard
                    title="관광지 소개 카드"
                    description="스토리 중심으로 관광지를 빠르게 탐색할 수 있습니다."
                    to={ROUTES.attractions}
                    cta="소개 보기"
                    icon={<IconCards />}
                />
                <FeatureCard
                    title="지도 기반 대중교통 안내"
                    description="선택한 관광지 주변의 대중교통 접근 정보를 지도에서 바로 확인합니다."
                    to={ROUTES.map}
                    cta="지도 열기"
                    icon={<IconMapPin />}
                />
                <FeatureCard
                    title="즐겨찾기와 리뷰"
                    description="관심 관광지를 저장하고 리뷰를 기반으로 나만의 동선을 구성합니다."
                    to={ROUTES.favorites}
                    cta="기록 관리"
                    icon={<IconHeart />}
                />
            </section>
        </div>
    );
}

/**
 * FeatureCard
 *
 * 역할/목적:
 * - 홈 화면 하단에 표시되는 "핵심 기능 소개 카드" 컴포넌트
 * - Link 컴포넌트로 감싸 전체 카드가 클릭 가능한 내비게이션 영역이 됨
 *
 * 렌더링 정책:
 * - cta가 빈 문자열이면 "바로가기" 대체 문구를 사용하여 빈 버튼 노출을 방지
 * - hover 시 서브틀한 radial gradient 오버레이로 인터랙션 힌트를 제공
 */
function FeatureCard(props: FeatureCardProps): ReactElement {
    const { title, description, to, cta, icon } = props;
    // cta가 공백/빈 문자열인 경우 대체 문구 사용
    const ctaLabel = cta.trim().length > 0 ? cta : "바로가기";

    return (
        <Link
            to={to}
            aria-label={`${title} 이동`}
            className={[
                "group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur",
                "transition will-change-transform hover:-translate-y-0.5 hover:bg-white/10",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
            ].join(" ")}
        >
            <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10">
                    {icon}
                </div>

                <div className="min-w-0 space-y-1">
                    <h3 className="line-clamp-1 text-base font-black tracking-tight text-white">{title}</h3>
                    <p className="line-clamp-3 text-sm leading-relaxed text-white/75">{description}</p>
                </div>
            </div>

            <div className="mt-6 flex items-end justify-between">
                <span className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 transition group-hover:bg-white/15">
                    {ctaLabel}
                    <IconArrowRight />
                </span>
            </div>

            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                    background: "radial-gradient(600px circle at 20% 0%, rgba(255,255,255,0.10), transparent 40%)",
                }}
            />
        </Link>
    );
}

function IconCards(): ReactElement {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 7h10M7 11h10M7 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path
                d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="2"
            />
        </svg>
    );
}

function IconMapPin(): ReactElement {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 22s7-4.5 7-12a7 7 0 1 0-14 0c0 7.5 7 12 7 12Z" stroke="currentColor" strokeWidth="2" />
            <path d="M12 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function IconHeart(): ReactElement {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M12 21s-7-4.6-9.3-9A5.7 5.7 0 0 1 12 6.7 5.7 5.7 0 0 1 21.3 12c-2.3 4.4-9.3 9-9.3 9Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconArrowRight(): ReactElement {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path
                d="M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
