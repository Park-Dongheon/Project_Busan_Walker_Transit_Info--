// src/domains/attraction/types/index.ts

/**
 * index.ts (Domain Types - attraction 도메인 타입 진입점)
 *
 * 역할/목적:
 * - attraction 도메인의 모든 공개 타입을 단일 경로로 노출
 * - 하위 타입 파일(intro.ts 등)을 re-export하여 외부 소비자가 경로를 몰라도 됨
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · TransitModeCode       - 교통수단 코드 타입 (string 별칭)
 *      · DistanceSource        - 거리 산출 방식 코드 ('GEO' | 'RAW')
 *      · AttractionCard        - 목록/캐러셀용 공용 카드 계약
 *      · AttractionListCard    - 지도 목록용 카드(좌표 non-null 강제)
 *      · AttractionDetail      - 상세 화면용 응답 계약
 *      · TransitOption         - 접근 수단/시설 옵션 단위 타입
 *      · (intro.ts 전체 re-export)
 *
 * 운영 포인트:
 * - 새로운 attraction 하위 타입 파일이 생기면 이 파일에 export * from 추가
 */

import type { Nullable } from "@/shared/types";

/**
 * TransitModeCode
 *
 * 역할/목적
 * - 교통수단을 식별하는 코드 타입(예: 버스/지하철/도보 등)을 표현
 *
 * 정책:
 * - 현재는 백엔드가 내려주는 modeCode의 실제 포맷이 문자열이므로 string으로 정의
 * - 코드 값의 열거(Union)로 좁히는 것은 "마스터 테이블/정책"이 고정될 때 유효하며,
 *   이 파일은 "API 계약 타입"에 초점을 두어 확장 가능한 string을 유지
 */
export type TransitModeCode = string

/**
 * DistanceSource
 *
 * 역할/목적:
 * - 접근 거리(distanceM)의 산출 방식을 나타내는 코드 타입
 *
 * 정책:
 * - DB ENUM('GEO', 'RAW') 및 백엔드 TransitOptionDto.distanceSource와 1:1 대응
 *   GEO: 관광지 좌표 + 시설 좌표 기반 ST_Distance_Sphere() 계산값
 *   RAW: CSV 원본 DSTNC_VALUE(m) 사용값
 */
export type DistanceSource = 'GEO' | 'RAW'

/**
 * AttractionCard
 *
 * 역할/목적:
 * - 관광지 카드 UI(목록/즐겨찾기 등)에서 재사용되는 "공용 카드 계약(Contract)"
 * - 백엔드 AttractionCardResponse 필드와 1:1로 매칭되는 것을 전제
 *
 * 데이터 성격:
 * - 목록 UI는 많은 항목을 반복 렌더링하므로, "상세 전용 무거운 필드"를 제외한 최소 집합
 * - 접근성/지도 UX를 위해 좌표(lat/lon), 통계(reviewCount/avgRating),
 *   그리고 "가장 가까운 접근 수단" 요약(nearest*)을 포함
 *
 * Nullable 정책:
 * - Nullable<T>는 "응답 스키마상 값이 없을 수 있음"을 의미
 * - UI에서는 Nullable 필드에 대해 null-safe 렌더링이 필요 (예: 값이 없으면 숨김/대체 문구/디폴트 값)
 *
 * 주의:
 * - nearestDistanceM/Km, nearestWalkMin 같은 파생(계산) 필드는
 *   백엔드 계산/저장 정책에 종속되므로, 단위(m/km/min)를 주석/필드명으로 명확히 유지
 */
export interface AttractionCard {
    keyId: string
    placeName: string
    address: Nullable<string>
    imageUrl: Nullable<string>

    /**
     * 좌표
     * - 일부 응답(즐겨찾기 등)에서는 좌표가 null일 수 있음을 전제로 Nullable로 둠
     * - 지도 기반 화면에서는 좌표가 필수이므로 별도의 파생 타입(AttractionListCard)에서 non-null로 강제
     */
    latitude: Nullable<number>
    longitude: Nullable<number>

    /* 리뷰 수(집계 값) - 목록 정렬/표시에 사용될 수 있으므로 non-null 정수로 유지 */
    reviewCount: number

    /* 평균 평점(집계 값) - 리뷰가 없으면 null일 수 있으므로 Nullable */
    avgRating: Nullable<number>

    /* 접근 옵션 총 개수(집계/요약) - 데이터가 없으면 null일 수 있음 */
    totalAccess: Nullable<number>

