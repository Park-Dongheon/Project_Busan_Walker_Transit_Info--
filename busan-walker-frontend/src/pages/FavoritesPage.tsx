// src/pages/FavoritesPage.tsx

import { Link } from "react-router-dom"
import { toAttractionDetailPath } from "@/app/navigation/navigation"
import { api as favoriteApi } from "@/domains/favorite"
import { ui as attractionUi } from "@/domains/attraction"
import { getErrorMessage } from "@/shared/lib/apiError"

/**
 * FavoritesPage.tsx (Page - 즐겨찾기 목록 페이지)
 *
 * 역할/목적:
 * - 로그인한 사용자의 즐겨찾기 관광지 목록을 조회하고 카드 그리드로 표시하는 페이지
 * - 라우터 레벨의 RequireAuth에 의해 보호되므로, 이 컴포넌트는 "인증 완료 상태"를 전제로 동작
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · FavoritesPage  - 즐겨찾기 목록 페이지 컴포넌트
 *
 * 동작 방식:
 * - useFavorites({ page: 0, size: 50 })로 즐겨찾기 목록을 조회
 * - 로딩/에러/빈 목록/정상 각 상태를 명확히 분기 렌더링
 * - 각 카드는 Link로 감싸 관광지 상세 페이지로 이동
 *
 * 운영 포인트:
 * - 현재 size=50으로 고정하여 단순 구조를 유지. 즐겨찾기 수가 많아질 경우 페이지네이션 도입 필요
 * - 빈 목록 상태에서 홈으로 유도하는 링크를 제공하여 사용자 이탈을 최소화
 */

/**
 * FavoritesPage
 *
 * 역할/목적:
 * - 즐겨찾기 목록 페이지의 최상위 컴포넌트
 *
 * 데이터 흐름:
 * - useFavorites → content 배열을 AttractionCard로 렌더링
 * - 에러 시 getErrorMessage로 사용자 친화적 메시지 표시
 */
export default function FavoritesPage() {
    const { data, isLoading, isError, error } = favoriteApi.useFavorites({ page: 0, size: 50 })

    if (isLoading) {
        return (
            <div className="py-8 text-center text-sm text-gray-600">
                즐겨찾기 목록을 불러오는 중입니다...
            </div>
        )
    }

    if (isError || !data) {
        const msg = getErrorMessage(error, "즐겨찾기 목록을 불러오지 못했습니다")
        return (
            <div className="py-8 text-center text-sm text-red-600">
                {msg}
            </div>
        )
    }

    const items = data.content

    return (
        <div className="mx-auto max-w-5xl py-6 space-y-4">
            <header className="flex justify-between items-center">
                <h1 className="text-xl font-semibold">⭐ 즐겨찾기</h1>
                <p className="text-xs text-gray-500">자주 찾는 부산 관광지를 한 곳에서 관리하세요.</p>
            </header>

            {items.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-600">
                    아직 즐겨찾기에 등록된 관광지가 없습니다.{" "}
                    <Link to="/"
                          className="text-blue-600 hover:underline"
                    >
                        홈으로 돌아가 관광지를 둘러보세요
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((a) => (
                        <Link key={a.keyId}
                              to={toAttractionDetailPath(a.keyId)}
                              className="block"
                        >
                            <attractionUi.AttractionCard a={a} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
