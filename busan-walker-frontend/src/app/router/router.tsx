// src/app/router/router.tsx

import { Suspense, lazy, type ReactElement } from "react";
import { createBrowserRouter } from "react-router-dom";

import App from "@/App"
import { model as authModel, ui as authUi } from "@/domains/auth";

import RouteErrorPage from "@/pages/RouteErrorPage";
import NotFoundPage from "@/pages/NotFoundPage";
import { LoadingState } from "@/shared/ui/LoadingState";
import { LOADING_MESSAGES } from "@/app/constants/loadingMessages";

import { ROUTES, ROUTE_SEGMENTS } from "@/app/navigation/navigation";

/**
 * 라우트 레벨 코드 분할(Page Chunking)
 *
 * 목적:
 * - 각 페이지 컴포넌트를 dynamic import로 분리해 초기 번들 크기를 줄임
 *
 * 동작:
 * - 라우트에 처음 진입하는 순간 해당 페이지의 청크가 로드
 * - 로드 중 UI는 Suspense fallback으로 표시
 */
const HomePage = lazy(() => import("@/pages/HomePage"))
const AttractionsIntroPage = lazy(() => import("@/pages/AttractionsIntroPage"))
const MapPage = lazy(() => import("@/pages/MapPage"))
const AttractionDetailPage = lazy(() => import("@/pages/AttractionDetailPage"))
const FavoritesPage = lazy(() => import("@/pages/FavoritesPage"))

const AdminAttractionImagePage = lazy(() => import("@/pages/AdminAttractionImagePage"))

const LoginPage = lazy(() => import("@/pages/LoginPage"))
const RegisterPage = lazy(() => import("@/pages/RegisterPage"))
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"))
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"))
const MyAccountPage = lazy(() => import("@/pages/MyAccountPage"))
const EmailVerifyPage = lazy(() => import("@/pages/EmailVerifyPage"))
const AccessDeniedPage = lazy(() => import("@/pages/AccessDeniedPage"))

/**
 * 라우트 로딩 중 표시할 공통 fallback UI
 *
 * 정책:
 * - 페이지 청크가 로드되는 동안 사용자에게 "페이지 로딩 중" 상태를 명확히 알림
 * - 전체 레이아웃 그리드(헤더 등)는 유지된 채로 표시되는 것이 이상적
 */
const routeLoadingFallback: ReactElement = (
    <LoadingState message={LOADING_MESSAGES.page} />
)

/**
 * 라우트 element를 Suspense로 함께 감싸는 유틸
 *
 * 목적:
 * - 라우트 정의에서 "페이지 로딩 정책"을 일관되게 적용
 * - 각 라우트마다 개별적으로 Suspense를 작성하지 않아도 되게 해 중복을 줄임
 */
function withRouteSuspense(element: ReactElement): ReactElement {
    return <Suspense fallback={routeLoadingFallback}>{element}</Suspense>
}

/**
 * router (애플리케이션 전체 라우터 / Data Router)
 *
 * 역할/목적:
 * - 앱의 모든 URL 경로와 대응하는 페이지·레이아웃·가드를 단일 트리로 선언
 *
 * 공개 정책 / 설계 원칙:
 * - 루트 라우트에 전체 레이아웃(App)과 인증 컨텍스트(AuthProvider)를 배치해
 *   모든 하위 라우트가 동일한 레이아웃과 인증 상태를 공유
 * - 경로 문자열은 navigation.ts의 ROUTES/ROUTE_SEGMENTS를 SSOT로 사용
 * - 인증이 필요한 라우트는 RequireAuth로 보호하며, 접근 거부 정책은 RequireAuth에서 결정
 *
 * 동작 방식:
 * - children의 각 라우트는 ROUTE_SEGMENTS(상대 경로) 기준으로 중첩 구조를 구성
 * - "*" 와일드카드로 매칭되지 않는 모든 경로를 NotFoundPage로 처리
 *
 * 운영 포인트:
 * - query string에 토큰·코드가 포함되는 플로우(이메일 인증, 비밀번호 재설정)는
 *   서버·클라이언트 로그에 민감 정보가 남지 않도록 로그 정책을 확인
 * - 라우트 추가 시 navigation.ts의 ROUTE_SEGMENTS와 ROUTES도 함께 업데이트
 */
