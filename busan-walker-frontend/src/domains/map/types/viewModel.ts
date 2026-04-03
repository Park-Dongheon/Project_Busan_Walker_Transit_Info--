// src/domains/map/types/viewModel.ts

/**
 * viewModel.ts (Map Domain - UI 렌더링용 뷰모델 타입)
 *
 * 역할/목적:
 * - map 도메인 UI 컴포넌트가 사용하는 가공된 데이터 구조를 정의
 * - 서버 응답 원시 타입(TransitOption)을 UI가 직접 소비할 수 있는
 *   뷰모델 형태로 변환하는 과정에서 필요한 중간/최종 타입을 관리
 * - UI 컴포넌트가 원시 서버 타입에 직접 의존하지 않도록
 *   도메인 내부의 타입 경계를 명확히 유지
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · MapTransitOption        - attraction 도메인 TransitOption의 map 도메인 별칭
 *      · TransitWalkApprox       - 사용자 현재 위치 기준 도보 거리/시간 추정값
 *      · TransitOptionPanelItem  - 교통 옵션 패널 UI 렌더링용 최소 필드셋
 *      · MapAttractionDetail     - 지도 마커/패널에 필요한 관광지 상세 정보 부분 타입
 *
 * 동작 방식:
 * - MapTransitOption은 attraction 도메인 타입의 map 도메인 내 재선언으로,
 *   의존 방향을 명시적으로 유지하면서 내부에서 간결하게 참조
 * - MapAttractionDetail은 AttractionDetail의 Pick으로 지도 렌더링에
 *   필요한 최소 필드만 추출하여 과도한 의존을 방지
 *
 * 운영 포인트:
 * - TransitOptionPanelItem 필드 변경은 패널 컴포넌트와 transitDerived.ts를 함께 점검
 * - MapAttractionDetail의 Pick 범위가 바뀌면 지도 마커/패널 렌더링 계층을 함께 확인
 */

import type { AttractionDetail, TransitOption } from '@/domains/attraction';

export type MapTransitOption = TransitOption

export type TransitWalkApprox = {
    distanceKm: number
    walkMin: number
}

export type TransitOptionPanelItem = {
    key: string
    option: MapTransitOption
    hasCoord: boolean
    modeLabel: string
    facilityLabel: string
    distanceLabel: string
    walkLabel: string
    myWalkApprox: TransitWalkApprox | null
}

export type MapAttractionDetail = Pick<AttractionDetail, 'keyId' | 'placeName' | 'latitude' | 'longitude'> & {
    transitOptions: MapTransitOption[]
}