    /**
     * nearest*
     * - "가장 가까운 접근 수단" 요약 정보
     * - 목록 카드에서 '최단 접근' 정보를 빠르게 보여주기 위한 필드
     *
     * 단위 정책:
     * - nearestDistanceM : 미터(m)
     * - nearestDistanceKm: 킬로미터(km)
     * - nearestWalkMin   : 도보 시간(분)
     */
    nearestModeCode: Nullable<TransitModeCode>
    nearestModeName: Nullable<string>
    nearestDistanceM: Nullable<number>
    nearestDistanceKm: Nullable<number>
    nearestWalkMin: Nullable<number>
}

/**
 * AttractionListCard
 *
 * 역할/목적:
 * - "/attractions" 목록(특히 지도 표시/영역 필터링 등)에서 사용하는 카드 계약
 *
 * 정책:
 * - 목록 조회 Repository/쿼리 레벨에서 latitude/longitude IS NOT NULL이 보장된다는 전제 하에
 *   좌표를 non-null로 "강제"
 *
 * 포인트:
 * - AttractionCard를 확장하되, 특정 필드만 더 강하게(Nullable → non-null) 선언하여 화면 로직에서 불필요한 null 체크 감소
 */
export interface AttractionListCard extends AttractionCard {
    latitude: number
    longitude: number
}

/**
 * AttractionDetail
 *
 * 역할/목적:
 * - 관광지 상세 화면에서 사용하는 응답 계약
 *
 * 구성 정책:
 * - 기본 정보(명칭/주소/카테고리/스토리/키워드) + 접근 옵션 목록(transitOptions)으로 구성
 * - 목록 카드와 달리 상세 화면은 "연관 데이터(접근 옵션)"까지 포함하므로 payload가 더 큼
 *
 * Nullable 정책:
 * - 상세에도 주소/스토리/키워드/좌표 등이 null일 수 있어 Nullable로 유지
 * - 상세 화면은 각 섹션을 조건부 렌더링하여 "정보 없음" 상태를 자연스럽게 처리
 */
export interface AttractionDetail {
    keyId: string
    placeName: string
    address: Nullable<string>
    imageUrl: Nullable<string>
    latitude: Nullable<number>
    longitude: Nullable<number>
    categoryName: Nullable<string>
    storyTitle: Nullable<string>
    storySummary: Nullable<string>
    storyUrl: Nullable<string>
    coreKeywords: Nullable<string>

    /**
     * transitOptions
     * - 접근 수단(정류장/시설) 후보 목록
     * - 지도/거리/도보 시간 표시 등 상세 화면의 핵심 데이터
     */
    transitOptions: TransitOption[]
}

/**
 * TransitOption
 *
 * 역할/목적:
 * - 관광지 상세에서 "접근 시설/정류장" 단위의 옵션을 표현
 *
 * 구성/정책:
 * - accessNo: 접근 옵션 row 식별자(BIGINT 원본을 문자열로 전달)
 * - modeCode/modeName: 교통수단 식별(코드/표시명)
 * - transitClassName: 원천 데이터의 대중교통 구분(pbtrnsp_cl_nm)
 * - facility*: 실제 접근 지점(정류장/시설) 정보
 * - distanceKm/distanceM/rawDistanceM + walkMin: 관광지로부터의 접근 거리/시간(단위 명시)
 * - distanceSource: 거리 산출 기준(GEO/RAW)
 *
 * Nullable 정책:
 * - 공공데이터/원천 데이터 특성상 시설명/정류장번호/좌표 등이 누락될 수 있어 Nullable로 둠
 *
 * 단위 정책:
 * - distanceKm: 킬로미터(km)
 * - walkMin   : 도보 시간(분)
 */
export interface TransitOption {
    accessNo: Nullable<string>
    modeCode: TransitModeCode
    modeName: string
    transitClassName: Nullable<string>
    facilityName: Nullable<string>
    busStopNo: Nullable<string>
    entranceName: Nullable<string>
    facilityAddress: Nullable<string>
    distanceKm: Nullable<number>
    distanceM: Nullable<number>
    rawDistanceM: Nullable<number>
    distanceSource: Nullable<DistanceSource>
    facilityLat: Nullable<number>
    facilityLon: Nullable<number>
    facilityHasCoord: Nullable<boolean>
    walkMin: Nullable<number>
}

export * from './intro'