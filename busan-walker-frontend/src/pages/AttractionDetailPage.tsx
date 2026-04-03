// src/pages/AttractionDetailPage.tsx

import { useMemo } from "react"
import { Link, useLocation, useParams } from "react-router-dom"

import { toMapFocusPath, ROUTES } from "@/app/navigation/navigation"
import { toAuthRedirectFrom } from "@/app/navigation/authRedirect"
import { getErrorMessage } from "@/shared/lib/apiError"
import { resolveBackendAssetUrl } from "@/shared/api/core/baseURL"

import { api as attractionApi } from "@/domains/attraction"
import { api as favoriteApi, ui as favoriteUi } from "@/domains/favorite"
import { model as authModel } from "@/domains/auth"
import { ui as reviewUi } from "@/domains/review"

/**
 * AttractionDetailPage.tsx (Page - 관광지 상세 페이지)
 *
 * 역할/목적:
 * - 관광지 1건의 상세 정보(소개/스토리/이미지)와 리뷰 섹션을 제공하는 페이지
 * - 거리/시간/대중교통 안내는 지도 페이지에서 담당하며, 이 페이지는 관광지 소개/스토리 중심
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · AttractionDetailPage  - 관광지 상세 페이지 컴포넌트
 *
 * 동작 방식:
 * - useParams로 keyId를 추출, useAttractionDetail로 상세 데이터를 조회
 * - 인증 상태(useAuth)에 따라 즐겨찾기 버튼/로그인 유도 링크를 조건부 렌더링
 * - 즐겨찾기 exists 조회는 isAuthLoading이 완료되고 로그인된 경우에만 활성화
 * - 로딩/에러/데이터 없음/정상 각 상태를 명확히 분기하여 사용자에게 항상 유의미한 UI 제공
 *
 * 운영 포인트:
 * - 대중교통 접근 정보(거리/시간)는 지도 페이지에 위임하므로, 이 페이지에서는 "지도에서 보기" 링크만 제공
 * - 리뷰 섹션은 reviewUi.ReviewSection에 keyId를 전달하여 독립적으로 조회/표시
 */

/**
 * AttractionDetailPage
 *
 * 역할/목적:
 * - 관광지 상세 페이지의 최상위 컴포넌트
 *
 * 상태 설계:
 * - attractionId: URL 파라미터에서 추출(keyId), falsy면 유효하지 않은 경로로 처리
 * - favoritesEnabled: 인증 로딩 완료 + 로그인 + attractionId 유효 여부를 조합한 즐겨찾기 조회 활성화 조건
 */
