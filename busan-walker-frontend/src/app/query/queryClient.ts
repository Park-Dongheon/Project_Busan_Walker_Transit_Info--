// src/app/query/queryClient.ts

import { QueryClient } from "@tanstack/react-query";

/**
 * React Query 전역 QueryClient (SSOT)
 * 
 * 책임:
 * - 서버 상태 캐시(쿼리 결과), 요청 중복 제거, 리트라이/리패치 같은 동작 정책을
 *   앱 전역에서 일관되게 적용하는 "캐시 컨테이너"를 제공
 * 
 * 목적:
 * - 화면 컴포넌트가 데이터 패칭 세부 구현을 몰라도,
 *   useQuery/useMutation이 동일한 캐시/동작 규칙을 따르게 함
 * 
 * 동작 포인트:
 * - QueryClient는 캐시를 메모리에 유지하며, 동일 queryKey 요청을 재사용
 * - Provider(QueryClientProvider)에 주입된 인스턴스 1개가 앱 전체에서 공유
 * 
 * 주의:
 * - QueryClient를 컴포넌트 렌더링 중에 생성하면, 렌더마다 인스턴스가 새로 만들어져
 *   캐시가 초기화되고 리패치/깜빡임/중복  호출 같은 문제가 발생
 * - 따라서 모듈 스코프에서 1회 생성한 인스턴스를 export하여 싱글턴으로 사용
 */
export const queryClient = new QueryClient()