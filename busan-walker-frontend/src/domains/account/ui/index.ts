// src/domains/account/ui/index.ts

/**
 * account/ui (UI 레이어 공개 진입점)
 *
 * 역할/목적:
 * - account 도메인의 UI 컴포넌트를 외부에 공개하는 배럴 엔트리.
 * - 상위 레이어(페이지/컨테이너)는 내부 파일 경로를 직접 참조하지 않고
 *   이 경로를 통해 컴포넌트를 가져감
 *
 * 공개 정책 / 설계 원칙:
 * - 화면에서 사용하는 컴포넌트만 노출하며, api/types 레이어 내부 구현은 이 엔트리로 노출하지 않음
 * - 내부 파일 이동·분리 시에도 이 엔트리의 export 목록을 유지하면 import 경로가 흔들리지 않음
 */

export * from './UserAccountHeader'
export * from './sections/UserBasicInfoSection'
export * from './sections/UserPasswordSection'
export * from './sections/UserAccountStatusSection'