export default function AttractionDetailPage() {
    const { keyId } = useParams<{ keyId: string }>()
    // keyId가 undefined인 경우(경로 파라미터 누락) 빈 문자열로 처리하여 이후 분기에서 안전하게 처리
    const attractionId: string = keyId ?? ""

    const location = useLocation()
    const { user, isLoading: isAuthLoading } = authModel.useAuth()

    const detailQuery = attractionApi.useAttractionDetail(attractionId)

    // 즐겨찾기 조회 활성화 조건:
    // - 인증 로딩 중에는 exists API를 호출하지 않음(불필요한 401 방지)
    // - 로그인된 사용자이고 attractionId가 유효할 때만 조회
    const favoritesEnabled: boolean = !isAuthLoading && Boolean(user) && Boolean(attractionId)
    const favoriteStatusQuery = favoriteApi.useFavoriteExists(attractionId, favoritesEnabled)
    // useFavoriteExists가 undefined를 반환할 수 있으므로 false로 초기화
    const isFavorite: boolean = favoriteStatusQuery.data ?? false

    // attractionId가 바뀔 때만 지도 포커스 경로를 재계산
    const mapFocusPath: string = useMemo(() => toMapFocusPath(attractionId), [attractionId])

    if (!attractionId) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-10 text-white">
                <h1 className="text-xl font-black">잘못된 요청입니다.</h1>
                <p className="mt-2 text-sm text-white/75">페이지를 다시 로드하여 시도해 주세요.</p>
            </div>
        )
    }

    if (detailQuery.isLoading) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-10 text-white">
                <div className="h-8 w-2/3 animate-pulse rounded-xl bg-white/10" />
                <div className="mt-4 h-40 animate-pulse rounded-3xl bg-white/5" />
            </div>
        )
    }

    if (detailQuery.isError) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-10 text-white">
                <h1 className="text-xl font-black">관광지 정보를 불러올 수 없습니다.</h1>
                <p className="mt-2 text-sm text-white/80">
                    {getErrorMessage(detailQuery.error, "알 수 없는 오류가 발생했습니다.")}
                </p>
            </div>
        )
    }

    if (!detailQuery.data) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-10 text-white">
                <h1 className="text-xl font-black">관광지 정보를 찾을 수 없습니다.</h1>
                <p className="mt-2 text-sm text-white/80">
                    목록 화면에서 다시 선택해 주세요.
                </p>
            </div>
        )
    }

    const a = detailQuery.data
    const imageUrl: string | null = resolveBackendAssetUrl(a.imageUrl)

    return (
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 text-white">

            {/* 섹션: 타이틀 + 액션 */}
            <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                    <h1 className="text-2xl font-black tracking-tight">{a.placeName}</h1>
                    <div className="flex flex-wrap gap-2 text-xs text-white/70">
                        {a.categoryName ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                {a.categoryName}
                            </span>
                        ) : null}
                        {a.address ? (
                            <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1">
                                {a.address}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link to={mapFocusPath}
                          className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                          aria-label="지도에서 관광지의 위치를 확인합니다.">
                        지도에서 보기
                    </Link>

                    {/* 즐겨찾기: 로그인 여부와는 exists/캐시 상태에 isFavorite로 반영 */}
                    {isAuthLoading ? (
                        <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/70">
                            인증 확인 중...
                        </div>
                    ) : favoritesEnabled ? (
                        favoriteStatusQuery.isLoading ? (
                            <div className=" rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/70">
                                즐겨찾기 확인 중...
                            </div>
                        ) : favoriteStatusQuery.isError ? (
                            <button
                                type="button"
                                onClick={() => void favoriteStatusQuery.refetch()}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/15"
                            >
                                즐겨찾기 상태 다시 확인
                            </button>
                        ) : (
                            <favoriteUi.FavoriteButton attractionId={a.keyId} isFavorite={isFavorite} />
                        )
                    ) : (
                        <Link to={ROUTES.login}
                              state={{ from: toAuthRedirectFrom(location) }}
                              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/15">
                            로그인하고 즐겨찾기
                        </Link>
                    )}
                </div>
            </section>

            {/* 이미지 섹션 */}
            <section className="grid gap-6 md:grid-cols-5">
                <div className="md:col-span-2">
                    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt=""
                                className="block h-auto w-full"
                                loading="lazy"
                            />
                        ) : (
                            <div className="aspect-16/12 w-full bg-linear-to-br from-white/10 to-white/0">
                                <div className="flex h-full items-center justify-center text-sm text-white/60">
                                    대표 이미지를 불러올 수 없습니다.
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-3 md:col-span-3">
                    <h2 className="text-lg font-black">{a.storyTitle?.trim() || "스토리"}</h2>
                    <p className="text-sm leading-relaxed text-white/80">
                        {a.storySummary?.trim() ||
                            "이 관광지의 스토리와 특징에 대해 알려주는 스토리입니다. 자세한 정보는 아래의 스토리 버튼을 이용해 확인할 수 있습니다."}
                    </p>

                    {a.storyUrl ? (
                        <a
                            href={a.storyUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/15"
                        >
                            스토리 더 읽기
                        </a>
                    ) : null}

                    {/* 거리/시간 정보는 지도에서만 제공한다는 안내 */}
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-white/75">
                        거리/시간/대중교통 정보는 별도의 <span className="font-bold">지도 화면</span>에서 제공됩니다.
                        위에서 "지도에서 보기" 버튼을 이용해 확인할 수 있습니다.
                    </div>
                </div>
            </section>

            {/* 리뷰 섹션 */}
            <section>
                <reviewUi.ReviewSection keyId={a.keyId} />
            </section>

        </div>
    )

}
