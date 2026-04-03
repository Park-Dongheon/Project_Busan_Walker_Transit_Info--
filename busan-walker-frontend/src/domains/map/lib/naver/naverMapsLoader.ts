// src/domains/map/lib/naver/naverMapsLoader.ts

// cspell:ignore navermaps ncpKeyId
/// <reference types="navermaps" />

/**
 * naverMapsLoader.ts (네이버 지도 SDK 로더)
 * 
 * 역할/목적:
 * - 네이버 지도 JavaScript SDK를 브라우저 런타임에서 한 번만 안정적으로 로딩
 * - 여러 화면/컴포넌트에서 동시에 로딩을 요청해도 단일 Promise 흐름으로 수렴
 * - 인증 실패, script 오류, timeout, 잘못된 기존 script 상태를 감지하고
 *   재시도 가능한 상태로 복구
 * 
 * 공개 정책 / 설계 원칙:
 * - SDK 로딩과 준비 상태 판정에 필요한 진입점만 노출
 * - 실제 지도 생성/마커/이벤트 연결 같은 화면 로직은 상위 훅과 UI 계층에서 담당
 * - SDK는 전역(window.naver.maps)에 붙는 singleton 성격이므로 동일 런타임에서 서로 다른 clientId 혼용을 허용하지 않음
 * 
 * 동작 방식:
 * - 이미 SDK가 준비된 경우 즉시 반환
 * - 이미 로딩 중이면 in-flight Promise를 공유하여 중복 로딩을 방지
 * - 새 로딩 시 script 삽입, 전역 callback 연결, auth failure, timeout을 함께 관리
 * - 성공은 단순 script load가 아니라 실제 maps 객체와 required submodule 존재 여부로 최종 판단
 * 
 * 운영 포인트:
 * - SDK URL 파라미터, callback 이름, required submodule이 바뀌면
 *   현재 파일과 지도 초기화 계층(useNaverMap 등)을 함께 점검
 * - 로더 정책 변경은 지도 최초 진입 성공률과 재시도 UX에 직접 영향을 줌
 * 
 * 주의:
 * - 브라우저 전용 로더이므로 SSR/Node 환경에서는 동작하지 않음
 * - script load 이벤트만으로는 SDK 준비 완료를 보장하지 않으므로
 *   항상 window.naver.maps 기준으로 최종 확인
 * - 전역 callback 기반 SDK 특성상 같은 이름의 전역 함수를 다른 코드가 건드리면 충돌 가능성 존재
 */

const NAVER_MAPS_SCRIPT_ID = "naver-maps-sdk"
const NAVER_MAPS_CALLBACK_NAME = "__initNaverMap__"

/**
 * 현재 서비스에서 반드시 필요한 SDK submodule 목록
 * 
 * 의미:
 * - maps 객체가 존재하더라도 여기 정의된 기능이 없으면 로딩 성공으로 보지 않음
 */
const NAVER_MAPS_REQUIRED_SUBMODULES = ["geocoder"] as const
type NaverMapsRequiredSubmodule = (typeof NAVER_MAPS_REQUIRED_SUBMODULES)[number]
const NAVER_MAPS_SUBMODULES = NAVER_MAPS_REQUIRED_SUBMODULES.join(",")

/**
 * SDK 로딩 timeout 기본/최소/최대 값
 * 
 * 정책:
 * - 환경 변수로 조정 가능하되, 비정상 값은 허용 범위로 보정
 */
const NAVER_MAPS_LOAD_TIMEOUT_MS_DEFAULT = 15_000
const NAVER_MAPS_LOAD_TIMEOUT_MS_MIN = 5_000
const NAVER_MAPS_LOAD_TIMEOUT_MS_MAX = 60_000

/**
 * 이 로더가 직접 생성한 script임을 식별하는 dataset owner 값
 * 
 * 용도:
 * - 실패 시 안전하게 제거 가능한 script인지 판단
 * - 외부 코드가 만든 script와 구분
 */
const NAVER_MAPS_SCRIPT_OWNER = "map-domain-loader"

/**
 * script element에 기록하는 로딩 상태 값
 * 
 * - loading: script 삽입 후 SDK 준비 대기 중
 * - script-loaded: script 파일은 로드되었지만 SDK 준비는 미확정
 * - ready: maps 객체와 required submodule까지 준비 완료
 * - failed: 현재 로딩 시도는 실패
 */
type ScriptLoadState = "loading" | "script-loaded" | "ready" | "failed"

