// src/shared/ui/layout/SiteFooter.tsx

/**
 * SiteFooter.tsx (Shared UI Layout - 전역 사이트 하단 푸터 컴포넌트)
 *
 * 역할/목적:
 * - 전역 레이아웃의 하단 푸터로, 서비스 정체성/바로가기 메뉴/법적·운영 안내 문구를 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · SiteFooter  - 전역 푸터 컴포넌트
 * - 네비게이션 링크는 ROUTES 상수를 단일 소스(SSOT)로 사용 — 경로 변경 시 한 곳만 수정
 * - 인증 상태(isAuthenticated)에 따라 메뉴를 분기하되,
 *   보안은 서버/라우터 가드에서 최종 강제(UI 숨김은 UX 정책일 뿐)
 *
 * 동작 방식:
 * - authModel.useAuth()로 인증 상태를 구독하고, user 존재 여부로 로그인 여부 판정
 * - Copyright 연도는 런타임에서 new Date().getFullYear()로 계산하여 매년 수동 수정 불필요
 *
 * 운영 포인트:
 * - 메뉴 구성 변경 시 ROUTES와 인증 정책(메뉴 노출 조건)을 함께 확인
 * - aria-label로 푸터 메뉴 영역을 명시하여 스크린리더의 구조 이해를 지원
 */

import { Link } from "react-router-dom"
import { ROUTES } from "@/app/navigation/navigation"
import { model as authModel } from "@/domains/auth"

/**
 * SiteFooter
 *
 * 역할/목적:
 * - 전역 레이아웃의 하단 푸터로, 서비스 정체성/바로가기 메뉴/법적·운영 안내 문구를 제공
 *
 * 라우팅 정책:
 * - 푸터의 내비게이션 링크는 라우팅 상수(ROUTES)를 "단일 소스(SSOT)"로 사용
 *   → 헤더/사이드바/푸터 등 여러 위치에서 동일 경로를 재사용해도 불일치(오타/변경 누락)를 줄임
 *
 * 인증 기반 노출 정책(Authorization by UI)
 * - 로그인 상태(isAuthenticated)에 따라 노출 메뉴를 분기
 *   - 로그인 상태: 즐겨찾기, 내 정보 노출
 *   - 비로그인 상태: 로그인, 회원가입 노출
 * - 주의: UI에서 숨기는 것은 UX 정책일 뿐, 보안은 반드시 서버/라우터 가드에서 최종 강제되어야 함
 *
 * 접근성 포인트:
 * - aria-label 로 푸터 메뉴 영역을 명시하여 스크린리더가 구조를 이해하기 쉽게 함
 *
 * 유지보수 포인트:
 * - 연도 표기는 런타임에서 현재 연도를 계산하여 매년 수동 수정이 필요 없도록 함
 * - 메뉴 구성 변경은 ROUTES와 인증 정책(메뉴 노출 조건)을 함께 확인
 */
export function SiteFooter() {
    /**
     * 현재 연도
     * - Copyright 문구의 수동 수정 방지
     */
    const year: number = new Date().getFullYear()

    /**
     * 인증 상태 조회
     * - authModel.useAuth()에서 제공하는 user 존재 여부로 로그인 상태를 판정
     * - user의 구체 스키마에 의존하지 않고 Boolean(user)로 "존재성"만 사용하여 결합도를 낮춤
     */
    const { user } = authModel.useAuth()
    const isAuthenticated: boolean = Boolean(user)

    return (

        <footer className="border-t border-white/10 bg-black/20">
            <div className="mx-auto max-w-7xl px-4 py-8">
                <section className="grid gap-6 md:grid-cols-3">
                    <div>
                        <div className="text-base font-black text-white">Busan Hiker</div>
                        <p className="mt-2 text-xs leading-relaxed text-white/70">
                            부산 도보 여행자를 위한 대중교통 접근 안내 서비스
                        </p>
                    </div>

                    <div>
                        <div className="text-sm font-bold text-white">바로가기</div>
                        <nav className="mt-3 flex flex-col gap-2 text-sm" aria-label="푸터 메뉴">
                            <Link to={ROUTES.home} className="text-white/85 hover:text-white">
                                홈
                            </Link>
                            <Link to={ROUTES.attractions} className="text-white/85 hover:text-white">
                                관광지 소개
                            </Link>
                            <Link to={ROUTES.map} className="text-white/85 hover:text-white">
                                대중교통 지도
                            </Link>

                            {isAuthenticated ? (
                                <Link to={ROUTES.favorites} className="text-white/85 hover:text-white">
                                    즐겨찾기
                                </Link>
                            ) : null}

                            {isAuthenticated ? (
                                <Link to={ROUTES.myAccount} className="text-white/85 hover:text-white">
                                    내 정보
                                </Link>
                            ) : null}

                            {!isAuthenticated ? (
                                <Link to={ROUTES.login} className="text-white/85 hover:text-white">
                                    로그인
                                </Link>
                            ) : null}

                            {!isAuthenticated ? (
                                <Link to={ROUTES.register} className="text-white/85 hover:text-white">
                                    회원가입
                                </Link>
                            ) : null}
                        </nav>
                    </div>

                    <div>
                        <div className="text-sm font-bold text-white">안내</div>
                        <div className="mt-3 text-xs leading-relaxed text-white/60">
                            <p>본 서비스는 학습/포트폴리오 목적으로 제작된 데모입니다.</p>
                            <p>데이터의 정확성 및 최신성은 보장되지 않을 수 있습니다.</p>
                        </div>
                    </div>
                </section>
            </div>

            <div className="border-t border-white/10">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-white/70 md:flex-row md:items-center md:justify-between">
                    <p>© {year} Busan Hiker Transit Guide. All rights reserved.</p>
                    <p>부산대 산학협력단 K-Digital Training 7기 미니프로젝트 팀 결과물</p>
                </div>
            </div>
        </footer>
    )
}
