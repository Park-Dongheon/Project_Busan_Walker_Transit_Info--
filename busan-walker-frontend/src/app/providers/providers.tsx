// src/app/providers/providers.tsx

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";

import { queryClient } from "@/app/query/queryClient";
import { router } from "@/app/router/router";

/**
 * Providers (전역 인프라 조립 레이어)
 * 
 * 책임:
 * - 앱 전역에서 공유되어야 하는 "인프라 Provider"를 한 곳에서 구성
 *   (서버 상태 키시/동기화, 라우팅 컨텍스트, 전역 토스트 UI 등)
 * 
 * 목적:
 * - 각 페이지/컴포넌트가 라우팅/캐시/피드백 UI의 초기화 세부사항을 몰라도 되게 해서
 *   화면 코드를 "도메인/UX 로직"에 집중
 * 
 * 동작 포인트:
 * - QueryClientProvider: React Query 캐시/리트라이/무효화 정책을 앱 전역으로 적용
 * - RouterProvider: 라우팅 트리를 렌더링하고 navigate/Link 등 라우터 컨텍스트를 제공
 * - Toaster: 라우트 전환과 무관하게 유지되는 전역 알림 레이어로, 일관된 피드백 UX를 제공
 * 
 * 주의:
 * - QueryClient는 반드시 컴포넌트 렌더링 중에 새로 생성되면 안 됨(캐시가 매번 초기화)
 *   -> 외부 모듈(queryClient)에서 싱글턴으로 관리하는 이유가 여기
 * - 전역 토스트 라우트 내부에 두면 화면 전환 시 unmount될 수 있으므로,
 *   라우터와 독립적으로 최상단에 유지하는 것이 안전
 */
export default function Providers() {
    return (
        <QueryClientProvider client={queryClient}>
            {/* 라우팅 컨텍스트 제공: 라우팅 트리 렌더링 및 전역 네비게이션을 가능하게 함 */}
            <RouterProvider router={router} />

            {/* 전역 토스트 호스트: 라우트 전환과 상관없이 알림 레이어를 유지 */}
            <Toaster richColors />
        </QueryClientProvider>
    )
}