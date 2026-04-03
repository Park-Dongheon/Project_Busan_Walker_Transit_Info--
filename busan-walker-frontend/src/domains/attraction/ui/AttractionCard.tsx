// src/domains/attraction/ui/AttractionCard.tsx

/**
 * AttractionCard.tsx (UI Layer - 관광지 요약 카드 컴포넌트)
 *
 * 역할/목적:
 * - 관광지 목록/캐러셀에서 재사용되는 "요약 카드 UI" 컴포넌트
 * - 네트워크/공공데이터 특성상 일부 필드가 null/결손일 수 있으므로 방어적 렌더링 수행 (null-safe)
 *
 * 공개 정책 / 설계 원칙:
 * - export 대상:
 *      · AttractionCard (default export)  - 목록/캐러셀용 관광지 요약 카드 컴포넌트
 *
 * 동작 방식:
 * - variant="default": 주소 포함, 정보 밀도가 높은 카드
 * - variant="compact": 핵심 정보만 노출하는 저밀도 카드
 * - 숫자/집계 값은 null/NaN을 방어하고 ko-KR locale 포맷을 적용
 * - 교통 요약 배지는 수단명 + 도보시간 + 거리가 모두 존재할 때만 노출(부분 데이터 오해 방지)
 * - 컨테이너는 <article>로 렌더링하여 "목록 내 독립 콘텐츠 단위"의 의미를 부여
 *
 * 운영 포인트:
 * - 표시 포맷(단위/라벨/소수점 자리수) 정책은 이 컴포넌트가 소유
 * - 클릭/네비게이션 등 상호작용 정책은 상위 컴포넌트에서 부여
 */

import type { AttractionCard as T } from "@/domains/attraction";

/**
 * UI 문자열 리소스(카드 전용)
 *
 * 역할/목적:
 * - 카드 내부에서 반복 사용되는 라벨/대체 문구를 상수로 분리하여 표기 일관성과 유지보수성 확보
 *
 * 정책:
 * - UI 언어는 ko-KR 전제로 구성
 * - 데이터 결손(null/empty) 시 사용자에게 "정보 없음" 상태를 명확히 전달
 *
 * 포인트:
 * - 본 컴포넌트는 "표시 포맷(단위/라벨/소수점 자리수)"을 소유
 *   따라서 동일 데이터를 다른 화면에서 보여줄 때도 이 정책을 재사용하면 UX 일관성 향상
 */
const ADDRESS_FALLBACK = "주소 정보 없음"
const TEXT_RATING = "평점"
const TEXT_REVIEW = "리뷰"
const TEXT_TRANSIT = "교통"
const TEXT_MINUTE_SUFFIX = "분"

/**
 * AttractionCard
 *
 * 역할/목적:
 * - 관광지 목록/캐러셀에서 사용하는 "요약 카드 UI" 컴포넌트
 * - 네트워크/공공데이터 특성상 일부 필드가 null/결손일 수 있음을 전제로,
 *   안전한 표시(방어적 렌더링) 수행
 *
 * 입력:
 * - a: 관광지 카드 DTO(AttractionCard)
 * - variant:
 *   - "default": 정보 밀도가 높은 카드(주소 포함)
 *   - "compact": 핵심 정보만 노출하는 저밀도 카드
 *
 * 렌더링 정책:
 * - 숫자/집계 값은 null/NaN을 방어
 * - 표시 시 ko-KR locale 포맷을 적용하여 가독성 향상
 * - 교통 요약 배지는 "수단명 + 도보시간 + 거리"가 모두 존재할 때만 노출
 *   (부분 데이터는 사용자가 잘못 추정할 여지가 있어 노출하지 않는 정책)
 *
 * 접근성/시맨틱 포인트:
 * - 컨테이너는 <article>로 렌더링하여 "목록 내 독립 콘텐츠 단위"의 의미를 부여
 */
