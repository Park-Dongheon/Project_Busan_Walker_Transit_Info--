// src/shared/auth/requestPolicy.ts

/**
 * requestPolicy.ts (Shared Auth - 요청 분류 정책)
 *
 * 역할/목적:
 * - 인터셉터 단계에서 요청을 public/protected로 일관되게 분류
 * - 분류 결과에 따라 Authorization 헤더 제거/주입 정책을 강제
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · isPublicRequest   - 현재 요청이 public API인지 판별 (인터셉터에서 호출)
 *      · stripAuthHeader   - Authorization 헤더를 강제 제거 (public 요청 보호)
 *      · setBearerToken    - Bearer 토큰 헤더를 주입 (protected 요청에서만 호출)
 * - 내부 헬퍼(getRequestPath, normalizeApiPath)는 외부에 노출하지 않음
 *
 * 동작 방식:
 * - public 요청: Authorization 헤더를 붙이지 않음
 * - protected 요청: access token이 있을 때만 Bearer 헤더를 주입
 * - 프록시/BFF 구성에 따라 URL 프리픽스(/api, /api/v1)가 달라도 동일 정책 적용
 *
 * 운영 포인트:
 * - isPublicRequest의 허용 경로/메서드는 인증 정책 변경 시 반드시 함께 업데이트 필요
 * - 새 public API 추가 시 isPublicRequest 내 조건문에 추가
 */

import { AxiosHeaders, type InternalAxiosRequestConfig } from "axios";

/**
 * Axios request config.url에서 경로(pathname)만 안전하게 추출
 *
 * - query string을 먼저 제거하고, 절대 URL이면 URL 파싱 결과의 pathname을 사용
 * - 파싱 실패 또는 상대 경로면 "/" 접두를 보정하여 반환
 * - 인터셉터에서 config.url 형태가 상대/절대/예외 문자열로 섞여 들어올 수 있어 방어적으로 처리
 */
function getRequestPath(config: InternalAxiosRequestConfig): string {
    const rawUrl: string = String(config.url ?? "");
    const noQuery: string = rawUrl.split("?")[0];

    if (noQuery.startsWith("http://") || noQuery.startsWith("https://")) {
        try {
            return new URL(noQuery).pathname;
        } catch {
            return noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
        }
    }

    return noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
}

/**
 * "/api", "/api/v1" 같은 API 프리픽스를 제거해 정책 비교용 경로로 정규화
 *
 * - 프록시/BFF 구성에 따라 요청 URL 프리픽스가 달라도 동일 정책을 적용하기 위함
 * - 정책 비교를 위한 정규화이며, 실제 요청 URL 자체를 변경하지 않음
 */
function normalizeApiPath(path: string): string {
    if (path.startsWith("/api/v1/")) return path.slice("/api/v1".length);
    if (path.startsWith("/api/")) return path.slice("/api".length);
    return path;
}

/**
 * 현재 요청이 public API인지 판별
 *
 * - /auth/** 경로는 public (로그인/회원가입/토큰 갱신 등)
 * - 관광지 조회 API는 읽기(GET)만 public:
 *     GET /attractions, GET /attractions/intros, GET /attractions/:keyId
 * - 그 외 요청은 protected (인증 필요)
 * - 허용 경로/메서드는 인증 정책 변경 시 반드시 함께 업데이트 필요
 */
export function isPublicRequest(config: InternalAxiosRequestConfig): boolean {
    const method: string = (config.method ?? "get").toLowerCase();
    const rawPath: string = getRequestPath(config);
    const path: string = normalizeApiPath(rawPath);

    if (path.startsWith("/auth/")) return true;

    // 관광지 목록 조회
    if (method === "get" && path === "/attractions") return true;
    if (method === "get" && path === "/attractions/intros") return true;

    // 관광지 상세 조회: GET /attractions/:keyId
    if (method === "get" && /^\/attractions\/[^/]+$/.test(path)) return true;

    return false;
}

/**
 * 요청 헤더에서 Authorization 값을 강제 제거
 *
 * - public 요청으로 분류된 경우 인증 헤더를 강제로 제거하여 정책 충돌을 방지
 * - AxiosHeaders 인스턴스와 일반 Record 객체 두 형태를 모두 처리
 */
export function stripAuthHeader(config: InternalAxiosRequestConfig): void {
    if (!config.headers) return;

    if (config.headers instanceof AxiosHeaders) {
        config.headers.delete("Authorization");
        config.headers.delete("authorization");
        return;
    }

    const h: Record<string, unknown> = config.headers as Record<string, unknown>;
    delete h.Authorization;
    delete h.authorization;
}

/**
 * protected 요청에 Authorization: Bearer <token> 헤더를 주입
 *
 * - headers가 없으면 AxiosHeaders로 초기화
 * - AxiosHeaders/일반 객체 모두에 대해 안전하게 값을 설정
 * - 이 함수는 public/protected 판별 이후 protected 경로에서만 호출해야 함
 */
export function setBearerToken(config: InternalAxiosRequestConfig, token: string): void {
    if (!config.headers) {
        config.headers = new AxiosHeaders();
    }

    if (config.headers instanceof AxiosHeaders) {
        config.headers.set("Authorization", `Bearer ${token}`);
        return;
    }

    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
}
