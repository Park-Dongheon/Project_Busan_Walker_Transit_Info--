// src/domains/map/lib/naver/index.ts

/**
 * naver/index.ts (Naver 서브모듈 배럴)
 *
 * 네이버 지도 SDK 관련 유틸(naverMapsLoader)의 공개 심볼을
 * 단일 경로로 재노출
 * 상위 lib/index.ts는 이 파일을 통해서만 naver SDK 로딩 기능에 접근한
 */

export * from './naverMapsLoader'
