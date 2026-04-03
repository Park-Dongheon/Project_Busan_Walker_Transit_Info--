// src/domains/map/model/selection/useSelectedBboxState.ts

/**
 * useSelectedBboxState.ts (선택 상태 - 핀 기준 BBox 상태 및 URL 스냅샷 관리 훅)
 *
 * 역할/목적:
 * - 지도 화면에서 선택된 핀의 BBox 상태를 관리하는 모델 훅
 * - 현재 화면 BBox를 문자열 파라미터로 유지하고, 필요 시 URL 쿼리 파라미터와 동기화
 * - 선택된 핀 기준으로 저장된 BBox 스냅샷을 복원하거나 제거하는 규칙을 한 곳에서 관리
 *
 * 데이터 흐름:
 *   URL query (SELECTED_PIN_QUERY_KEY, SELECTED_BBOX_QUERY_KEY)
 *      ↓  초기 렌더
 *   bboxParam (초기값 복원)
 *      ↓  handleSetBbox()
 *   bboxParam 갱신 + URL syncSelectedBboxSnapshotParam()
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · useSelectedBboxState  - 선택 핀 기준 BBox 상태와 URL 스냅샷을 관리하는 훅
 * - URL 변경은 항상 replace 방식으로 반영하여 히스토리 오염을 방지
 * - 선택된 핀이 없는 상태에서는 BBox 스냅샷을 유지하지 않음
 * - searchParams는 외부 상태이므로 searchParamsRef로 최신 값을 참조
 *
 * 동작 방식:
 * - 초기 렌더 시 URL 쿼리에서 selectedPin과 selectedBbox를 읽음
 * - 선택된 핀이 있을 때만 selectedBbox를 초기 bboxParam으로 복원
 * - handleSetBbox() 호출 시 전달된 BBox의 유효성을 먼저 검사
 * - 선택된 핀이 있으면 저장된 스냅샷 BBox를 우선 복원하고,
 *   없으면 현재 BBox를 상태로 반영
 * - 선택된 핀이 활성 상태라면 현재 BBox를 URL 스냅샷으로도 동기화
 * - 선택된 핀이 해제되면 URL에 남아 있는 selectedBbox 스냅샷을 정리
 *
 * 운영 포인트:
 * - BBox 문자열 직렬화 규칙이 바뀌면 초기화 / 비교 / URL 동기화 흐름 전체에 영향
 * - selectedPinIdRef.current와 URL 쿼리의 selectedPin 값이 함께 사용되므로
 *   선택 상태의 단일 진입점이 어디인지 호출부에서 명확히 관리
 * - 이 훅은 선택 핀 기반 BBox 복원 규칙을 전제로 하므로,
 *   단순 지도 viewport 상태 훅으로 사용하면 의도와 맞지 않을 수 있음
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { bboxToParam, isValidBBox, parseBBoxParam } from "../../lib";
import type { BBox, SetSearchParamsFn } from "../../types";
import {
    normalizeSelectedPinId,
    SELECTED_BBOX_QUERY_KEY,
    SELECTED_PIN_QUERY_KEY
} from "./selectionQueryParams";

/**
 * 선택된 핀 기준의 BBox 상태와 URL 스냅샷을 관리
 *
 * - bboxParam: 현재 적용 중인 BBox 문자열
 * - resetBboxParam: 로컬 BBox 상태 초기화
 * - handleSetBbox: 새 BBox 반영 및 선택 핀 기준 스냅샷 처리
 * - clearSelectedBboxSnapshot: 선택 핀용 BBox 스냅샷 제거
 */
