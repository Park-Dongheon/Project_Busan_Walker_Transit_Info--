// src/domains/map/lib/transit/transitPresentation.ts

/**
 * transitPresentation.ts (Presentation Layer - 교통 옵션 HTML/URL 생성)
 *
 * 역할/목적:
 * - UI 컴포넌트와 지도 SDK가 직접 사용할 수 있는 최종 출력 형태를 생성
 * - ResolvedTransitOption을 기반으로 지도 마커 infoWindow용 HTML 문자열과
 *   네이버 도보 길찾기 딥링크 URL을 조합
 *
 * 데이터 흐름:
 *   ResolvedTransitOption  (transitDerived 출력)
 *      ↓  buildTransitInfoHtml()
 *   HTML 문자열            (지도 마커 infoWindow 삽입용)
 *
 *   GeoPoint × 2          (출발지, 목적지)
 *      ↓  buildNaverWalkRouteUrl()
 *   URL 문자열             (네이버 지도 도보 길찾기 딥링크)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · buildNaverWalkRouteUrl  - 네이버 도보 길찾기 딥링크 URL 생성
 *      · buildTransitInfoHtml    - 지도 마커 infoWindow용 HTML 문자열 생성
 * - HTML 이스케이프, 인라인 스타일, Android 딥링크 분기 등 출력 세부는 내부 구현으로 캡슐화
 * - 이 파일은 순수 출력 생성만 담당하며 상태·API 호출·사이드이펙트 없음
 *
 * 동작 방식:
 * - escapeHtml로 사용자 데이터를 HTML에 삽입하기 전 XSS를 방지
 * - buildNaverWalkRouteUrl은 Android 여부를 userAgent로 감지하여
 *   Intent URL 또는 nmap:// 스킴으로 분기
 * - buildTransitInfoRow는 value가 null이면 빈 문자열을 반환하여
 *   선택적 필드가 없을 때 레이아웃 공백이 생기지 않도록 처리
 *
 * 운영 포인트:
 * - infoWindow 스타일(색상, 폰트, 패딩 등)을 수정할 경우 buildTransitInfoHtml 내 인라인 스타일을 직접 수정
 * - 네이버 지도 딥링크 스펙(query parameter, 스킴)이 변경되면 buildNaverWalkRouteUrl을 검토
 * - 새 표시 행이 필요하면 buildTransitInfoRow 호출을 추가하고 ResolvedTransitOption 필드와 함께 확인
 */

import type { GeoPoint } from '../../types';
import type { ResolvedTransitOption } from './transitDerived';
import { formatKmLabel } from './transitOptions';

const HTML_ESCAPE_PATTERN = /[&<>"']/g

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
}

function escapeHtml(input: string): string {
    return input.replace(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPE_LOOKUP[char] ?? char)
}

function buildTransitInfoRow(
    label: string,
    value: string | null,
    options?: {
        marginTop?: number
        lineHeight?: number
        color?: string
        wordBreak?: boolean
    }
): string {
    if (!value) return ''

    const marginTop = options?.marginTop ?? 4
    const lineHeight = options?.lineHeight ?? 1.4
    const color = options?.color ?? '#475569'
    const breakStyle = options?.wordBreak ? 'word-break:break-word;overflow-wrap:anywhere;' : ''

    return `<div style="font-size:11px;color:${color};margin-top:${marginTop}px;line-height:${lineHeight};${breakStyle}"><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</div>`
}

function buildTransitInfoMyLocationRow(
    myLocationWalk?: { distanceKm: number; walkMin: number } | null,
): string {
    if (!myLocationWalk) return ''
    if (!Number.isFinite(myLocationWalk.distanceKm) || !Number.isFinite(myLocationWalk.walkMin)) {
        return ''
    }

    return `<div style="font-size:11px;color:#0f4c81;margin-top:6px;line-height:1.45;"><strong>내 위치 기준(근사)</strong> 도보 ${myLocationWalk.walkMin}분 / ${escapeHtml(formatKmLabel(myLocationWalk.distanceKm))}</div>`
}

type NaverWalkRouteUrlArgs = {
    start: GeoPoint
    destination: GeoPoint
    startName?: string
    destinationName?: string
    appName?: string
}

/**
 * 네이버 지도 도보 길찾기 딥링크 URL을 생성
 *
 * - Android인 경우 Intent URL(nmap scheme)을 반환하고, 그 외에는 nmap:// 스킴을 사용
 * - appName을 제공하지 않으면 현재 페이지 origin을 사용
 *
 * @param args.start           - 출발지 좌표
 * @param args.destination     - 목적지 좌표
 * @param args.startName       - 출발지 표시 이름 (기본: '내 위치')
 * @param args.destinationName - 목적지 표시 이름 (기본: '목적지')
 * @param args.appName         - 네이버 지도 앱에 전달할 앱 식별자
 */
export function buildNaverWalkRouteUrl(args: NaverWalkRouteUrlArgs): string {
    const {
        start,
        destination,
        startName = '내 위치',
        destinationName = '목적지',
        appName
    } = args

    const resolvedAppName =
        appName ?? (typeof window !== 'undefined' ? window.location.origin : 'busan-walker-web')

    const query = new URLSearchParams({
        slat: start.lat.toFixed(7),
        slng: start.lng.toFixed(7),
        sname: startName,
        dlat: destination.lat.toFixed(7),
        dlng: destination.lng.toFixed(7),
        dname: destinationName,
        appname: resolvedAppName
    }).toString()

    if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
        return `intent://route/walk?${query}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`
    }

    return `nmap://route/walk?${query}`
}

/**
 * 교통 옵션을 네이버 지도 InfoWindow에 삽입할 HTML 문자열로 변환
 *
 * - 모든 사용자 데이터는 escapeHtml을 거쳐 XSS를 방지
 * - null인 선택적 필드(거리 기준, 정류장 번호, 출입구, 주소)는 렌더링하지 않음
 * - 내 위치 기준 도보 정보가 있으면 별도 행으로 표시
 *
 * @param option - 렌더링할 ResolvedTransitOption
 * @returns 네이버 지도 InfoWindow.setContent()에 바로 사용할 수 있는 HTML 문자열
 */
export function buildTransitInfoHtml(option: ResolvedTransitOption): string {
    return `
        <div style="padding:12px 14px;max-width:264px;border-radius:14px;border:1px solid rgba(15,23,42,0.10);background:rgba(255,255,255,0.96);box-shadow:0 10px 24px rgba(2,6,23,0.16);color:#0f172a;font-family:'Pretendard Variable','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;letter-spacing:-0.01em;">
            <div style="font-weight:800;font-size:13px;line-height:1.4;">${escapeHtml(option.title)}</div>
            <div style="font-size:11px;color:#475569;margin-top:3px;line-height:1.4;">${escapeHtml(option.modeLabel)}</div>
            <div style="font-size:12px;color:#111827;margin-top:8px;line-height:1.45;background:rgba(15,23,42,0.04);border-radius:10px;padding:6px 8px;">
                거리 ${escapeHtml(option.distanceLabel)} / 도보 ${escapeHtml(option.walkLabel)}
            </div>
            ${buildTransitInfoRow('거리 계산 기준', option.distanceSourceLabel)}
            ${buildTransitInfoRow('정류장 번호', option.busStopNo)}
            ${buildTransitInfoRow('출입구', option.entranceName)}
            ${buildTransitInfoRow('주소', option.facilityAddress, { lineHeight: 1.45, wordBreak: true })}
            ${buildTransitInfoMyLocationRow(option.myWalkApprox)}
        </div>
    `
}