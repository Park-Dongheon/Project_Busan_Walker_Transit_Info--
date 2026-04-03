// src/pages/NotFoundPage.tsx

import { Link } from "react-router-dom";
import { ROUTES } from "@/app/navigation/navigation";

/**
 * NotFoundPage.tsx (Page - 404 페이지를 찾을 수 없음 페이지)
 *
 * 역할/목적:
 * - 라우터에서 정의되지 않은 경로에 접근했을 때 표시되는 명시적 404 페이지
 * - 사용자에게 "현재 경로가 없음"을 명확히 알리고 복구 가능한 동선을 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · NotFoundPage  - 404 페이지 컴포넌트
 *
 * 동작 방식:
 * - 정적 UI: 로딩/데이터 요청 없음
 * - 홈/관광지 소개/대중교통 지도로 이동하는 복구 링크를 제공하여 사용자 이탈을 최소화
 *
 * 운영 포인트:
 * - 라우터의 catch-all 라우트(path="*")에 배치하여 모든 미정의 경로에서 표시
 * - RouteErrorPage(라우터 레벨 오류)와 구분됨:
 *   NotFoundPage는 "경로가 없음", RouteErrorPage는 "라우팅 중 예외 발생"
 */

/**
 * NotFoundPage
 *
 * - children 라우트에서 정의되지 않은 경로 접근 시 표시되는 명시적 404 페이지
 * - 사용자가 복구 가능한 동선을 제공(홈/관광지/지도 등)
 */
export default function NotFoundPage() {
    return (
        <div className="mx-auto max-w-2xl space-y-4 py-12 text-white">
            <h1 className="text-2xl font-black tracking-tight">
                페이지를 찾을 수 없습니다.
            </h1>
            <p className="text-sm text-white/80">
                입력하신 주소가 올바르지 않거나, 페이지가 이동되었을 수 있습니다.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
                <Link to={ROUTES.home}
                      className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
                    홈으로
                </Link>
                <Link to={ROUTES.attractions}
                      className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15">
                    관광지 소개
                </Link>
                <Link to={ROUTES.map}
                      className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15">
                    대중교통 지도
                </Link>
            </div>
        </div>
    )
}