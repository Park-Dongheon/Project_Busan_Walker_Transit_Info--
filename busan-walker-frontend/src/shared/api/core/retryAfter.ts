// src/shared/api/core/retryAfter.ts

/**
 * retryAfter.ts (Shared API Core - Retry-After 백오프 유틸)
 *
 * 역할/목적:
 * - 429(Too Many Requests) 응답의 Retry-After 헤더를 파싱하여 백오프(back-off) 대기 시간을 계산
 * - 무한 대기/무한 재시도를 방지하기 위해 maxMs 상한을 강제 적용
 *
 * 데이터 흐름:
 *   Axios response headers (unknown)
 *      ↓  readHeaderValue()
 *   Retry-After 헤더 값 (string | null)
 *      ↓  computeRetryAfterMs()
 *   백오프 대기 시간 (number, ms 단위)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · sleep               - ms 단위 대기 Promise (재시도 지연에 사용)
 *      · computeRetryAfterMs - Retry-After 헤더를 ms로 변환 (refreshGate 등에서 사용)
 * - 내부 헬퍼(readHeaderValue, clamp)는 외부에 노출하지 않음
 *
 * 동작 방식:
 * - Retry-After 형식 1: 초 단위 숫자 ("5" → 5000ms)
 * - Retry-After 형식 2: HTTP-date ("Wed, 21 Oct 2015 07:28:00 GMT" → 해당 시각까지 남은 ms)
 * - 파싱 실패 또는 헤더 없음: defaultMs 사용
 * - 모든 결과는 [0, maxMs] 범위로 clamp 처리
 *
 * 운영 포인트:
 * - maxMs를 너무 크게 설정하면 UX가 오래 멈추므로 호출부에서 적절한 상한 지정 필요
 */

/**
 * ms 단위로 지정된 시간만큼 대기하는 Promise를 반환
 *
 * - ms가 유한한 숫자가 아니면 0ms로 대체하여 예외 상황에서도 안전하게 동작
 * - 음수 ms는 0으로 보정
 */
export function sleep(ms: number): Promise<void> {
    const safe: number = Number.isFinite(ms) ? Math.max(0, ms) : 0
    return new Promise((resolve) => setTimeout(resolve, safe))
}

/**
 * Retry-After 헤더를 파싱하여 백오프 대기 시간을 ms 단위로 반환
 *
 * - 헤더가 없거나 파싱 실패 시 defaultMs 사용
 * - 결과는 항상 [0, maxMs] 범위로 clamp하여 무한 대기 방지
 *
 * @param headers Axios response headers (대부분 Record<string, unknown> 형태)
 * @param defaultMs 헤더가 없거나 파싱 실패 시 사용할 기본 백오프 (ms)
 * @param maxMs 무한 대기 방지 상한 (ms)
 */
export function computeRetryAfterMs(
    headers: unknown,
    defaultMs: number,
    maxMs: number
): number {
    const raw: string | null = readHeaderValue(headers, "retry-after")
    if (!raw) return clamp(defaultMs, 0, maxMs)

    const trimmed: string = raw.trim()
    if (trimmed.length === 0) return clamp(defaultMs, 0, maxMs)

    /* 1) seconds 형식 (숫자만 허용) */
    if (/^\d+$/.test(trimmed)) {
        const seconds: number = Number(trimmed)
        return clamp(seconds * 1000, 0, maxMs)
    }

    /* 2) HTTP-date 형식 */
    const dateMs: number = Date.parse(trimmed)
    if (Number.isFinite(dateMs)) {
        const now: number = Date.now()
        const delta: number = dateMs - now
        return clamp(delta, 0, maxMs)
    }

    return clamp(defaultMs, 0, maxMs)
}

/**
 * Axios 응답 headers에서 특정 헤더 값을 대소문자 무시로 안전하게 추출
 *
 * - headers가 객체가 아니면 null 반환
 * - 헤더 키를 모두 소문자로 비교하여 대소문자 불일치 문제 방지
 * - 값이 string이면 그대로, string[]이면 첫 번째 요소를 반환
 * - 환경/라이브러리별로 headers 값 타입이 달라질 수 있어 unknown 기반으로 방어적으로 처리
 * - 동일 헤더가 중복으로 들어오는 경우 일반적으로 배열로 표현되므로 첫 값을 우선 사용
 */
function readHeaderValue(headers: unknown, headerNameLower: string): string | null {
    if (!headers || typeof headers !== "object") return null

    const record = headers as Record<string, unknown>
    for (const [k, v] of Object.entries(record)) {
        if (k.toLowerCase() !== headerNameLower) continue

        if (typeof v === "string") return v
        if (Array.isArray(v) && typeof v[0] === "string") return v[0]
        return null
    }

    return null
}

/**
 * 숫자 값을 [min, max] 범위로 강제 제한(클램프)
 *
 * - value가 유한한 숫자가 아니면(NaN/Infinity 등) min으로 대체
 * - 네트워크 헤더 파싱처럼 외부 입력이 들어올 때는 NaN/Infinity 방어가 필수
 * - 백오프/타임아웃 값에 clamp를 적용하여 무한 대기나 음수 대기를 방지
 */
function clamp(value: number, min: number, max: number): number {
    const n: number = Number.isFinite(value) ? value : min
    return Math.max(min, Math.min(max, n))
}
