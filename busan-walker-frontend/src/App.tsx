// src/App.tsx

import { Outlet } from "react-router-dom"
import { SiteBackground } from "@/shared/ui/layout/SiteBackground"
import { SiteHeader } from "@/shared/ui/layout/SiteHeader"
import { SiteFooter } from "@/shared/ui/layout/SiteFooter"

/**
 * App (공통 레이아웃 쉘)
 *
 * 역할/목적:
 * - 배경, 헤더, 푸터처럼 모든 화면에서 반복되는 UI를 한 곳에서 조합
 * - 실제 페이지 콘텐츠는 React Router의 Outlet 위치에 라우트별로 주입
 *
 * 공개 정책 / 설계 원칙:
 * - 공통 UI는 App이 소유하고, 개별 라우트 컴포넌트는 본문 콘텐츠만 책임
 * - 최상위 컨테이너를 column flex로 고정해 헤더 → 본문 → 푸터 구조를 균일하게 유지
 *
 * 동작 방식:
 * - SiteBackground(fixed 레이어) → SiteHeader → main(Outlet) → SiteFooter 순으로 수직 배치
 * - Outlet은 현재 활성 라우트의 페이지 컴포넌트가 렌더링되는 슬롯
 *
 * 운영 포인트:
 * - min-h-dvh + main의 flex-1 조합으로 콘텐츠가 짧아도 푸터가 항상 하단에 배치
 * - SiteBackground는 fixed 레이어이므로, 본문 가시성 문제 발생 시 z-index 정책을 함께 확인
 */
export default function App() {
  return (
    <div className="min-h-dvh flex flex-col text-white">
      <SiteBackground />
      <SiteHeader />

      {/* 헤더/푸터를 제외한 나머지 공간을 본문이 차지해 푸터 하단 고정을 보장 */}
      <main className="flex-1 px-4 py-8 text-white">
        {/* 현재 라우트의 페이지 컴포넌트가 렌더링되는 슬롯 */}
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  )
}