/**
 * 모듈 전역 로딩 상태
 * 
 * - loadPromise:
 *   현재 진행 중인 SDK 로딩 Promise
 * - loadingClientId:
 *   로딩 중인 clientId
 * - loadedClientId:
 *   이미 준비 완료된 SDK의 clientId
 * 
 * 의미:
 * - 여러 호출이 동시에 들어와도 동일 Promise를 공유하는 single-flight 구조를 유지
 * - 다른 clientId로 중복 로딩되는 것을 방지
 */
let loadPromise: Promise<typeof naver.maps> | null = null
let loadingClientId: string | null = null
let loadedClientId: string | null = null

/**
 * SDK script URL 생성
 * 
 * 정책:
 * - clientId, required submodules, callback 이름을 query string으로 포함
 * - query parameter는 안전하게 encode 처리
 */
function buildNaverMapsSdkUrl(clientId: string): string {
    return (
        "https://oapi.map.naver.com/openapi/v3/maps.js" +
        `?ncpKeyId=${encodeURIComponent(clientId)}` +
        `&submodules=${encodeURIComponent(NAVER_MAPS_SUBMODULES)}` +
        `&callback=${encodeURIComponent(NAVER_MAPS_CALLBACK_NAME)}`
    )
}

/**
 * 기존 script.src에서 clientId 추출
 * 
 * 용도:
 * - DOM에 이미 존재하는 SDK script가 현재 요청과 같은 clientId인지 확인
 */
function getClientIdFromScript(script: HTMLScriptElement): string | null {
    try {
        const parsed = new URL(script.src)
        const value = parsed.searchParams.get("ncpKeyId")

        return typeof value === "string" && value.length > 0 ? value : null
    } catch {
        return null
    }
}

/**
 * 기존 script.src에서 submodule 목록 추출
 * 
 * 용도:
 * - 이미 삽입된 SDK script가 현재 서비스에 필요한 submodule을 포함하는지 확인
 */
function getSubmodulesFromScript(script: HTMLScriptElement): Set<string> {
    try {
        const parsed = new URL(script.src)
        const raw = parsed.searchParams.get("submodules")
        if (typeof raw !== "string") return new Set()

        return new Set(
            raw.split(",")
                .map((item) => item.trim().toLowerCase())
                .filter((item) => item.length > 0)
        )
    } catch {
        return new Set()
    }
}

/**
 * DOM에 이미 존재하는 네이버 지도 SDK script 탐지
 * 
 * 우선순위:
 * - 고정 id로 탐지
 * - 없으면 maps.js를 가리키는 script를 검색
 */
function detectExistingNaverMapsScript(): HTMLScriptElement | null {
    const scriptById = document.getElementById(NAVER_MAPS_SCRIPT_ID) as HTMLScriptElement | null
    if (scriptById?.src?.includes("oapi.map.naver.com/openapi/v3/maps.js")) {
        return scriptById
    }

    const scripts = Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[src*="oapi.map.naver.com/openapi/v3/maps.js"]')
    )

    return scripts[0] ?? null
}

/**
 * script URL 기준 required submodule 누락 여부 확인
 * 
 * 의미:
 * - DOM에 남아 있는 script query parameter 정보 기준으로 누락 여부를 파악
 * - 실제 최종 판정은 runtime 기준 검사와 함께 사용
 */
function getMissingRequiredSubmodulesFromScript(
    script: HTMLScriptElement | null
): NaverMapsRequiredSubmodule[] {
    if (!script) return []

    const loadedSubmodules = getSubmodulesFromScript(script)

    return NAVER_MAPS_REQUIRED_SUBMODULES.filter((submodule) => !loadedSubmodules.has(submodule))
}

/**
 * 런타임 기준 required submodule 누락 여부 확인
 * 
 * 의미:
 * - script URL만으로는 충분하지 않고, 실제 maps namespace에 필요한 기능이 준비되었는지 최종 검증
 */
function getMissingRequiredSubmodulesFromRuntime(
    maps: typeof naver.maps | null | undefined
): NaverMapsRequiredSubmodule[] {
    return NAVER_MAPS_REQUIRED_SUBMODULES.filter((submodule) => {
        if (submodule === "geocoder") {
            return typeof maps?.Service?.geocode !== "function"
        }

        return false
    })
}

/* required submodule 누락 오류 메시지 생성 */
function buildMissingRequiredSubmodulesMessage(
    missingSubmodules: readonly NaverMapsRequiredSubmodule[]
): string {
    return `Naver Maps SDK is missing required submodules: ${missingSubmodules.join(", ")}`
}

