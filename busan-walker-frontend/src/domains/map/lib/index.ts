// src/domains/map/lib/index.ts

/**
 * lib/index.ts (Map Domain - 라이브러리 배럴)
 *
 * 역할/목적:
 * - map 도메인 lib 하위의 모든 유틸, SDK 로더, 교통 관련 함수를
 *   단일 import 경로로 통합하여 재노출
 * - 상위 도메인 계층(model, ui, hooks)이 lib 내부 폴더 구조에
 *   직접 의존하지 않도록 경계를 제공
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · geo           - 좌표·줌·bbox 유틸 (DEFAULT_CENTER, normalizeZoom 등)
 *      · markerIcons   - 관광지/교통 마커 아이콘 팩토리
 *      · naver         - 네이버 지도 SDK 로더 (loadNaverMapsSdk)
 *      · transit       - 교통 옵션 변환·표현 유틸 전체
 * - 각 서브모듈의 내부 구현 세부는 이 파일을 통해 숨겨지며,
 *   상위 계층은 lib/index.ts 경로만 참조
 *
 * 운영 포인트:
 * - 새 lib 서브모듈이 추가되면 이 파일에 export 구문을 추가
 * - 심볼 충돌이 발생하면 named export로 명시적 선택 후 재노출
 */

export {
    DEFAULT_CENTER,
    DEFAULT_ZOOM,
    MAP_MIN_ZOOM,
    MAP_MAX_ZOOM,
    isLikelyKoreaLatLng,
    normalizeZoom,
    parseInitialValue,
    bboxToParam,
    isValidBBox,
    parseBBoxParam,
    toBoundsLike,
    computeBBoxFromBounds,
    latOf,
    lngOf,
    fitMapToCoords
} from './geo'

export {
    getAttractionMarkerIcon,
    getTransitMarkerIcon
} from './markerIcons'

export * from './naver'
export * from './transit'