export const router = createBrowserRouter([
    {
        path: ROUTES.home,

        /**
         * 루트 element
         * - AuthProvider: 로그인 상태를 초기화·동기화 및 인증 컨텍스트 공급
         * - App: 공통 레이아웃(헤더/푸터/Outlet 등)을 렌더링하는 최상위 UI 쉘
         */
        element: (
            <authModel.AuthProvider>
                <App />
            </authModel.AuthProvider>
        ),

        /**
         * 라우트 레벨 에러 UI
         * - loader/action/렌더링 중 발생한 예외를 라우트 트리에서 격리해 처리
         * - 예기치 않은 전체 화면 에러가 "빈 화면"으로 남는 상황을 방지하는 안전장치
         */
        errorElement: <RouteErrorPage />,

        /**
         * 중첩 라우트
         * - path는 상대 경로를 사용(leading slash 없음)
         * - "*" 와일드카드로 라우터에서 매칭되지 않는 모든 경로를 처리
         */
        children: [
            { index: true, element: withRouteSuspense(<HomePage />) },

            { path: ROUTE_SEGMENTS.attractions, element: withRouteSuspense(<AttractionsIntroPage />) },
            { path: ROUTE_SEGMENTS.map, element: withRouteSuspense(<MapPage />) },

            /**
             * 동적 파라미터 라우트
             * - :keyId가 관광지의 고유 식별자
             * - 이 경로로 진입할 때는 navigation.ts의 toAttractionDetailPath를 사용해
             *   encodeURIComponent가 자동 적용
             */
            { path: `${ROUTE_SEGMENTS.attractions}/:keyId`, element: withRouteSuspense(<AttractionDetailPage />) },

            /**
             * 보호 라우트: 즐겨찾기
             * - 로그인 + 활성 계정이 필요한 라우트는 RequireAuth로 접근 통제 정책을 위임
             */
            {
                path: ROUTE_SEGMENTS.favorites,
                element: (
                    <authUi.RequireAuth requireActive>
                        {withRouteSuspense(<FavoritesPage />)}
                    </authUi.RequireAuth>
                ),
            },

            { path: ROUTE_SEGMENTS.login, element: withRouteSuspense(<LoginPage />) },
            { path: ROUTE_SEGMENTS.register, element: withRouteSuspense(<RegisterPage />) },
            { path: ROUTE_SEGMENTS.passwordForgot, element: withRouteSuspense(<ForgotPasswordPage />) },
            { path: ROUTE_SEGMENTS.authEmailVerify, element: withRouteSuspense(<EmailVerifyPage />) },

            /**
             * 공개 라우트: 접근 거부 안내 UX 전담
             * - 비로그인/비활성/이메일 미인증 등 "정책 조건 미충족" 시 안내 화면을 표시
             * - RequireAuth 외부에 배치해 redirect 루프가 발생하지 않도록 함
             */
            { path: ROUTE_SEGMENTS.accessDenied, element: withRouteSuspense(<AccessDeniedPage />) },

            { path: ROUTE_SEGMENTS.authPasswordReset, element: withRouteSuspense(<ResetPasswordPage />) },

            /**
             * 보호 라우트: 내 계정
             * - 로그인 + 활성 계정 필요, 프로필 수정·비밀번호 변경 화면을 포함
             */
            {
                path: ROUTE_SEGMENTS.myAccount,
                element: (
                    <authUi.RequireAuth requireActive>
                        {withRouteSuspense(<MyAccountPage />)}
                    </authUi.RequireAuth>
                ),
            },

            {
                path: ROUTE_SEGMENTS.adminAttractionImage,
                element: (
                    <authUi.RequireAuth allowedRoles={["ADMIN"]} requireActive>
                        {withRouteSuspense(<AdminAttractionImagePage />)}
                    </authUi.RequireAuth>
                ),
            },

            { path: "*", element: <NotFoundPage /> },
        ],
    },
])