export function useSelectedBboxState(args: {
    searchParams: URLSearchParams
    selectedPinIdRef: RefObject<string | null>
    setSearchParams: SetSearchParamsFn
}): {
    bboxParam: string
    resetBboxParam: () => void
    handleSetBbox: (nextBbox: BBox) => void
    clearSelectedBboxSnapshot: () => void
} {
    const { searchParams, selectedPinIdRef, setSearchParams } = args

    const [bboxParam, setBboxParam] = useState<string>(() => {
        const selectedPinIdInQuery = normalizeSelectedPinId(searchParams.get(SELECTED_PIN_QUERY_KEY))
        if (!selectedPinIdInQuery) return ""

        const parsed = parseBBoxParam(searchParams.get(SELECTED_BBOX_QUERY_KEY))

        return parsed ? bboxToParam(parsed) : ""
    })

    const searchParamsRef = useRef<URLSearchParams>(searchParams)
    const selectedBboxAppliedPinIdRef = useRef<string | null>(null)

    useEffect(() => {
        searchParamsRef.current = searchParams
    }, [searchParams])

    /**
     * 현재 로컬 BBox 문자열 상태를 초기화
     *
     * - URL 스냅샷은 제거하지 않고 로컬 상태만 비움
     */
    const resetBboxParam = useCallback(() => {
        setBboxParam("")
    }, [])

    /**
     * URL 쿼리에 저장된 선택 핀용 BBox 스냅샷을 문자열로 읽음
     *
     * - 유효한 BBox 파라미터면 직렬화 문자열 반환
     * - 없거나 파싱 실패 시 null 반환
     */
    const readSelectedBboxSnapshotParam = useCallback((): string | null => {
        const parsed = parseBBoxParam(searchParamsRef.current.get(SELECTED_BBOX_QUERY_KEY))

        return parsed ? bboxToParam(parsed) : null
    }, [])

    /**
     * 선택 핀용 BBox 스냅샷을 URL 쿼리와 동기화
     *
     * - 값이 있으면 selectedBbox 파라미터 설정
     * - 값이 없으면 selectedBbox 파라미터 제거
     * - 변경 사항이 없으면 setSearchParams 호출 생략
     */
    const syncSelectedBboxSnapshotParam = useCallback(
        (nextBboxParam: string | null) => {
            const currentParams = searchParamsRef.current
            const nextParams = new URLSearchParams(currentParams)

            if (nextBboxParam && nextBboxParam.length > 0) {
                nextParams.set(SELECTED_BBOX_QUERY_KEY, nextBboxParam)
            } else {
                nextParams.delete(SELECTED_BBOX_QUERY_KEY)
            }

            if (currentParams.toString() === nextParams.toString()) return

            searchParamsRef.current = nextParams
            setSearchParams(nextParams, { replace: true })
        },
        [setSearchParams]
    )

    /**
     * 선택 핀 기준으로 저장된 BBox 스냅샷을 제거
     *
     * - 내부 중복 적용 추적 ref 초기화
     * - URL 쿼리의 selectedBbox 파라미터 제거
     */
    const clearSelectedBboxSnapshot = useCallback(() => {
        selectedBboxAppliedPinIdRef.current = null
        syncSelectedBboxSnapshotParam(null)
    }, [syncSelectedBboxSnapshotParam])

    /**
     * 새 BBox를 반영
     *
     * - 유효하지 않은 BBox는 무시
     * - 선택된 핀이 있고 URL 스냅샷이 존재하면 스냅샷을 우선 복원
     * - 같은 핀에 이미 스냅샷을 적용했다면 중복 반영하지 않음
     * - 선택된 핀이 있으면 현재 BBox를 URL에도 저장
     * - 선택된 핀이 없으면 남아 있는 스냅샷을 제거
     */
    const handleSetBbox = useCallback(
        (nextBbox: BBox) => {
            if (!isValidBBox(nextBbox)) return

            const selectedPinIdInQuery = normalizeSelectedPinId(
                searchParamsRef.current.get(SELECTED_PIN_QUERY_KEY)
            )
            const activeSelectedPinId = selectedPinIdRef.current ?? selectedPinIdInQuery
            const snapshotBboxParam = readSelectedBboxSnapshotParam()

            if (!activeSelectedPinId) {
                if (snapshotBboxParam) {
                    clearSelectedBboxSnapshot()
                }
            } else {
                if (snapshotBboxParam) {
                    selectedBboxAppliedPinIdRef.current = activeSelectedPinId
                    setBboxParam((prev) => (prev === snapshotBboxParam ? prev : snapshotBboxParam))
                    return
                }

                if (selectedBboxAppliedPinIdRef.current === activeSelectedPinId) {
                    return
                }

                selectedBboxAppliedPinIdRef.current = activeSelectedPinId
            }

            const nextParam = bboxToParam(nextBbox)
            setBboxParam((prev) => (prev === nextParam ? prev : nextParam))

            if (activeSelectedPinId) {
                syncSelectedBboxSnapshotParam(nextParam)
            }
        },
        [clearSelectedBboxSnapshot, readSelectedBboxSnapshotParam, selectedPinIdRef, syncSelectedBboxSnapshotParam]
    )

    /**
     * 선택된 핀이 해제되면 URL에 저장된 선택 BBox 스냅샷을 정리
     *
     * - 이전 선택 상태의 잔존 파라미터가 다음 흐름에 영향을 주지 않도록 보장
     */
    useEffect(() => {
        const selectedPinIdInQuery = normalizeSelectedPinId(searchParamsRef.current.get(SELECTED_PIN_QUERY_KEY))
        if (selectedPinIdInQuery) return

        clearSelectedBboxSnapshot()
    }, [clearSelectedBboxSnapshot, searchParams])

    return {bboxParam, resetBboxParam, handleSetBbox,clearSelectedBboxSnapshot}
}