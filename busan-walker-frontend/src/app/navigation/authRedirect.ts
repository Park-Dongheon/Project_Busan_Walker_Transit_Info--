// src/app/navigation/authRedirect.ts

import { ROUTES, type RoutePath } from "@/app/navigation/navigation";

/**
 * AuthRedirectFrom
 * 
 * 역할:
 * - 인증(로그인/재인증) 이후 사용자를 "원래 보려던 화면"으로 복귀시키기 위해
 *   location 전체가 아닌 최소 정보(pathname/search/hash)만 저장하는 표준 타입
 * 
 * 정책 포인트:
 * - 복귀 대상은 앱 내부 라우트로 제한되어야 하므로,
 *   resolve 단계에서 open redirect 방어 규칙을 적용
 */
export type AuthRedirectFrom = {
    pathname: string
    search: string
    hash: string
}

/**
 * LocationLike
 * 
 * 역할:
 * - Router Location 객체의 최소 형태를 추상화한 타입
 * - pathname은 필수, search/hash는 선택으로 받아 표준 타입(AuthRedirectFrom)으로 정규화
 */
type LocationLike = {
    pathname: string
    search?: string
    hash?: string
}

/**
 * ALLOWED_TOP_LEVEL_SEGMENTS
 * 
 * 역할:
 * - 앱 내부 "최상위 경로 세그먼트" 화이트리스트
 * 
 * 생성 정책:
 * - ROUTES(절대 경로 SSOT)의 값에서 "/{segment}/..." 형태의 첫 segment를 추출해 집합 생성
 * - "/"(home)은 첫 segment가 빈 문자열("")이므로, 루트 경로 허용을 의미
 */
const ALLOWED_TOP_LEVEL_SEGMENTS = new Set<string>(
    Object.values(ROUTES).map((path) => path.split("/")[1] ?? ""),
)

/**
 * pathname이 내부 라우트 범위인지 판정
 * 
 * 동작:
 * - pathname의 첫 세그먼트를 추출하여 화이트리스트에 포함되는지 확인
 * 
 * 주의:
 * - pathname은 query/hash가 제외된 "순수 경로"를 전제
 * - open redirect 방어(leading "/" 등)는 상위 단계에서 별도로 수행
 */
function isAllowedInternalPath(pathname: string): boolean {
    const firstSegment = pathname.split("/")[1] ?? ""
    return ALLOWED_TOP_LEVEL_SEGMENTS.has(firstSegment)
}

/**
 * toAuthRedirectFrom
 * 
 * 역할:
 * - location 전체를 저장하지 않고 pathname/search/hash만 추출하여 표준 형태로 만듦
 * 
 * 동작:
 * - pathname은 trim 후 비어 있으면 home("/")로 정규화
 * - search/hash는 없으면 빈 문자열로 정규화
 */
export function toAuthRedirectFrom(location: LocationLike): AuthRedirectFrom {
    const pathname = typeof location.pathname === "string" ? location.pathname.trim() : ""

    return {
        pathname: pathname.length > 0 ? pathname : ROUTES.home,
        search: location.search ?? "",
        hash: location.hash ?? "",
    }
}

/**
 * resolveAuthRedirectTarget
 * 
 * 역할:
 * - 로그인 이후 복귀할 최종 경로를 계산
 * 
 * 보안 정책(open redirect 방어):
 * - pathname은 반드시 "/"로 시작(내부 절대 경로)
 * - "//"로 시작하는 프로토콜-상대 경로는 차단
 * - 최상위 세그먼트는 ROUTES 기반 화이트리스트(ALLOWED_TOP_LEVEL_SEGMENTS) 범위로 제한
 * - fallbackPath는 RoutePath 타입으로 제한하여 내부 라우트만 허용
 * 
 * 동작:
 * - search는 "?"로 시작하는 문자열만 허용하고, 아니면 제거
 * - hash는 "#"로 시작하는 문자열만 허용하고, 아니면 제거
 */
export function resolveAuthRedirectTarget(
    from: AuthRedirectFrom | undefined,
    fallbackPath: RoutePath = ROUTES.home,
): string {
    if (!from) return fallbackPath

    const pathname = typeof from.pathname === "string" ? from.pathname.trim() : ""
    if (pathname.length === 0) return fallbackPath
    if (!pathname.startsWith("/") || pathname.startsWith("//")) return fallbackPath
    if (!isAllowedInternalPath(pathname)) return fallbackPath

    const search = typeof from.search === "string" && from.search.startsWith("?") ? from.search : ""
    const hash = typeof from.hash === "string" && from.hash.startsWith("#") ? from.hash : ""

    return `${pathname}${search}${hash}`
}