/**
 * runtime/script 기준 정보를 종합해 required submodule 오류 메시지 구성
 * 
 * 정책:
 * - 실제 runtime 누락 여부를 먼저 확인
 * - script query parameter 기준 정보가 있으면 보다 설명적인 메시지에 활용
 */
function getRequiredSubmoduleError(args: {
    maps: typeof naver.maps | null | undefined
    script?: HTMLScriptElement | null
}): string | null {
    const { maps, script = null } = args
    const missingRequiredSubmodules = getMissingRequiredSubmodulesFromRuntime(maps)
    if (missingRequiredSubmodules.length === 0) return null

    const missingRequiredSubmodulesFromScript =
        getMissingRequiredSubmodulesFromScript(script)

    return buildMissingRequiredSubmodulesMessage(
        missingRequiredSubmodulesFromScript.length > 0
            ? missingRequiredSubmodulesFromScript
            : missingRequiredSubmodules
    )
}

/**
 * SDK 로딩 timeout 결정
 * 
 * 정책:
 * - 환경 변수 값을 사용하되, 비정상 값은 기본값 사용
 * - 지나치게 짧거나 긴 값은 최소/최대 범위로 보정
 */
function resolveSdkLoadTimeoutMs(): number {
    const raw = import.meta.env.VITE_NAVER_MAP_SDK_TIMEOUT_MS
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return NAVER_MAPS_LOAD_TIMEOUT_MS_DEFAULT

    const rounded = Math.round(parsed)
    if (rounded < NAVER_MAPS_LOAD_TIMEOUT_MS_MIN) return NAVER_MAPS_LOAD_TIMEOUT_MS_MIN
    if (rounded > NAVER_MAPS_LOAD_TIMEOUT_MS_MAX) return NAVER_MAPS_LOAD_TIMEOUT_MS_MAX
    return rounded
}

const NAVER_MAPS_LOAD_TIMEOUT_MS = resolveSdkLoadTimeoutMs()

/**
 * script element dataset에 로더 상태를 기록
 * 
 * 용도:
 * - 현재 로더가 소유한 script인지 구분
 * - 로딩 도중 실패한 stale script인지 판단하는 근거로 사용
 */
function markScriptState(script: HTMLScriptElement, state: ScriptLoadState): void {
    script.dataset.naverMapsLoaderOwner = NAVER_MAPS_SCRIPT_OWNER
    script.dataset.naverMapsLoaderState = state
}

/* script element dataset에서 현재 로더 상태를 읽음 */
function readScriptState(script: HTMLScriptElement): ScriptLoadState | null {
    const value = script.dataset.naverMapsLoaderState

    if (
        value === "loading" ||
        value === "script-loaded" ||
        value === "ready" ||
        value === "failed"
    ) {
        return value
    }

    return null
}

/**
 * script element 제거
 * 
 * 주의:
 * - DOM에서 script를 제거해도 이미 초기화된 window.naver.maps까지 되돌아가는 것은 아님
 * - 이 함수는 stale script 정리 목적이며, SDK 준비 상태의 최종 기준은 항상 런타임
 */
function removeScript(script: HTMLScriptElement | null): void {
    if (!script) return
    script.remove()
}

/**
 * 네이버 지도 SDK 로딩의 공식 진입점
 * 
 * 역할/목적:
 * - 호출부가 SDK 로딩 상태를 직접 관리하지 않고,
 *   이 함수만 통해 안전하게 naver.maps를 확보하도록 하는 public API
 * 
 * 동작 요약:
 * 1) clientId와 실행 환경을 검증
 * 2) 이미 로드된 SDK가 있으면 즉시 반환
 * 3) 로딩 중인 Promise가 있으면 공유
 * 4) 아니면 script / callback / error / timeout을 연결해 새 로딩 시작
 * 
 * 실패 처리:
 * - 인증 실패, script 오류, timeout, required submodule 누락 시 reject
 * - 종료 후에는 callback, listener, script, 모듈 상태를 정리해 재시도 가능 상태로 복원
 */
