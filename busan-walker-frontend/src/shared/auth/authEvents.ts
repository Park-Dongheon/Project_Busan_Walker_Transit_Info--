// src/shared/auth/authEvents.ts

/**
 * authEvents.ts (Shared Auth - 인증 토큰 이벤트 버스)
 *
 * 역할/목적:
 * - 한 탭에서 토큰이 갱신/삭제되면 다른 탭도 즉시 반영하는 탭 간 동기화 모듈
 * - BroadcastChannel로 탭 간 메시지를 전달하고, window CustomEvent로 재발행하여 앱 내부 구독 모델을 단순화
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · TokensClearedReason    - 토큰 제거 사유 유니온 타입
 *      · AuthTokens             - 인증 토큰 payload 타입
 *      · TokensClearedDetail    - 토큰 제거 이벤트 detail 타입
 *      · dispatchTokensUpdated  - 토큰 갱신을 현재 탭 및 다른 탭에 전파
 *      · dispatchTokensCleared  - 토큰 제거를 현재 탭 및 다른 탭에 전파
 *      · onTokensUpdated        - 토큰 갱신 이벤트 구독 (unsubscribe 함수 반환)
 *      · onTokensCleared        - 토큰 제거 이벤트 구독 (unsubscribe 함수 반환)
 *      · AUTH_EVENTS_TAB_ID     - 현재 탭 식별자 (디버깅/로깅용)
 *
 * 동작 방식:
 * - sourceId(TAB_ID)로 자기 자신이 보낸 메시지(에코)를 무시하여 무한 루프 방지
 * - BroadcastChannel 미지원 환경(Safari 구형 등)에서는 현재 탭 내 이벤트만 동작
 * - SSR 환경(window 없음)에서는 no-op unsubscribe를 반환하여 호출 측 방어 부담을 줄임
 *
 * 운영 포인트:
 * - CHANNEL_NAME에 앱/버전 네임스페이스가 포함되므로 메이저 버전 업 시 변경 필요
 * - TokensClearedReason 유니온 변경 시 isBusMessage 타입 가드도 함께 수정 필요
 */

// 브라우저 환경(window 존재) 여부를 판단하는 가드 플래그 - SSR/Node 환경에서 window 접근 시 런타임 에러를 막기 위한 안전장치
const hasWindow: boolean = typeof window !== "undefined"

/**
 * 토큰 제거(세션 종료) 사유를 표준 문자열 유니온으로 고정
 *
 * - 사유를 enum-like로 고정하면 로그/모니터링/UX 분기에서 일관성을 유지할 수 있음
 */
export type TokensClearedReason = "LOGOUT" | "REFRESH_FAILED" | "SECURITY" | "MANUAL"

/**
 * 앱에서 사용하는 인증 토큰 payload 타입 정의
 *
 * - 현재는 accessToken만 사용하지만, 확장(refreshToken 메타/만료시각 등) 가능성을 위해 타입으로 분리
 */
export type AuthTokens = {
    accessToken: string
}

/**
 * 토큰 제거 이벤트가 전달하는 detail(payload) 타입
 *
 * - reason을 객체로 감싸두면 향후 필드 확장(예: traceId, timestamp, endpoint) 시 breaking change를 줄임
 */
export type TokensClearedDetail = {
    reason: TokensClearedReason
}

// window CustomEvent로 앱 내부에 발행할 이벤트 이름 - 문자열 상수화로 오타/불일치 리스크를 제거
const TOKENS_UPDATED_EVENT = "auth:tokensUpdated"
const TOKENS_CLEARED_EVENT = "auth:tokensCleared"

// BroadcastChannel 채널 이름 - 앱/버전 단위 네임스페이스를 두어 다른 앱/버전과의 충돌 회피
const CHANNEL_NAME = "busan-walker.auth.v1"

