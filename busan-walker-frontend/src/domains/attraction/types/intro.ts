// src/domains/attraction/types/intro.ts

/**
 * intro.ts (Domain Types - 관광지 소개 카드 모델 타입)
 *
 * 역할/목적:
 * - 소개(인트로) 페이지에서 관광지 카드 UI를 렌더링하는 데 필요한 클라이언트 측 모델 타입 정의
 * - API 응답 DTO(AttractionIntroCardResponse)와 UI 모델을 분리하여,
 *   API 계약 변경 시 UI 측 의존성 최소화
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionIntroCardModel  - 소개 카드 UI 렌더링에 사용하는 최소 데이터 모델
 *
 * 동작 방식:
 * - AttractionIntroCardModel은 소개 페이지 전용 카드 컴포넌트(AttractionIntroCard)의 props 계약으로 사용
 * - null 허용 필드는 UI에서 대체 문구/조건부 렌더링으로 처리
 *
 * 운영 포인트:
 * - 소개 카드에 새 필드가 필요하면 이 타입과 API 응답 타입(AttractionIntroCardResponse)을 함께 갱신
 */

/**
 * AttractionIntroCardModel
 *
 * 역할/목적:
 * - 소개(인트로) 페이지의 관광지 카드 UI에서 사용하는 클라이언트 측 데이터 모델
 *
 * 정책:
 * - 소개 화면에 필요한 최소 필드만 포함하여 불필요한 데이터 전달 최소화
 * - address/categoryName/story* 등 null 허용 필드는 UI에서 null-safe 처리 필요
 *
 * 포인트:
 * - API 응답 타입(AttractionIntroCardResponse)과 필드 구조가 동일하더라도,
 *   UI 모델을 별도로 두어 API 계약 변경 시 변환 계층에서 흡수 가능한 설계
 */
export type AttractionIntroCardModel = {
    keyId: string
    placeName: string
    address: string | null
    categoryName: string | null
    storyTitle: string | null
    storySummary: string | null
    storyUrl: string | null
    coreKeywords: string | null
    imageUrl: string | null
}