// src/domains/account/api/index.ts

/**
 * account/api (API 레이어 공개 진입점)
 *
 * 역할/목적:
 * - account 도메인의 네트워크 호출 함수를 외부에 공개하는 배럴 엔트리.
 * - 상위 레이어는 내부 파일 경로를 직접 참조하지 않고 이 경로로 API 함수를 가져감
 *
 * 공개 정책 / 설계 원칙:
 * - api 레이어는 types를 의존할 수 있지만, ui를 직접 import하면 순환 의존 위험 발생
 * - types → api → ui 순서의 단방향 의존을 유지
 */

export * from './account'