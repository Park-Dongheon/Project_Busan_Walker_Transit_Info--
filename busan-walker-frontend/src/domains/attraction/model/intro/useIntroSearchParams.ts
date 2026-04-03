// src/domains/intro/model/useIntroSearchParams.ts

/**
 * useIntroSearchParams.ts (Model Layer - 소개 페이지 URL 검색 파라미터 상태 관리)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지의 URLSearchParams를 단일 진실 공급원(SSOT)으로 사용하여
 *   page/size/keyword 상태를 항상 "정규화된 형태"로 유지
 * - URL 기반 상태 관리로 공유 링크 안정성, 페이지네이션 UX 예측 가능성,
 *   API 요청 파라미터/캐시 키의 일관성 보장
 *
 * 데이터 흐름:
 *   URLSearchParams (브라우저 URL)
 *      ↓  normalizeIntroPage() / normalizeIntroKeyword()
 *   IntroSearchParamsState (정규화된 상태)
 *      ↓  setPage() / setKeyword() / clearKeyword()
 *   URLSearchParams 갱신 (히스토리 반영)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · IntroSearchParamsState  - 소개 페이지 URL 파라미터 상태 계약(타입)
 *      · useIntroSearchParams    - URL 기반 소개 페이지 파라미터 상태 훅
 *
 * 동작 방식:
 * - 마운트 시 URL이 비정상 값이면 canonicalization effect가 replace=true로 조용히 복원
 * - 사용자 액션(setPage/setKeyword)은 히스토리에 기록 (탐색성 우선)
 * - size는 소개 페이지 정책상 ATTRACTIONS_PAGE_SIZE로 항상 고정
 *
 * 운영 포인트:
 * - ATTRACTIONS_PAGE_SIZE(앱 전역 상수)가 변경되면 소개 페이지 페이지네이션 동작이 함께 변경됨 (연동 필요)
 * - page 범위(INTRO_PAGE_MAX)는 백엔드 PageParam(int) 계약과 맞춰 유지
 */

import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ATTRACTIONS_PAGE_SIZE } from "@/app/navigation/navigation";

export type IntroSearchParamsState = {
    /**
     * page:
     * - 0-based 페이지 인덱스
     * - URL의 `page` 쿼리 파라미터를 단일 진실 공급원(SSOT)으로 사용
     */
    page: number

    /**
     * size:
     * - 페이지당 항목 수
     * - 소개 페이지 정책상 "항상 고정값"을 사용(사용자가 URL로 임의 변경해도 정규화로 복원)
     */
    size: number

    /**
     * keyword:
     * - 검색 키워드(트림된 문자열)
     * - 공백만 존재하면 빈 문자열("")로 통일하여 "검색 조건 없음" 상태를 일관되게 표현
     */
    keyword: string

    /**
     * setPage:
     * - URL의 page 값을 갱신
     * - 사용자 액션(페이지 이동)으로 발생한 변경은 히스토리에 남겨 탐색성을 유지
     */
    setPage: (nextPage: number) => void

    /**
     * setKeyword:
     * - URL의 keyword 값을 갱신
     * - 검색 조건이 바뀌면 결과를 첫 페이지부터 보여주는 UX 정책을 적용(page=0)
     */
    setKeyword: (nextKeyword: string) => void

    /**
     * clearKeyword:
     * - keyword를 제거하여 "검색 조건 없음" 상태로 만듦
     * - URL에서는 keyword 파라미터 자체를 제거(delete)하는 정책을 따름
     */
    clearKeyword: () => void
}

const INTRO_PAGE_MIN = 0
const INTRO_PAGE_MAX = 2_147_483_647

/**
 * normalizeIntroPage
 *
 * - URL/입력에서 들어온 page 값을 백엔드 PageParam(int) 계약 범위로 정규화
 * - 숫자로 해석 불가(NaN/Infinity 등)면 최솟값(0)으로 보정
 * - 소수는 내림(floor)하여 페이지 인덱스가 정수로 유지됨
 * - 음수는 0으로 올리고, int 범위를 넘는 값은 int 최댓값으로 클램프
 * - URL은 외부 입력이므로(공유 링크/수동 수정) 항상 비정상 값이 들어올 수 있음
 * - "정규화된 URL 유지"는 예측 가능한 캐시 키/페이지네이션 동작에 직접 영향
 */
function normalizeIntroPage(value: number | string | null): number {
    const raw = Number(value)
    if (!Number.isFinite(raw)) return INTRO_PAGE_MIN

    const floored = Math.floor(raw)
    if (floored < INTRO_PAGE_MIN) return INTRO_PAGE_MIN
    if (floored > INTRO_PAGE_MAX) return INTRO_PAGE_MAX

    return floored
}

/**
 * normalizeIntroKeyword
 *
 * - keyword 파라미터를 트림하여 공백-only 입력을 빈 문자열로 통일
 * - null/undefined는 ""로 취급
 * - 화면에서는 ""를 "검색 조건 없음"으로 해석
 * - keyword를 ""로 통일하면, UI/쿼리 훅에서 조건 분기와 캐시 키가 단순해짐 (단순화)
 */
function normalizeIntroKeyword(value: string | null): string {
    return (value ?? "").trim()
}

