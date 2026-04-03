// src/domains/intro/ui/AttractionCardSkeleton.tsx

/**
 * AttractionCardSkeleton
 * 
 * 역할/목적:
 * - 소개(인트로) 페이지에서 "관광지 카드 데이터가 아직 준비되지 않았을 때" 보여주는
 *   시각적 플레이스홀더(Loading Skeleton) 컴포넌트
 * - 실제 카드(AttractionIntroCard)가 렌더링될 영역을 미리 파지하여,
 *   로딩 중에도 레이아웃 안정성 유지가 1차 목표
 * 
 * UX 정책(레이아웃/체감 성능):
 * - 데이터 로딩 중에도 카드의 주요 레이아웃(썸네일/타이틀/요약/주소/CTA 영역)을 비슷한 구조로 유지
 * - 이를 통해 실제 데이터가 도착해 카드가 교체 렌더링될 때 발생하는
 *   레이아웃 점프(Layout Shift) 감소 및 스크롤/탭 이동 경험 안정화
 * 
 * 접근성(Accessibility) 정책:
 * - 스켈레톤은 "정보 전달"이 아니라 "시각적 대기 상태 표현"이므로 aria-hidden="true"로
 *   보조기기(스크린리더)의 탐색 대상에서 제외
 * - 스크린리더에게 로딩 상태를 알리는 책임은 보통 상위 컨테이너
 *   예: 그리드/페이지 단에서 role="status" + aria-live로 '불러오는 중...'을 1회 안내
 *   (개별 카드가 각각 읽히면 오히려 소음이 커져 UX가 나빠질 수 있음)
 * 
 * 동작 방식(렌더링 구조):
 * - 최상위는 <article>로 카드 단위로 표현하며, 실제 카드와 유사한 컨테이너 스타일을 사용
 * - 내부 섹션은 실제 카드의 정보 블록을 대응시켜 배치
 *   1) 썸네일 영역(고정 높이)
 *   2) 카테고리 칩
 *   3) 관광지명(타이틀)
 *   4) 스토리 타이틀(서브 텍스트)
 *   5) 요약 박스(맛보기/설명 텍스트 블록)
 *   6) 주소 라인
 *   7) CTA 영역(버튼/링크가 위치할 자리)
 * 
 * 스타일링/성능 포인트:
 * - Tailwind의 animate-pulse를 사용해 "내용이 로딩 중"임을 일관된 방식으로 표현
 * - 스켈레톤은 사용자 입력을 받지 않는 단순 DOM이며,
 *   실제 데이터 렌더링이 준비되면 상위 상태에 의해 교체되는 것을 전제로 함
 * 
 * 주의/운영 포인트:
 * - 스켈레톤은 어디까지나 "대기 상태의 레이아웃 프리셋"
 *   실제 데이터 카드와 크게 다른 높이/여백을 사용하면, 오히려 로딩 전후 변형이 커져 UX가 악화 가능
 * - 페이지에서 다량 렌더링되는 경우가 많으므로, 복잡한 계산/이벤트 바인딩 없이
 *   단순 구조 유지가 유리
 */
export function AttractionCardSkeleton() {
    return (
        <article aria-hidden="true"
                 className="overflow-hidden rounded-3xl border border-white/15 bg-white/10 backdrop-blur">
            {/* 썸네일 영역: 실제 이미지 자리(고정 높이로 레이아웃 안정화) */}
            <div className="h-40 w-full bg-white/10">
                <div className="h-full w-full animate-pulse bg-white/10" />
            </div>

            <div className="space-y-4 p-5">
                {/* 카테고리 칩: 카드 상단 메타 정보가 위치할 영역 */}
                <div className="h-6 w-20 animate-pulse rounded-full bg-white/10" />

                {/* 관광지 이름(타이틀): 가장 시각적 우선순위가 높은 텍스트 블록 */}
                <div className="h-5 w-2/3 animate-pulse rounded-lg bg-white/10" />

                {/* 스토리 타이틀: 서브 헤더/보조 텍스트 영역 */}
                <div className="h-4 w-1/2 animate-pulse rounded-lg bg-white/10" />

                {/* 맛보기/요약 박스 자리: 설명 텍스트가 여러 줄로 배치되는 영역을 모사 */}
                <div className="space-y-2 rounded-2xl border border-white/10 bg-black/10 p-4">
                    <div className="h-3 w-12 animate-pulse rounded-lg bg-white/10" />
                    <div className="h-4 w-full animate-pulse rounded-lg bg-white/10" />
                    <div className="h-4 w-5/6 animate-pulse rounded-lg bg-white/10" />
                </div>

                {/* 주소: 단일 라인의 메타 텍스트 영역 */}
                <div className="h-3 w-3/4 animate-pulse rounded-lg bg-white/10" />

                {/* CTA 영역: 버튼/링크가 배치될 하단 액션 영역 */}
                <div className="flex items-center justify-between pt-2">
                    <div className="h-4 w-20 animate-pulse rounded-lg bg-white/10" />
                    <div className="h-4 w-24 animate-pulse rounded-lg bg-white/10" />
                </div>
            </div>
        </article>
    )
}