export function loadNaverMapsSdk(clientId: string): Promise<typeof naver.maps> {
    /**
     * clientId 정규화
     * 
     * 이유:
     * - 환경 변수나 외부 입력에는 공백이 섞일 수 있으므로 trim 후 사용
     * - 이후 clientId 일관성 검사는 정규화된 값 기준으로 수행
     */
    const normalizedClientId = clientId.trim()

    /**
     * 입력값 검증(Fail Fast)
     * 
     * 정책:
     * - clientId가 비어 있으면 즉시 실패
     * - 잘못된 설정을 모호하게 넘기지 않고 초기 단계에서 명시적으로 드러냄
     */
    if (!normalizedClientId) {
        return Promise.reject(new Error("Naver Maps clientId is missing"))
    }

    /**
     * 브라우저 런타임 가드
     * 
     * 이유:
     * - 이 로더는 window/document, script 삽입, 전역 callback을 사용하므로
     *   SSR/Node 환경에서는 정상 동작할 수 없음
     */
    if (typeof window === "undefined" || typeof document === "undefined") {
        return Promise.reject(new Error("Naver Maps SDK loader must run in a browser runtime"))
    }

    /**
     * 이미 SDK가 준비된 경우 즉시 반환
     * 
     * 처리 포인트:
     * - 현재 DOM script의 clientId와 요청 clientId가 다르면 reject
     * - 이미 기록되 loadedClientId와 다르면 reject
     * - maps 객체가 있어도 required submodule이 누락되면 성공으로 보지 않음
     * 
     * 이유:
     * - 전역 SDK는 어떤 설정으로 초기화되었는지가 중요하므로
     *   다른 clientId 요청을 조용히 허용하면 상태 충돌 원인
     */
    if (window.naver?.maps) {
        const existingScript = detectExistingNaverMapsScript()
        const clientIdFromDom = existingScript ? getClientIdFromScript(existingScript) : null

        if (clientIdFromDom && clientIdFromDom !== normalizedClientId) {
            return Promise.reject(
                new Error("Naver Maps SDK is already initialized with a different clientId")
            )
        }

        if (loadedClientId && loadedClientId !== normalizedClientId) {
            return Promise.reject(
                new Error("Naver Maps SDK is already initialized with a different clientId")
            )
        }

        const requiredSubmoduleError = getRequiredSubmoduleError({
            maps: window.naver.maps,
            script: existingScript,
        })

        if (requiredSubmoduleError) {
            return Promise.reject(new Error(requiredSubmoduleError))
        }

        loadedClientId = clientIdFromDom ?? normalizedClientId

        return Promise.resolve(window.naver.maps)
    }

    /**
     * single-flight 경로
     * 
     * 처리 포인트:
     * - 이미 로딩 중인 Promise가 있으면 그대로 재사용
     * - 단, 로딩 중인 clientId와 현재 요청 clientId가 다르면 reject
     * 
     * 이유:
     * - 여러 컴포넌트가 동시에 호출해도 script 중복 삽입을 막아야 함
     * - 같은 런타임에서 다른 clientId로 병렬 로딩하면 전역 상태가 불안정해짐
     */
    if (loadPromise) {
        if (loadingClientId && loadingClientId !== normalizedClientId) {
            return Promise.reject(
                new Error("Naver Maps SDK is already loading with a different clientId")
            )
        }

        return loadPromise
    }

    /**
     * 새 로딩 시작 전 현재 로딩 대상 clientId 기록
     * 
     * 의미:
     * - 이후 들어오는 요청이 같은 로딩 흐름에 합류하는지,
     *   아니면 다른 설정과 충돌하는지 판단하는 기준이 됨
     */
    loadingClientId = normalizedClientId

    /**
     * SDK 준비 완료까지의 전체 과정을 하나의 Promise로 캡슐화
     * 
     * 핵심 포인트:
     * - script load 이벤트는 단순 다운로드 완료 신호일 뿐
     * - 실제 성공 시점은 callback 호출 + runtime maps/submodule 준비 완료 이후
     */
    loadPromise = new Promise<typeof naver.maps>((resolve, reject) => {
        /**
         * Promise 종료를 한 번만 허용하는 게이트
         * 
         * 이유:
         * - callback, auth failure, script error, timeout이 경쟁적으로 발생 가능하므로
         *   resolve/reject 중복 실행을 막아야 함
         */
        let settled = false

        /**
         * timeout 추적용 id
         * 
         * 용도:
         * - script가 영원히 pending 상태로 남는 상황을 방지
         */
        let timeoutId: number | null = null
        const timeoutMs = NAVER_MAPS_LOAD_TIMEOUT_MS

        /**
         * script 이벤트 리스너 해제 함수
         * 
         * 의미:
         * - 성공/실패 후 load/error listener가 남지 않도록 공통 정리 경로에서 제거
         */
        let detachScriptListeners: (() => void) | null = null

        /**
         * 기존 DOM script 탐색
         * 
         * 의미:
         * - 이미 존재하는 script를 재사용할지,
         *   제거 후 새로 만들지 판단하기 위한 시작점
         */
        let script = document.getElementById(NAVER_MAPS_SCRIPT_ID) as HTMLScriptElement | null

        /**
         * 기존 전역 callback 백업
         * 
         * 이유:
         * - SDK는 전역 callback 이름을 사용하므로
         *   로딩 종료 후 원래 값을 복구할 수 있도록 백업
         */
        const prevInitCb = window.__initNaverMap__
        const prevAuthFailure = window.navermap_authFailure

        /**
         * 기존 script 재사용 가능 여부 판별
         * 
         * 제거 조건:
         * - 다른 clientId로 로드된 script
         * - 이 로더가 소유했지만 stale 상태가 된 script
         * - 외부가 만든 script인데 maps 객체가 아직 준비되지 않은 경우
         * 
         * 이유:
         * - 신뢰할 수 없는 기존 script를 재사용하면
         *   callback 누락, clientId 불일치, 불완전한 로딩 상태가 이어질 수 있음
         */
        if (script) {
            const existingClientId = getClientIdFromScript(script)
            const ownedByLoader = script.dataset.naverMapsLoaderOwner === NAVER_MAPS_SCRIPT_OWNER
            const state = readScriptState(script)

            const needsClientIdReplacement = typeof existingClientId === "string" && existingClientId !== normalizedClientId
            const isOwnedStaleScript = ownedByLoader && !window.naver?.maps && state !== "loading"
            const isUnownedScriptWithoutMaps = !ownedByLoader && !window.naver?.maps

            if (needsClientIdReplacement || isOwnedStaleScript || isUnownedScriptWithoutMaps) {
                removeScript(script)
                script = null
            }
        }

        /**
         * 전역 callback 복구 함수
         * 
         * 정책:
         * - 현재 전역 callback이 우리 핸들러일 때만 복구
         * - 다른 코드가 나중에 덮어쓴 값을 실수로 되돌리지 않도록 방어
         */
        const restoreGlobalCallbacks = () => {
            if (window[NAVER_MAPS_CALLBACK_NAME] === handleSdkCallback) {
                window[NAVER_MAPS_CALLBACK_NAME] = prevInitCb
            }

            if (window.navermap_authFailure === handleAuthFailure) {
                window.navermap_authFailure = prevAuthFailure
            }
        }

        /**
         * runtime 기준 SDK 준비 여부 최종 판정
         * 
         * 처리 순서:
         * - maps 객체가 없으면 아직 준비 전
         * - required submodule이 누락되면 실패 처리
         * - 모든 조건이 충족되면 성공 처리
         */
        const resolveIfRuntimeReady = (mapsNamespace: typeof naver.maps | null | undefined): boolean => {
            if (!mapsNamespace) return false

            const requiredSubmoduleError = getRequiredSubmoduleError({maps: mapsNamespace, script})

            if (requiredSubmoduleError) {
                rejectOnce(requiredSubmoduleError)
                return true
            }

            resolveOnce(mapsNamespace)
            return true
        }

        /**
         * 공통 성공 종료 경로
         * 
         * 처리 내용:
         * - 상태 ready 기록
         * - timeout 해제
         * - listener 해제
         * - 전역 callback 복구
         * - 모듈 전역 상태 정리
         */
        const resolveOnce = (maps: typeof naver.maps) => {
            if (settled) return
            settled = true

            if (script) {
                markScriptState(script, "ready")
            }

            if (timeoutId !== null) {
                window.clearTimeout(timeoutId)
                timeoutId = null
            }

            detachScriptListeners?.()
            detachScriptListeners = null
            restoreGlobalCallbacks()

            loadPromise = null
            loadedClientId = normalizedClientId
            loadingClientId = null
            resolve(maps)
        }

        /**
         * 공통 실패 종료 경로
         * 
         * 처리 내용:
         * - 상태 failed 기록
         * - timeout 해제
         * - listener 해제
         * - 전역 callback 복구
         * - 모듈 전역 상태 정리
         * - 이 로더가 소유한 script면 제거
         * 
         * 이유:
         * - 실패한 script나 상태를 남기면 다음 요청이 잘못된 상태를 재사용할 수 있음
         */
        const rejectOnce = (message: string) => {
            if (settled) return
            settled = true

            if (script) {
                markScriptState(script, "failed")
            }

            if (timeoutId !== null) {
                window.clearTimeout(timeoutId)
                timeoutId = null
            }

            detachScriptListeners?.()
            detachScriptListeners = null
            restoreGlobalCallbacks()

            loadPromise = null
            loadingClientId = null

            if (script?.dataset.naverMapsLoaderOwner === NAVER_MAPS_SCRIPT_OWNER) {
                removeScript(script)
                script = null
            }

            reject(new Error(message))
        }

        /**
         * 전역 인증 실패 callback 핸들러
         * 
         * 정책:
         * - 기존 authFailure 콜백이 있으면 먼저 호출
         * - 이후 현재 로딩을 실패로 종료
         */
        const handleAuthFailure = () => {
            try {
                prevAuthFailure?.()
            } catch (error) {
                console.error("[Map] Previous navermap_authFailure callback failed:", error)
            }

            rejectOnce("Naver Maps authentication failed")
        }

        /**
         * 전역 SDK 준비 callback 핸들러
         * 
         * 처리 순서:
         * - 기존 callback이 있으면 먼저 호출
         * - 이후 runtime maps 준비 여부를 최종 확인
         * - callback은 왔지만 maps 객체가 없으면 비정상 상태로 간주하고 실패 처리
         */
        const handleSdkCallback = () => {
            try {
                if (prevInitCb && prevInitCb !== handleSdkCallback) {
                    prevInitCb()
                }
            } catch (error) {
                console.error("[Map] Previous __initNaverMap__ callback failed:", error)
            }

            if (resolveIfRuntimeReady(window.naver?.maps)) {
                return
            }

            rejectOnce("Naver Maps SDK callback fired but maps object is missing")
        }

        /**
         * 현재 로딩을 위한 전역 callback 등록
         * 
         * 의미:
         * - SDK는 script query parameter의 callback 이름으로 준비 완료를 알리므로
         *   로딩 시작 전에 전역에 반드시 연결
         */
        window[NAVER_MAPS_CALLBACK_NAME] = handleSdkCallback
        window.navermap_authFailure = handleAuthFailure

        /**
         * script 이벤트 리스너 연결
         * 
         * 역할:
         * - error: 네트워크/차단/로드 실패 감지
         * - load: script 파일 다운로드 완료 상태만 기록
         * 
         * 주의:
         * - load 이벤트는 SDK 사용 가능 상태를 보장하지 않음
         */
        const attachScriptListeners = () => {
            if (!script) return

            const onError = () => {
                rejectOnce("Failed to load Naver Maps SDK script")
            }

            const onLoad = () => {
                if (script) {
                    markScriptState(script, "script-loaded")
                }
            }

            script.addEventListener("error", onError, { once: true })
            script.addEventListener("load", onLoad, { once: true })

            detachScriptListeners = () => {
                script?.removeEventListener("error", onError)
                script?.removeEventListener("load", onLoad)
            }
        }

        /**
         * script 재사용 또는 신규 삽입 분기
         * 
         * - 재사용 가능한 기존 script가 있으면 listener만 연결
         * - 없으면 새 script를 생성하고 loading 상태를 기록한 뒤 head에 삽입
         */
        if (script) {
            attachScriptListeners()

            if (resolveIfRuntimeReady(window.naver?.maps)) {
                return
            }
        } else {
            script = document.createElement("script")
            script.id = NAVER_MAPS_SCRIPT_ID
            script.async = true
            script.defer = true
            script.src = buildNaverMapsSdkUrl(normalizedClientId)
            markScriptState(script, "loading")

            attachScriptListeners()
            document.head.appendChild(script)
        }

        /**
         * 로딩 timeout 설정
         * 
         * 이유:
         * - callback이 오지 않거나 로딩이 비정상적으로 멈춘 경우
         *   Promise가 영원히 pending 상태로 남지 않도록 강제 종료
         */
        timeoutId = window.setTimeout(() => {
            rejectOnce("Timed out while loading Naver Maps SDK")
        }, timeoutMs)

        /**
         * 매우 빠르게 SDK가 준비된 경우를 위한 즉시 확인
         * 
         * 의미:
         * - 기존 script 재사용 상황이나 예외적인 타이밍에서
         *   callback보다 먼저 runtime이 준비된 경우를 놓치지 않기 위한 방어 코드
         */
        if (resolveIfRuntimeReady(window.naver?.maps)) {
            return
        }
    })

    return loadPromise
}