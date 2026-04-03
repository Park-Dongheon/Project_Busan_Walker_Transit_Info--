// src/domains/map/lib/transit/index.ts

/**
 * transit/index.ts (Transit 서브모듈 배럴)
 *
 * transit 관련 유틸(transitOptions), 파생 변환(transitDerived),
 * 표현 계층(transitPresentation)의 공개 심볼을 단일 경로로 통합하여 재노출
 * 상위 lib/index.ts는 이 파일을 통해서만 transit 기능에 접근
 */

export {
    formatKm,
    formatKmLabel,
    normalizeTransitOptions,
    normalizeTransitOptionText,
    buildTransitOptionLookupSignature,
    buildTransitOptionStableKey,
    resolveTransitRenderablePoint,
    resolveTransitDistanceKm,
    resolveTransitWalkMin,
    estimateWalkFromCoords
} from './transitOptions';

export {
    buildResolvedTransitOptions,
    buildResolvedTransitOptionsCacheKey,
    buildTransitOptionItems,
    buildTransitOverlayDatasetSignature,
    resolveTransitDestinationName
} from './transitDerived';

export type { ResolvedTransitOption } from './transitDerived';

export {
    buildNaverWalkRouteUrl,
    buildTransitInfoHtml
} from './transitPresentation';