export default function AttractionCard(props: { a: T; variant?: "default" | "compact" }) {
    const { a, variant = "default" } = props
    const compact: boolean = variant === "compact"

    /**
     * addressText
     *
     * 역할/목적:
     * - 주소가 null/빈 문자열인 경우 대체 문구를 사용해 "데이터 결손"을 명확히 표현
     *
     * 주의:
     * - default 모드에서만 주소를 사용자에게 노출
     * - compact 모드에서는 카드 밀도(정보량)를 낮추기 위해 주소 렌더링을 생략
     */
    const addressText: string = a.address?.trim() || ADDRESS_FALLBACK

    /**
     * 표시용 문자열 정규화(derived display strings)
     *
     * 역할/목적:
     * - API 응답의 숫자/집계 값을 "사용자에게 보여줄 문자열"로 변환
     *
     * 정책:
     * - null 또는 NaN이면 "표시하지 않음(null)"으로 처리
     * - 표시할 때는 ko-KR locale 포맷을 적용해 숫자 가독성 향상
     * - 단위(km/분)는 UI 레벨에서 결합하여 표현
     *
     * 주의:
     * - 값의 의미(단위)는 타입 계약(nearestDistanceKm=km, nearestWalkMin=분)에 의존
     * - 소수점 자리수 정책은 이 컴포넌트가 소유(동일 정보의 화면 간 일관성 유지 목적)
     */
    const kmText: string | null =
        a.nearestDistanceKm != null && Number.isFinite(a.nearestDistanceKm)
            ? a.nearestDistanceKm.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "km"
            : null

    const walkMinText: string | null =
        a.nearestWalkMin != null && Number.isFinite(a.nearestWalkMin)
            ? a.nearestWalkMin.toLocaleString("ko-KR") + TEXT_MINUTE_SUFFIX
            : null

    const ratingText: string | null =
        a.avgRating != null && Number.isFinite(a.avgRating)
            ? a.avgRating.toLocaleString("ko-KR", { maximumFractionDigits: 1 })
            : null

    /**
     * reviewText / accessText
     *
     * 정책:
     * - 집계 값이 존재하고 유효한 숫자일 때만 문자열로 노출
     *
     * 주의(데이터 계약 관점):
     * - reviewCount는 타입상 number지만, 방어적으로 Number.isFinite로 한 번 더 확인하여
     *   비정상 값(NaN/Infinity)이 UI에 그대로 노출되는 것
     */
    const reviewText: string | null =
        Number.isFinite(a.reviewCount)
            ? a.reviewCount.toLocaleString("ko-KR")
            : null

    const accessText: string | null =
        a.totalAccess != null && Number.isFinite(a.totalAccess)
            ? a.totalAccess.toLocaleString("ko-KR")
            : null

    /**
     * 카드 컨테이너(레이아웃/스타일)
     *
     * 역할/목적:
     * - 리스트/캐러셀에서 공통으로 재사용 가능한 시각적 컨테이너를 제공
     *
     * UI 포인트:
     * - hover 상태는 "상호작용 가능" 인상을 주는 힌트로 사용
     * - backdrop-blur는 배경 이미지/그라데이션 위에서 텍스트 대비를 보조
     *
     * 주의:
     * - 이 컴포넌트 자체는 클릭/네비게이션을 소유하지 않음
     *   (카드 클릭 이동 등 상호작용 정책은 상위에서 감싸서 부여하는 방식이 일반적)
     */
    return (
        <article
            className={[
                "rounded-2xl border border-white/15 bg-white/10 shadow-sm backdrop-blur",
                "transition hover:bg-white/15 hover:shadow-md",
                compact ? "p-3" : "p-4",
            ].join(" ")}
        >
            <h3 className={["font-extrabold tracking-tight text-white", compact ? "text-sm" : "text-base"].join(" ")}>
                {a.placeName}
            </h3>

            {/* default 모드에서만 주소를 노출하여 카드 밀도(정보량)를 제어 */}
            {!compact && (
                <p className="mt-1 line-clamp-2 wrap-break-word text-sm text-white/75">
                    {addressText}
                </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85">
                {/**
                 * 교통 요약 배지
                 *
                 * 노출 정책:
                 * - nearestModeName + walkMinText + kmText가 모두 있을 때만 노출
                 * - 부분 데이터만 노출하면 사용자가 "거리만 보고 도보시간을 추정"하는 등 오해가 생길 수 있어,
                 *   완전한 정보가 있을 때만 보여주는 보수적인 정책을 적용
                 */}
                {a.nearestModeName && walkMinText && kmText && (
                    <span className="rounded-full bg-white/15 px-2 py-1">
                        {a.nearestModeName} {"\u00B7"} {walkMinText} ({kmText})
                    </span>
                )}

                {/* 평점 배지 - avgRating 집계 값이 유효할 때만 표시 */}
                {ratingText && (
                    <span className="rounded-full bg-white/15 px-2 py-1">
                        {TEXT_RATING} {ratingText}
                    </span>
                )}

                {/* 리뷰 수 배지 - reviewCount가 유효할 때만 표시 */}
                {reviewText && (
                    <span className="rounded-full bg-white/10 px-2 py-1">
                        {TEXT_REVIEW} {reviewText}
                    </span>
                )}

                {/* 교통 접근성 배지 - totalAccess 집계 값이 유효할 때만 표시 */}
                {accessText && (
                    <span className="rounded-full bg-white/10 px-2 py-1">
                        {TEXT_TRANSIT} {accessText}
                    </span>
                )}
            </div>
        </article>
    );
}