/**
 * useIntroSearchParams
 *
 * - 소개 페이지의 URLSearchParams를 상태의 단일 진실 공급원으로 사용
 * - page/size/keyword를 "항상 정규화된 형태"로 유지하여,
 *   (1) 공유 URL의 안정성, (2) 페이지네이션/검색 UX의 예측 가능성,
 *   (3) API 요청 파라미터/캐시 키의 일관성 보장
 * - 다루는 파라미터:
 *   - page: 0-based 페이지
 *   - size: 소개 페이지 정책상 고정값(ATTRACTIONS_PAGE_SIZE)
 *   - keyword: trim된 문자열(빈 문자열이면 URL에서 제거)
 * - URL 정규화(canonicalization) 정책:
 *   - 현재 URL이 비정상 값이더라도, 마운트 후 effect에서 "정규화된 canonical URL"로 조용히 복원
 *   - 이때 replace=true를 사용해 "비정상 URL → 정상 URL" 보정이 브라우저 히스토리를 오염시키지 않음
 * - URLSearchParams는 외부 입력이므로 항상 방어적으로 다룸
 * - replace 보정은 초기 진입/공유 링크 안정성을 위한 것이며,
 *   사용자 액션(setPage/setKeyword)은 기본적으로 히스토리에 남기는 정책
 */
export function useIntroSearchParams(): IntroSearchParamsState {
    const [searchParams, setSearchParams] = useSearchParams()

    /**
     * state (derived from URL)
     *
     * 역할:
     * - URLSearchParams로부터 page/size/keyword를 읽어 정규화된 상태로 만듦
     *
     * 포인트:
     * - state는 URL의 "표준 해석 결과"이며, 이후 canonicalSearchParams 생성의 기준
     */
    const state = useMemo((): Pick<IntroSearchParamsState, "page" | "size" | "keyword"> => {
        const page: number = normalizeIntroPage(searchParams.get("page"))
        const size: number = ATTRACTIONS_PAGE_SIZE
        const keyword: string = normalizeIntroKeyword(searchParams.get("keyword"))

        return { page, size, keyword }
    }, [searchParams])

    /**
     * canonicalSearchParams
     *
     * 역할:
     * - 현재 URL을 "정규화 규칙을 적용한 canonical 형태"로 재구성
     *
     * 정책:
     * - page/size는 항상 존재하도록 set
     * - keyword는 빈 문자열이면 delete하여 URL을 짧고 명확하게 유지
     *
     * 포인트:
     * - canonical 형태를 만들어두면, "현재 URL이 이미 canonical인지"를 문자열 비교로 빠르게 판정 가능
     */
    const canonicalSearchParams = useMemo((): URLSearchParams => {
        const next = new URLSearchParams(searchParams)

        next.set("page", String(state.page))
        next.set("size", String(state.size))

        if (state.keyword.length === 0) next.delete("keyword")
        else next.set("keyword", state.keyword)

        return next
    }, [searchParams, state.keyword, state.page, state.size])

    /**
     * canonicalization effect
     *
     * 역할:
     * - 마운트 후 현재 URL이 canonical이 아니면 replace 업데이트로 정규화
     *
     * 정책:
     * - searchParams.toString()이 동일하면 setSearchParams를 호출하지 않아 이펙트 루프 방지
     * - replace=true로 보정하여, "초기 비정상 URL"이 뒤로가기 히스토리에 남지 않음
     */
    useEffect(() => {
        if (searchParams.toString() === canonicalSearchParams.toString()) return
        setSearchParams(canonicalSearchParams, { replace: true })
    }, [canonicalSearchParams, searchParams, setSearchParams])

    /**
     * patchParams
     *
     * 역할:
     * - URLSearchParams 갱신 로직을 한 곳으로 모아, page/keyword 갱신 시 정책을 일관되게 강제
     *
     * 정책:
     * - size는 항상 소개 페이지 정책값으로 고정(공유 URL에서 임의 조작되어도 UI 일관성 유지)
     * - 사용자 액션으로 발생하는 변경은 replace를 사용하지 않아 히스토리에 남김 (탐색성 우선)
     */
    const patchParams = useCallback(
        (mutator: (sp: URLSearchParams) => void): void => {
            const next = new URLSearchParams(searchParams)

            next.set("size", String(ATTRACTIONS_PAGE_SIZE))
            mutator(next)

            setSearchParams(next)
        }, [searchParams, setSearchParams]
    )

    /**
     * setPage
     *
     * 역할:
     * - 페이지 이동 시 page를 정규화한 뒤 URL에 반영
     *
     * 포인트:
     * - URL 기반 상태이므로, 페이지 이동은 곧 "공유 가능한 링크" 갱신을 의미
     */
    const setPage = useCallback(
        (nextPage: number): void => {
            const safe: number = normalizeIntroPage(nextPage)
            patchParams((sp) => sp.set("page", String(safe)))
        }, [patchParams]
    )

    /**
     * setKeyword
     *
     * 역할:
     * - 검색 조건(keyword) 변경을 URL에 반영
     *
     * UX 정책:
     * - 검색 조건이 바뀌면 page를 0으로 리셋(필터 변경 후 빈 페이지로 이동하는 혼란 방지)
     * - keyword가 비어 있으면 파라미터를 제거하여 "조건 없음"을 명확히 표현
     */
    const setKeyword = useCallback(
        (nextKeyword: string): void => {
            const keyword: string = nextKeyword.trim()

            patchParams((sp) => {
                /* 필터가 바뀌면 결과의 첫 페이지부터 보여주는 것이 UX상 자연스러움 */
                sp.set("page", "0")

                if (keyword.length === 0) sp.delete("keyword")
                else sp.set("keyword", keyword)
            })
        }, [patchParams]
    )

    /**
     * clearKeyword
     *
     * 역할:
     * - keyword를 비워 "검색 조건 없음" 상태로 만듦
     */
    const clearKeyword = useCallback((): void => setKeyword(""), [setKeyword])

    return { ...state, setPage, setKeyword, clearKeyword }
}