// src/shared/lib/apiError.ts

/**
 * apiError.ts (Shared Lib - API 오류 메시지/코드 추출 유틸)
 *
 * 역할/목적:
 * - API 호출에서 발생한 error 객체로부터 사용자에게 보여줄 메시지와 서버 오류 코드를 추출
 * - AxiosError, 일반 Error, string 등 다양한 오류 형태를 단일 인터페이스로 통일
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · getErrorMessage  - 오류 객체에서 사용자 표시용 메시지를 추출 (fallback 지원)
 *      · getErrorCode     - 서버가 내려준 오류 코드(code 필드)를 추출
 * - isAxiosError는 axios 라이브러리 직접 의존을 제한하기 위해 내부에서 자체 구현
 *
 * 동작 방식:
 * - getErrorMessage 우선순위: 서버 body.message > string 오류 > Error.message > fallbackMessage
 * - getErrorCode: AxiosError의 response.data.code 필드를 string으로 추출
 *
 * 운영 포인트:
 * - 서버 오류 응답 스키마(message/code 필드명)가 변경되면 ErrorResponseBody 타입 수정 필요
 */

import type { AxiosError } from "axios";

/**
 * API 오류 응답 body의 최소 타입
 *
 * - 서버마다 응답 형태가 다를 수 있으므로 인덱스 시그니처([key: string])를 포함
 * - message와 code만 명시적으로 타입을 지정하고 나머지는 unknown으로 처리
 */
type ErrorResponseBody = {
    message?: string
    code?: string
    [key: string]: unknown
}

/**
 * 오류 객체에서 사용자에게 보여줄 메시지를 추출
 *
 * 우선순위:
 * 1) AxiosError인 경우: 서버가 내려준 body.message를 최우선으로 사용
 * 2) string 오류: 그대로 반환
 * 3) 일반 Error 객체: error.message 반환
 * 4) 그 외: fallbackMessage 반환
 */
export function getErrorMessage(
    error: unknown,
    fallbackMessage: string
): string {
    // 1) AxiosError인 경우: 서버가 내려준 메시지를 최우선으로 사용
    if (isAxiosError<ErrorResponseBody>(error)) {
        const body = error.response?.data

        if(body?.message && typeof body.message === "string") {
            return body.message
        }
    }

    // 2) string 오류
    if (typeof error === "string") {
        return error
    }

    // 3) 일반 Error 객체
    if (error instanceof Error && error.message) {
        return error.message
    }

    // 4) 그 외에는 기본 메시지
    return fallbackMessage
}

/**
 * 서버가 내려준 오류 코드(code 필드)를 추출
 *
 * - AxiosError가 아니면 undefined 반환
 * - response.data.code가 string이면 반환, 그 외는 undefined
 * - 예: { code: "EMAIL_NOT_VERIFIED", message: "이메일 인증이 필요합니다." }
 */
export function getErrorCode(error: unknown): string | undefined {
    if (!isAxiosError<ErrorResponseBody>(error)) {
        return undefined
    }
    const body = error.response?.data
    return typeof body?.code === "string" ? body.code : undefined
}

/**
 * axios 라이브러리의 isAxiosError를 내부에서 재구현한 타입 가드
 *
 * - axios 직접 import 없이 AxiosError 여부를 판별하여 외부 의존도를 최소화
 * - isAxiosError 속성을 검사하여 duck typing 방식으로 판별
 */
function isAxiosError<T = unknown>(error: unknown): error is AxiosError<T> {
    return Boolean(
        error &&
            typeof error === "object" &&
            "isAxiosError" in error &&
            (error as AxiosError).isAxiosError === true
    )
}
