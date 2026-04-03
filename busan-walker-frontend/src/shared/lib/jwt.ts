// src/shared/lib/jwt.ts

/**
 * jwt.ts (Shared Lib - JWT 디코딩 및 만료 시간 유틸)
 *
 * 역할/목적:
 * - JWT payload를 안전하게 디코딩하여 만료 시간(exp) 등 클레임을 추출
 * - accessToken 만료 카운트다운 등 UI 계산에 필요한 헬퍼를 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · decodeJwtPayload  - JWT payload를 제네릭 타입으로 안전하게 디코딩
 *      · getJwtExpMs       - JWT의 exp 클레임을 밀리초 단위 timestamp로 변환
 *      · formatRemaining   - 남은 초(seconds)를 HH:MM:SS 또는 MM:SS 문자열로 포맷
 * - base64UrlToString은 디코딩 내부 헬퍼로 외부에 노출하지 않음
 *
 * 동작 방식:
 * - JWT는 "header.payload.signature" 3파트 구조이므로 parts.length !== 3이면 null 반환
 * - 잘못된 토큰/형식이면 null을 반환하여 UI가 조용히 숨도록(graceful degradation) 처리
 * - base64url 형식의 패딩을 보정하여 atob로 디코딩
 *
 * 운영 포인트:
 * - atob는 브라우저 환경에서만 동작하므로 SSR 환경에서는 별도 처리 필요
 * - exp 클레임은 초 단위이므로 ms 변환 시 * 1000 적용
 */

/**
 * JWT payload의 최소 타입 (exp 클레임만 정의)
 *
 * - exp는 토큰 만료 시각(Unix timestamp, 초 단위)
 * - 이 타입을 제네릭 제약(T extends JwtPayloadBase)으로 사용하여 추가 클레임 확장 가능
 */
type JwtPayloadBase = {
    exp?: number
}

/**
 * base64url 인코딩된 문자열을 일반 문자열로 디코딩
 *
 * - base64url과 base64의 차이: '-' → '+', '_' → '/', 패딩 '=' 보정
 * - atob는 브라우저 전용 API이므로 SSR 환경에서는 별도 처리 필요
 */
function base64UrlToString(input: string): string {
    /* base64url => base64 변환 후 디코딩 */
    const pad = "=".repeat((4 - (input.length % 4)) % 4)
    const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/")
    /* atob는 브라우저 환경에서 사용 가능 */
    return atob(b64)
}

/**
 * JWT 토큰의 payload를 제네릭 타입으로 안전하게 디코딩
 *
 * - JWT 구조(header.payload.signature)에서 payload 파트만 추출하여 JSON 파싱
 * - 파싱 실패(잘못된 형식, 비정상 토큰 등)이면 null 반환하여 UI가 조용히 숨도록 처리
 */
export function decodeJwtPayload<T extends JwtPayloadBase>(token: string): T | null {
    try {
        const parts = token.split(".")
        if (parts.length !== 3) return null

        const json = base64UrlToString(parts[1])
        return JSON.parse(json) as T
    } catch {
        return null
    }
}

/**
 * JWT의 exp 클레임을 밀리초 단위 timestamp로 변환
 *
 * - exp가 없거나 유한한 숫자가 아니면 null 반환
 * - exp는 초 단위이므로 * 1000으로 ms 단위로 변환
 * - Date.now()와 비교하여 만료 여부 또는 남은 시간 계산에 사용
 */
export function getJwtExpMs(token: string): number | null {
    const payload = decodeJwtPayload<JwtPayloadBase>(token)
    if (!payload?.exp || !Number.isFinite(payload.exp)) return null
    return payload.exp * 1000
}

/**
 * 남은 초(seconds)를 HH:MM:SS 또는 MM:SS 형식의 문자열로 포맷
 *
 * - 음수 초는 0으로 보정하여 음수 표시 방지
 * - 1시간 이상이면 HH:MM:SS, 미만이면 MM:SS 형식으로 반환
 * - accessToken 만료 카운트다운 UI 표시에 사용
 */
export function formatRemaining(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))

    const hh = Math.floor(s / 3600)
    const mm = Math.floor((s % 3600) / 60)
    const ss = s % 60

    if (hh > 0) {
        return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    }

    return `${mm}:${String(ss).padStart(2, "0")}`
}
