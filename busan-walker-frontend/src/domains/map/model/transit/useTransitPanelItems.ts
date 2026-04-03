// src/domains/map/model/transit/useTransitPanelItems.ts

import { useMemo } from "react"

import {buildTransitOptionItems, type ResolvedTransitOption} from "../../lib";
import type { TransitOptionPanelItem } from "../../types";

/**
 * useTransitPanelItems.ts
 * 
 * 역할/목적:
 * - 교통 옵션 목록을 패널 UI 전용 아이템 목록으로 변환하는 모델 훅
 * - 상세 화면 또는 사이드 패널에서 바로 렌더링할 수 있는 형태의 데이터 집합을 제공
 * - 교통 옵션 표시 규칙과 노출 개수 제한 정책을 컴포넌트 밖으로 분리
 * 
 * 주요 책임:
 * - ResolvedTransitOption 목록을 패널 표시용 모델로 변환
 * - visibleLimit 정책을 적용하여 노출 개수 상한을 제어
 * - 동일 입력에 대해 불필요한 재계산이 일어나지 않도록 메모이제이션 수행
 * 
 * 동작 방식:
 * 1) 외부에서 교통 옵션 목록과 최대 노출 개수를 전달 받음
 * 2) buildTransitOptionItems()에 변환 책임을 위임
 * 3) 반환 결과는 패널에서 바로 사용할 수 있는 TransitOptionPanelItem 배열
 * 4) transitOptions 또는 visibleLimit이 바뀔 때만 계산을 다시 수행
 * 
 * 설계 정책:
 * - 이 훅은 상태를 보관하지 않는 순수 파생 모델 훅
 * - 실제 변환 규칙을 lib 계층(buildTransitOptionItems)에 위임하고,
 *   훅은 React 렌더링 관점의 메모이제이션만 담당
 * - 기본 노출 개수는 DEFAULT_VISIBLE_LIMIT 상수로 관리하여 호출부마다 매직 넘버를 반복하지 않도록 함
 * 
 * 포인트:
 * - 컴포넌트는 "어떻게 패널 아이템을 만들지"보다 "어떤 아이템을 렌더링할지"에만 집중 가능
 * - 패널 표시 정책이 바뀌어도 호출부 전체가 아니라
 *   이 훅과 buildTransitOptionItems() 중심으로 수정 범위를 좁힐 수 있음
 * 
 * 주의:
 * - 이 훅은 단순 목록 변환 훅이므로 정렬, 필터링, 표시 문구 생성 규칙이 복잡해질수록
 *   훅 내부에 로직을 늘리기보다 buildTransitOptionItems()에 위임하는 구조를 유지하는 것이 좋음
 * - transitOptions 배열 참조가 매 렌더마다 새로 만들어지면 useMemo 이점이 줄어들 수 있음
 */

const DEFAULT_VISIBLE_LIMIT = 6

/**
 * 교통 옵션 목록을 패널 표시용 아이템 배열로 변환
 * 
 * 반환 의미:
 * - 패널 UI가 직접 소비할 수 있는 TransitOptionPanelItem 배열
 * 
 * 입력 정책:
 * - visibleLimit이 생략되면 기본 노출 개수(DEFAULT_VISIBLE_LIMIT)를 사용
 */
export function useTransitPanelItems(args: {
    transitOptions: ResolvedTransitOption[]
    visibleLimit?: number
}): TransitOptionPanelItem[] {
    const {transitOptions, visibleLimit = DEFAULT_VISIBLE_LIMIT} = args

    return useMemo(
        () => buildTransitOptionItems(transitOptions, visibleLimit),
        [transitOptions, visibleLimit]
    )
}