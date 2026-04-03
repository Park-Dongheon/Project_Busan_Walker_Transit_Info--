// src/pages/RouteErrorPage.tsx

import { isRouteErrorResponse, useRouteError, Link } from "react-router-dom";
import { ROUTES } from "@/app/navigation/navigation";

/**
 * RouteErrorPage.tsx (Page - 라우터 레벨 오류 페이지)
 *
 * 역할/목적:
 * - createBrowserRouter의 errorElement로 등록되어, 라우팅/데이터 로딩/예외 발생 시
 *   사용자에게 오류를 알리고 복구 가능한 UI를 제공하는 최후방 안전장치
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상: (default export만)
 *      · RouteErrorPage  - 라우터 레벨 오류 페이지 컴포넌트
 *
 * 동작 방식:
 * - useRouteError()로 라우터가 던진 에러를 읽음
 * - isRouteErrorResponse(err): 표준 라우터 에러 응답(상태코드/상태텍스트 포함) → 코드/텍스트 표시
 * - Error 객체: err.message를 표시
 * - 그 외 알 수 없는 오류: 기본 안내 문구 표시
 * - 홈/관광지/지도로 이동하는 복구 링크를 제공하여 사용자가 막힌 상황을 빠져나갈 수 있도록 함
 *
 * 운영 포인트:
 * - NotFoundPage(경로 없음)와 구분: 이 페이지는 "라우팅/렌더링 중 예외 발생" 상황에서 표시됨
 * - 에러 메시지는 err.message를 그대로 표시하므로, 민감한 정보가 포함되지 않도록 백엔드 응답 정책을 확인
 */

/**
 * RouteErrorPage
 *
 * - createBrowserRouter의 errorElement로 사용되는 라우터 레벨 오류 페이지
 * - 라우팅/데이터 로딩/예외 상황에서도 "사용자가 복구할 수 있는 UI"를 제공하기 위한 안전장치
 */
export default function RouteErrorPage() {
    const err: unknown = useRouteError()

    /* 라우터가 제공하는 표준 에러 응답(상태코드 포함) */
    if (isRouteErrorResponse(err)) {
        const status: number = err.status
        const statusText: string = err.statusText

        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-white">
                <h1 className="text-2xl font-black tracking-tight">
                    요청을 처리할 수 없습니다.
                </h1>
                <p className="text-sm text-white/80">
                    상태 코드: <span className="font-bold">{status}</span> ({statusText})
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
                </div>
            </div>
        )
    }

    /* 그 외 일반 예외(Error 객체 등) */
    const message: string =
        err instanceof Error && typeof err.message === "string" && err.message.length > 0
            ? err.message
            : "알 수 없는 오류가 발생했습니다."

    return (
        <div className="mx-auto max-w-2xl space-y-4 py-12 text-white">
            <h1 className="text-2xl font-black tracking-tight">
                문제가 발생했습니다.
            </h1>
            <p className="text-sm text-white/80">
                {message}
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
                <Link to={ROUTES.home}
                      className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
                    홈으로
                </Link>
                <Link to={ROUTES.map}
                      className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/15">
                    대중교통 지도
                </Link>
            </div>
        </div>
    )

}