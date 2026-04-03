// src/main.tsx

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// 전역 스타일 진입점: Tailwind 디렉티브, CSS 리셋, 프로젝트 공통 유틸 클래스 로딩
import "@/shared/styles/index.css";

// Providers: Router, QueryClientProvider, Toaster 등 전역 컨텍스트를 한 곳에서 구성
import Providers from "@/app/providers/providers";

/**
 * main.tsx (애플리케이션 엔트리 포인트 / 부트스트랩)
 *
 * 역할/목적:
 * - 브라우저 DOM의 #root 엘리먼트에 React 루트를 생성하고 전체 앱을 최초 1회 마운트
 * - 전역 Provider(라우터, 서버 상태, 테마 등)를 최상위에서 구성하여
 *   하위 어디서든 해당 컨텍스트를 사용 가능
 *
 * 공개 정책 / 설계 원칙:
 * - 이 파일은 마운트만 담당하며 UI 로직을 포함 x
 * - 전역 스타일 진입점(index.css) import가 여기서 단 한 번만 이루어짐
 * - 전역 컨텍스트 추가·변경은 이 파일이 아닌 Providers 파일에서 수행
 *
 * 동작 방식:
 * - createRoot()로 React 18 Concurrent 렌더링 루트를 생성
 * - StrictMode로 개발 환경에서 잠재 문제를 조기에 감지
 * - Providers가 라우터·QueryClient·Toaster 등 전역 의존성을 모두 포함
 *
 * 운영 포인트:
 * - StrictMode는 개발 환경에서 effect를 2회 실행하는 것처럼 보임(의도된 동작).
 * - 전역 컨텍스트를 추가할 경우 이 파일이 아닌 providers.tsx를 수정
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers />
  </StrictMode>
)