/**
 * BroadcastChannel 인스턴스 (지원되는 브라우저에서만 생성)
 *
 * - globalThis + "BroadcastChannel" in globalThis 방식으로 런타임 지원 여부를 판별
 * - 미지원 환경(Safari 구형 등)에서는 null로 두고, 이후 로직은 null 체크로 처리
 */
const channel: BroadcastChannel | null = typeof globalThis !== "undefined" && "BroadcastChannel" in globalThis
    ? new BroadcastChannel(CHANNEL_NAME)
    : null

/**
 * 현재 탭을 식별하기 위한 고유 ID
 *
 * - BroadcastChannel 수신 시 자기 자신이 보낸 메시지(에코)를 무시하기 위해 sourceId로 비교
 * - crypto.randomUUID()를 우선 사용하여 충돌 가능성을 최소화
 * - 미지원/실패 시에도 동기화 전체가 중단되지 않도록 fallback(시간+난수) 사용
 */
const TAB_ID: string = (() => {
    try {
        const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: unknown } }).crypto
        const maybeRandomUUID = cryptoObj?.randomUUID

        if (typeof maybeRandomUUID === "function") {
            /* 런타임에서 함수임을 확인했으므로 안전하게 호출 가능 */
            return (maybeRandomUUID as () => string)()
        }
    } catch {
        /* 탭 식별 생성 실패는 동기화 기능 전체를 중단시키지 않기 위해 무시 */
    }

    /* crypto.randomUUID 미지원/실패 시 fallback (탭 구분용으로는 충분) */
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
})()

/**
 * BroadcastChannel로 탭 간 전달되는 메시지 스키마(유니온 타입)
 *
 * - type 필드로 메시지 종류를 판별하고, payload(tokens/detail)를 명확히 분리
 * - sourceId는 발신 탭 식별자(TAB_ID)로, 수신 측에서 에코 무시 처리에 사용
 */
type BusMessage =
    | { type: "TOKENS_UPDATED"; tokens: AuthTokens; sourceId: string }
    | { type: "TOKENS_CLEARED"; detail: TokensClearedDetail; sourceId: string }

/**
 * BroadcastChannel로 수신된 unknown 데이터를 BusMessage로 안전하게 좁히는 타입 가드
 *
 * - 런타임에서 type/sourceId 존재 및 타입(string) 검증
 * - 메시지 타입별로 필요한 payload 구조(tokens/detail)까지 추가 검증
 * - BroadcastChannel은 외부/다른 탭에서 어떤 값이든 올 수 있으므로 검증 후에만 처리(런타임 에러 방지)
 */
function isBusMessage(value: unknown): value is BusMessage {
    if (!value || typeof value !== "object") return false

    const v = value as Partial<Record<string, unknown>>
    const type = v.type
    const sourceId = v.sourceId

    if (typeof type !== "string" || typeof sourceId !== "string") return false

    if (type === "TOKENS_UPDATED") {
        const tokens = v.tokens as Partial<AuthTokens> | undefined
        return !!tokens && typeof tokens.accessToken === "string"
    }

    if (type === "TOKENS_CLEARED") {
        const detail = v.detail as Partial<TokensClearedDetail> | undefined
        const reason = detail?.reason
        return (
            !!detail &&
            typeof reason === "string" &&
            (reason === "LOGOUT" || reason === "REFRESH_FAILED" || reason === "SECURITY" || reason === "MANUAL")
        )
    }

    return false
}

/**
 * BroadcastChannel 수신 핸들러 등록
 *
 * - 다른 탭에서 전달된 메시지를 수신하여 현재 탭의 앱 이벤트(CustomEvent)로 재발행
 * - "탭 간 통신(BroadcastChannel)"을 "앱 내부 이벤트(window)"로 변환하여 나머지 앱 코드가 채널 유무를 몰라도 되도록 결합도를 낮춤
 */
