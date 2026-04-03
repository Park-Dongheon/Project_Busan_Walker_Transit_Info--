// src/domains/account/index.ts

/**
 * account (도메인 공개 진입점)
 *
 * 역할/목적:
 * - account 도메인의 외부 노출면(public surface)을 고정하는 배럴 엔트리.
 * - 상위 레이어(페이지/라우팅/타 도메인)는 내부 파일 경로를 직접 참조하지 않고
 *   "@/domains/account"를 통해 일관된 import 경로로 접근.
 *
 * 공개 정책 / 설계 원칙:
 * - types: 도메인 타입 계약을 직접 export하여 상위 레이어가 타입을 가볍게 가져갈 수 있도록 함.
 * - api/ui: 런타임 모듈은 namespace export로 묶어 account.api.*, account.ui.* 형태로 접근.
 *
 * 의존 방향(레이어링) 정책:
 * - types → api → ui 방향의 단방향 의존을 유지.
 * - api가 ui를 import하면 순환 의존 위험 발생.
 */
export * from './types'
export * as api from './api'
export * as ui from './ui'
