// src/domains/review/lib/date.ts

/**
 * date.ts (Lib Layer - 리뷰 날짜 포맷 유틸리티)
 *
 * 역할/목적:
 * - 리뷰/댓글의 날짜 문자열을 UI에 표시할 형태로 변환하는 순수 함수 제공
 * - 서버 타임존(Asia/Seoul) 정보가 누락된 ISO 문자열을 올바르게 파싱
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · formatDateTime  - ISO 문자열을 "YYYY-MM-DD HH:mm" 형태로 변환
 *      · isEdited        - createdAt/updatedAt 비교로 수정 여부 판단
 *
 * 동작 방식:
 * - 타임존 정보가 없는 ISO 문자열은 서버 타임존(+09:00)을 가정하여 파싱
 * - 이미 Z 또는 ±HH:mm 형태의 타임존이 있으면 그대로 사용
 *
 * 운영 포인트:
 * - 서버 타임존이 변경되면 SERVER_OFFSET 상수를 수정
 * - isEdited는 1초 이상 차이를 "수정됨"으로 간주하며 필요 시 임계값을 조정
 */

/**
 * ISO 문자열에 타임존 정보가 없을 때 서버 로컬(Asia/Seoul)로 간주.
 * - 백엔드가 DB 값(2026-02-10 13:49)을 "2026-02-10T13:49:47" 형태로 내려주면
 *   Z를 붙이면 UTC로 해석되어 한국에서 22:49로 표시됨(9시간 차이)
 * - 이 앱은 서버 타임존이 Asia/Seoul이므로, 타임존 없으면 +09:00으로 파싱하여 처리
 */
const SERVER_OFFSET = "+09:00"

function parseWithServerZoneIfMissing(iso: string): string {
    const s = iso.trim()
    if (!s) return s
    // 이미 Z 또는 ±HH:mm 형태로 끝나면 그대로 반환
    if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(s)) return s
    // YYYY-MM-DDTHH:mm... 형태이고 타임존이 없으면 서버 타임존(Asia/Seoul)으로 파싱하여 반환
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.replace(/(\.\d{3})?$/, `$1${SERVER_OFFSET}`)
    return s
}

/**
 * ISO 문자열을 "YYYY-MM-DD HH:mm" 형태로 표시.
 * - 서버가 Instant(UTC) 기반으로 내려주더라도, 브라우저 로컬 타임존으로 변환하여 표시
 */
export function formatDateTime(iso: string): string {
    const normalized = parseWithServerZoneIfMissing(iso)
    const d = new Date(normalized)
    if (Number.isNaN(d.getTime())) return iso

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mi = String(d.getMinutes()).padStart(2, "0")

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

/**
 * createdAt / updatedAt 비교로 "수정됨" 여부를 판단.
 * - 수정 이력 테이블/엔드포인트가 없어도, UX 상 수정 여부 표시 가능
 * - 1초 이상 차이가 나면 수정된 것으로 간주
 */
export function isEdited(createdAt: string, updatedAt: string): boolean {
    const c = new Date(parseWithServerZoneIfMissing(createdAt)).getTime()
    const u = new Date(parseWithServerZoneIfMissing(updatedAt)).getTime()

    if (Number.isNaN(c) || Number.isNaN(u)) return createdAt !== updatedAt
    return Math.abs(u - c) >= 1000  // 1초 이상 차이가 나면 수정으로 간주
}
