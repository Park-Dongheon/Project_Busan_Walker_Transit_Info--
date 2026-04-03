// src/app/navigation/navigation.ts

/**
 * ROUTE_SEGMENTS (라우터 구성용 상대 경로 SSOT)
 * 
 * 역할:
 * - React Router의 children(중첩 라우트)에서 사용하는 "상대 경로"를 표준화
 * 
 * 동작/정책:
 * - leading slash("/") 없이 정의
 * - 값은 단일 세그먼트뿐 아니라 "a/b" 형태의 상대 path pattern을 포함 가능
 * 
 * 주의:
 * - UI에서 직접 이동(Link/navigate)할 때는 ROUTES(절대 경로)를 사용
 */
export const ROUTE_SEGMENTS = {
    attractions: "attractions",
    map: "map",

    favorites: "favorites",
    myAccount: "me",

    login: "login",
    register: "register",

    passwordForgot: "password/forgot",
    authEmailVerify: "auth/email/verify",
    authPasswordReset: "auth/password/reset",
    accessDenied: "access-denied",

    adminAttractionImage: "admin/attractions/image",
} as const

/**
 * ROUTES (UI 이동용 절대 경로 SSOT)
 * 
 * 역할:
 * - Link / navigate 등 "사용자 이동"이 발생하는 UI 계층에서 사용할 절대 경로를 제공
 * 
 * 정책:
 * - 모든 값은 leading slash("/")를 포함
 * - ROUTE_SEGMENTS를 조합해 경로 문자열이 한 곳에서만 결정
 */
export const ROUTES = {
    home: "/",

    attractions: `/${ROUTE_SEGMENTS.attractions}`,
    map: `/${ROUTE_SEGMENTS.map}`,

    favorites: `/${ROUTE_SEGMENTS.favorites}`,
    myAccount: `/${ROUTE_SEGMENTS.myAccount}`,

    login: `/${ROUTE_SEGMENTS.login}`,
    register: `/${ROUTE_SEGMENTS.register}`,

    passwordForgot: `/${ROUTE_SEGMENTS.passwordForgot}`,
    authEmailVerify: `/${ROUTE_SEGMENTS.authEmailVerify}`,
    authPasswordReset: `/${ROUTE_SEGMENTS.authPasswordReset}`,
    accessDenied: `/${ROUTE_SEGMENTS.accessDenied}`,

    adminAttractionImage: `/${ROUTE_SEGMENTS.adminAttractionImage}`,
} as const

/**
 * RoutePath
 * 
 * 역할:
 * - ROUTES의 value(절대 경로)로부터 내부 라우트 문자열 유니온 타입을 생성
 * 
 * 목적:
 * - 하드코딩된 문자열 경로 사용을 줄이고, 오타를 컴파일 타임에 차단
 */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

/**
 * ATTRACTIONS_PAGE_SIZE
 * 
 * 역할:
 * - 관광지 목록의 기본 페이지 크기를 정책 상수로 고정
 * 
 * 포인트:
 * - 쿼리 캐시 키(page/size)와 UI 레이아웃(카드 개수/스크롤 길이)에 영향
 */
export const ATTRACTIONS_PAGE_SIZE = 4 as const

/**
 * buildAttractionsListSearchParams
 * 
 * 역할:
 * - 관광지 목록 조회에 필요한 검색 파라미터(page/size/keyword)를 URLSearchParams로 구성
 * 
 * 동작:
 * - page: 0 이상 정수만 허용(그 외 입력은 0으로 정규화)
 * - size: 1 이상 정수만 허용(그 외 입력은 기본값으로 정규화)
 * - keyword: trim 후 빈 문자열이면 파라미터에서 제외
 * 
 * 목적:
 * - 주소창 직접 입력/딥링크 등 비정상 쿼리값 유입에도 목록 화면이 안정적으로 동작
 * 
 * 주의:
 * - size 상한 제한은 서버에서 강제하는 것을 전제 (과도한 size 요청 방지)
 */
export function buildAttractionsListSearchParams(params: {
    page?: number
    size?: number
    keyword?: string
}): URLSearchParams {
    const pageRaw: number = params.page ?? 0
    const sizeRaw: number = params.size ?? ATTRACTIONS_PAGE_SIZE
    const keywordRaw: string = params.keyword ?? ""

    const page: number = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0
    const size: number = Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.floor(sizeRaw) : ATTRACTIONS_PAGE_SIZE
    const keyword: string = keywordRaw.trim()

    const sp = new URLSearchParams()
    sp.set("page", String(page))
    sp.set("size", String(size))

    if (keyword.length > 0) {
        sp.set("keyword", keyword)
    }

    return sp
}

/**
 * toAttractionDetailPath
 * 
 * 역할:
 * - 관광지 상세 페이지로 이동하기 위한 경로를 생성
 * 
 * 동작:
 * - keyId를 encodeURIComponent로 인코딩하여 path segment로 안전하게 포함
 * 
 * 주의:
 * - keyId가 이미 인코딩된 값이라면 중복 인코딩이 발생할 수 있으므로,
 *   keyId는 "원본 식별자"를 전달하는 것을 전제
 */
export function toAttractionDetailPath(keyId: string): string {
    const safe: string = encodeURIComponent(keyId)
    return `${ROUTES.attractions}/${safe}`
}

/**
 * toMapFocusPath
 * 
 * 역할:
 * - 지도 화면에서 특정 관광지를 선택 상태로 열기 위한 경로를 생성
 * 
 * 동작:
 * - focus 쿼리 파라미터에 keyId를 인코딩해 전달
 * 
 * 포인트:
 * - 지도 페이지는 focus 값을 기준으로 패널 오픈/패닝/하이라이트 등 "선택 상태"를 복원 가능
 */
export function toMapFocusPath(keyId: string): string {
    const safe: string = encodeURIComponent(keyId)
    return `${ROUTES.map}?focus=${safe}`
}
