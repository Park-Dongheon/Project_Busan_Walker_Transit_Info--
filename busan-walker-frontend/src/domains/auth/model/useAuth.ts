// src/domains/auth/model/useAuth.ts

import { useContext } from "react";
import { AuthContext, type AuthState } from "./AuthContext";

/**
 * useAuth
 *
 * 역할/목적:
 * - AuthProvider가 React 트리에 주입한 AuthContext(AuthState)를 읽는 전용 접근 훅
 * - 인증 상태(user/isLoading)와 인증 액션(login/logout)을 "단일 진입점"으로 제공하여,
 *   컴포넌트가 Context의 구체 타입/생성 방식을 직접 알지 않아도 되게 함
 * 
 * 타입/안전성 정책:
 * - AuthContext의 기본값을 undefined로 두고, Provider 밖에서 접근 시 즉시 예외를 발생시켜 "설정 누락"을 조기에 발견
 *
 * 동작:
 * - React useContext로 AuthContext 값을 읽음
 * - 컨텍스트 값이 undefined이면(AuthProvider 미적용) 에러를 던짐
 *
 * 포인트:
 * - "조용히 null 반환" 대신 즉시 throw를 선택하면,
 *   인증 관련 버그(Provider 누락, 트리 범위 문제)를 배포 전에 빠르게 발견
 *
 * 주의:
 * - 이 훅은 "인증/인가 판단"을 수행하지 않음
 * - 라우터 접근 제어는 RequireAuth(가드) 또는 서버 응답 정책으로 처리
 */
export function useAuth(): AuthState {
    const ctx = useContext(AuthContext)

    if (ctx === undefined) {
        throw new Error("useAuth must be used within <AuthProvider>")
    }

    return ctx
}