if (channel) {
    channel.onmessage = (e: MessageEvent<unknown>) => {
        const msg: unknown = e.data
        if (!isBusMessage(msg)) return
        if (msg.sourceId === TAB_ID) return

        if (msg.type === "TOKENS_UPDATED") {
            dispatchTokensUpdated(msg.tokens)
            return
        }

        if (msg.type === "TOKENS_CLEARED") {
            dispatchTokensCleared(msg.detail)
        }
    }
}

/**
 * 현재 탭에서 토큰이 갱신되었음을 window 이벤트로 알리고, BroadcastChannel 지원 시 다른 탭에도 전파
 *
 * - SSR 환경(hasWindow=false)에서는 window.dispatchEvent를 호출하지 않음
 * - channel이 null이면 탭 간 전파는 생략(현재 탭 내 이벤트만 발행)
 */
export function dispatchTokensUpdated(tokens: AuthTokens): void {
    if (hasWindow) {
        window.dispatchEvent(new CustomEvent<AuthTokens>(TOKENS_UPDATED_EVENT, { detail: tokens }))
    }

    if (channel) {
        const msg: BusMessage = { type: "TOKENS_UPDATED", tokens, sourceId: TAB_ID }
        channel.postMessage(msg)
    }
}

/**
 * 현재 탭에서 토큰이 제거되었음을 window 이벤트로 알리고, BroadcastChannel 지원 시 다른 탭에도 전파
 *
 * - SSR 환경(hasWindow=false)에서는 window.dispatchEvent를 호출하지 않음
 * - channel이 null이면 탭 간 전파는 생략(현재 탭 내 이벤트만 발행)
 */
export function dispatchTokensCleared(detail: TokensClearedDetail): void {
    if (hasWindow) {
        window.dispatchEvent(new CustomEvent<TokensClearedDetail>(TOKENS_CLEARED_EVENT, { detail }))
    }

    if (channel) {
        const msg: BusMessage = { type: "TOKENS_CLEARED", detail, sourceId: TAB_ID }
        channel.postMessage(msg)
    }
}

/**
 * 토큰 갱신 이벤트를 구독하고, unsubscribe 함수를 반환
 *
 * - SSR 환경(window 없음)에서는 no-op unsubscribe를 반환하여 호출 측 방어 부담을 줄임
 * - CustomEvent.detail에 담긴 tokens payload를 listener에 전달
 */
export function onTokensUpdated(listener: (tokens: AuthTokens) => void): () => void {
    if (!hasWindow) return () => undefined

    const handler: EventListener = (e: Event) => {
        const ev = e as CustomEvent<AuthTokens>
        listener(ev.detail)
    }

    window.addEventListener(TOKENS_UPDATED_EVENT, handler)
    return () => window.removeEventListener(TOKENS_UPDATED_EVENT, handler)
}

/**
 * 토큰 제거 이벤트를 구독하고, unsubscribe 함수를 반환
 *
 * - SSR 환경(window 없음)에서는 no-op unsubscribe를 반환
 * - CustomEvent.detail을 그대로 listener에 전달하여 사유(reason) 기반 분기 가능
 */
export function onTokensCleared(listener: (detail: TokensClearedDetail) => void): () => void {
    if (!hasWindow) return () => undefined

    const handler: EventListener = (e: Event) => {
        const ev = e as CustomEvent<TokensClearedDetail>
        listener(ev.detail)
    }

    window.addEventListener(TOKENS_CLEARED_EVENT, handler)
    return () => window.removeEventListener(TOKENS_CLEARED_EVENT, handler)
}

/**
 * 현재 탭 식별자(TAB_ID)를 외부에 노출(읽기 전용)
 *
 * - 디버깅/로깅/테스트에서 탭 구분이 필요할 때 참조
 */
export const AUTH_EVENTS_TAB_ID: string = TAB_ID

/** @deprecated Use AUTH_EVENTS_TAB_ID instead. */
export const Auth_EVENTS_TAB_ID: string = AUTH_EVENTS_TAB_ID
