// src/domains/map/lib/transit/transitModeAliases.ts

/**
 * transitModeAliases.ts (Transit Mode Alias Resolver)
 *
 * 역할/목적:
 * - 교통수단 코드, 명칭, 분류의 다양한 표현을 공통 카테고리로 정규화
 * - 마커 아이콘과 교통수단 분기 로직에서 사용할 해석 규칙을 중앙 관리
 *
 * 공개 정책 / 설계 원칙:
 * - 외부에는 분류 결과와 최소 해석 함수만 노출
 * - alias 사전과 토큰 정규화 규칙 같은 세부 판단 기준은 내부 구현으로 숨김
 *
 * 동작 방식:
 * - modeCode, modeName, transitClassName을 정규화된 토큰으로 변환
 * - alias 사전과 우선순위 규칙을 적용해 bus, train, subway 등 카테고리를 결정
 *
 * 운영 포인트:
 * - alias 목록 변경은 마커 아이콘, 교통수단 라벨, 분류 정확도에 직접 영향을 줌
 * - 백엔드 modeCode 정책이 바뀌면 이 파일과 icon/presentation 계층을 함께 검토해야 함
 * - DEV 경고가 반복되면 데이터 품질 문제인지 alias 누락인지 먼저 확인하는 것이 좋음
 * 
 * 주의:
 * - 현재 파일은 교통수단 "표현 정책"이 아니라 "분류 해석 정책"을 담당
 * - alias를 무분별하게 추가하면 오분류 가능성이 커질 수 있으므로, 실제 데이터 샘플 기준으로 관리
 * - 현재 지하철 노선 판별 범위는 1~3호선으로 제한되어 있으므로, 서비스 범위가 확장되면 패턴과 타입을 함께 갱신
 */

const TOKEN_PATTERN = /[A-Z0-9]+|[가-힣]+/gu
const HANGUL_PATTERN = /[가-힣]/u
const COMPACT_PATTERN = /[^A-Z0-9가-힣]+/gu

/**
 * 교통수단 카테고리별 별칭 사전
 * 
 * 의미:
 * - 다양한 원본 표현을 서비스 내부 공통 카테고리로 묶기 위한 기준 테이블
 * 
 * 운영 포인트:
 * - 실제 데이터에서 반복적으로 등장하는 표현만 추가하는 것이 좋음
 * - 지나치게 넓은 별칭은 다른 카테고리와 충돌을 만듦
 */
const TRANSIT_MODE_ALIASES = {
    bus: ["B", "BUS", "버스", "시내버스", "마을버스"],
    train: ["S5", "TRAIN", "KTX", "SRT", "ITX", "기차", "열차"],
    donghae: ["S4", "DONGHAE", "동해", "동해선", "동해부전선"],
    subway: ["S1", "S2", "S3", "SUBWAY", "METRO", "지하철", "도시철도"]
} as const


/* 마커/표시 계층에서 공통으로 사용하는 교통수단 카테고리 */
export type TransitMarkerCategory = "bus" | "donghae" | "train" | "subway"

/**
 * 현재 별도 식별하는 지하철 노선 범위
 * 
 * 주의:
 * - 노선 확장 시 타입과 패턴 테이블을 함께 수정
 */
type SubwayLine = 1 | 2 | 3


/**
 * 해석에 사용하는 원본 입력 값
 * 
 * 의미:
 * - 백엔드 또는 외부 데이터 소스에서 들어온 교통수단 식별 후보
 */
type TransitMarkerArgs = {
    modeCode?: string | null
    modeName?: string | null
    transitClassName?: string | null
}

/**
 * 비교 가능한 형태로 정규화한 입력 값
 * 
 * 정책:
 * - 비교 로직은 항상 이 정규화 결과를 기준으로 수행
 */
type NormalizedTransitMarkerArgs = {
    modeCode: string
    modeName: string
    transitClassName: string
}

/**
 * alias 비교 최적화를 위한 내부 표현
 * 
 * 의미:
 * - 정규화 문자열, compact 문자열, 한글 포함 여부를 함께 저장햐여 반복 비교 시 동일 계산을 줄임
 */
type CompiledAlias = {
    normalized: string
    compact: string
    hasHangul: boolean
}

/**
 * 최종 해석 결과
 * 
 * 의미:
 * - 외부 호출부는 이 구조만 알면 교통수단 분기와 마커 선택을 수행 가능
 */
type TransitMarkerMetadata = {
    category: TransitMarkerCategory | null
    subwayLine: SubwayLine | null
}

/**
 * 명칭 기반 alias 해석 시 적용하는 카테고리 우선순위
 * 
 * 정책:
 * - 더 구체적이거나 혼동 가능성이 낮은 카테고리를 먼저 평가
 */
const CATEGORY_PRIORITY: readonly TransitMarkerCategory[] = ["donghae",
                                                             "train",
                                                             "bus",
                                                             "subway"]

const SUBWAY_LINES: readonly SubwayLine[] = [1, 2, 3]

/**
 * modeCode 직접 매핑 우선 규칙
 * 
 * 의미:
 * - 특정 코드는 alias 검색보다 명시적으로 해석하는 편이 정확한 경우가 존재
 */
const TRANSIT_MODE_CODE_OVERRIDES: Record<string, TransitMarkerCategory> = {B: "bus",
                                                                            S4: "donghae",
                                                                            S5: "train"}

/**
 * 지하철 노선 판별용 패턴
 * 
 * 용도:
 * - modeCode만으로 노선 판별이 되지 않을 때 modeName / transitClassName에서 보조 판별
 */
const SUBWAY_LINE_PATTERNS: Record<SubwayLine, readonly string[]> = {
    1: ["1호선", "LINE1"],
    2: ["2호선", "LINE2"],
    3: ["3호선", "LINE3"]
}

/**
 * alias 컴파일 결과 캐시
 * 
 * 필요성:
 * - 동일 alias 사전을 반복 정규화/분석하지 않도록 하여 비교 비용을 줄임
 */
const COMPILED_ALIAS_CACHE = new WeakMap<ReadonlyArray<string>, readonly CompiledAlias[]>()

/**
 * DEV 환경 충돌 경고 중복 방지용 키 저장소
 * 
 * 목적:
 * - 같은 입력 조합에 대한 경고를 1회만 출력하여 콘솔 노이즈를 줄임
 */
const TRANSIT_MARKER_CONFLICT_WARN_KEYS = new Set<string>()

/**
 * alias 비교 대상 문자열을 정규화
 * 
 * 동작:
 * - nullish 값을 빈 문자열로 치환
 * - 유니코드 정규화(NFKC), trim, 대문자 변환 수행
 * 
 * 필요성:
 * - 전각/반각, 공백, 대소문자 차이로 인해 같은 의미가 다르게 판정되는 것을 줄이기 위함
 */
function normalizeAliasTarget(input?: string | null): string {
    return (input ?? "").normalize("NFKC").trim().toUpperCase()
}

/**
 * 비교용 compact 문자열 생성
 * 
 * 정책:
 * - 영문/숫자/한글 외 문자는 제거하여 비교 노이즈를 줄임
 */
function toCompactToken(value: string): string {
    return value.replace(COMPACT_PATTERN, "")
    
}

/**
 * 입력 문자열을 alias 비교용 토큰으로 분해
 * 
 * 의미:
 * - 영문/숫자 묶음과 한글 묶음을 토큰 단위로 비교 가능
 */
function toAliasTokens(value: string): string[] {
    return value.match(TOKEN_PATTERN) ?? []
}

/**
 * alias 사전을 비교 최적화용 구조로 컴파일
 * 
 * 처리 항목:
 * - 정규화 문자열
 * - compact 문자열
 * - 한글 포함 여부
 */
function compileAliases(aliases: readonly string[]): readonly CompiledAlias[] {
    return aliases
        .map((alias) => normalizeAliasTarget(alias))
        .filter((alias) => alias.length > 0)
        .map((alias) => ({
            normalized: alias,
            compact: toCompactToken(alias),
            hasHangul: HANGUL_PATTERN.test(alias),
        }))
        .filter((alias) => alias.compact.length > 0)
}

/* alias 컴파일 결과를 캐시에서 조회하거나 새로 생성 */
function getCompiledAliases(aliases: readonly string[]): readonly CompiledAlias[] {
    const cached = COMPILED_ALIAS_CACHE.get(aliases)    
    if (cached) return cached
    
    const compiled = compileAliases(aliases)  
    COMPILED_ALIAS_CACHE.set(aliases, compiled)
    
    return compiled
}

/**
 * 카테고리별 컴파일된 alias 테이블
 * 
 * 의미:
 * - 런타임 분류 시 즉시 비교 가능한 형태의 사전
 */
const COMPILED_TRANSIT_MODE_ALIASES: Record<TransitMarkerCategory, readonly CompiledAlias[]> = {
    bus: getCompiledAliases(TRANSIT_MODE_ALIASES.bus),
    donghae: getCompiledAliases(TRANSIT_MODE_ALIASES.donghae),
    train: getCompiledAliases(TRANSIT_MODE_ALIASES.train),
    subway: getCompiledAliases(TRANSIT_MODE_ALIASES.subway)
}

/* 지하철 노선 판별용 정규화 패턴 테이블 */
const COMPILED_SUBWAY_LINE_PATTERNS: Record<SubwayLine, readonly string[]> = {
    1: SUBWAY_LINE_PATTERNS[1].map(normalizeAliasTarget),
    2: SUBWAY_LINE_PATTERNS[2].map(normalizeAliasTarget),
    3: SUBWAY_LINE_PATTERNS[3].map(normalizeAliasTarget)
}

/**
 * 대상 문자열이 alias 목록 중 하나와 매칭되는지 검사
 * 
 * 비교 방식:
 * - compact 완전 일치
 * - 토큰 완전 일치
 * - 한글 alias의 경우 부분 포함 검사
 * 
 * 주의:
 * - 포함 비교는 유연하지만, alias를 과하게 넓히면 오탐 가능성이 발생
 */
function hasCompiledAlias(target: string, compiledAliases: readonly CompiledAlias[]): boolean {
    if (!target) return false
    
    const compactTarget = toCompactToken(target)
    const targetTokens = new Set(toAliasTokens(target))
    
    for (const alias of compiledAliases) {
        if (compactTarget === alias.compact) return true
        if (targetTokens.has(alias.normalized)) return true
        if (alias.hasHangul && target.includes(alias.normalized)) {
            return true
        }
    }

    return false
}

/* 원본 입력을 해석용 정규화 구조로 변환 */
function normalizeTransitMarkerArgs(args: TransitMarkerArgs): NormalizedTransitMarkerArgs {
    return {
        modeCode: normalizeAliasTarget(args.modeCode),
        modeName: normalizeAliasTarget(args.modeName),
        transitClassName: normalizeAliasTarget(args.transitClassName)
    }
}

/**
 * modeCode만을 기준으로 카테고리를 판별
 * 
 * 정책:
 * - code는 가장 신뢰도 높은 입력으로 간주하여 우선 평가
 * - override > 정규식 패턴 > 부분 문자열 검사 순서로 해석
 */
function resolveCategoryFromCode(modeCode: string): TransitMarkerCategory | null {
    if (!modeCode) return null
    
    const overridden = TRANSIT_MODE_CODE_OVERRIDES[modeCode]
    if (overridden) return overridden
    
    if (/^B\d*$/u.test(modeCode)) return "bus"
    if (/^S\d+$/u.test(modeCode)) return "subway"
    if (modeCode.includes("BUS")) return "bus"
    if (modeCode.includes("DONGHAE")) return "donghae"
    
    if (modeCode.includes("TRAIN") || modeCode.includes("KTX") || modeCode.includes("SRT")) {
        return "train"
    }
    if (modeCode.includes("SUBWAY") || modeCode.includes("METRO")) return "subway"
    
    return null   
}

/**
 * modeName / transitClassName alias를 기준으로 카테고리를 판별
 * 
 * 정책:
 * - CATEGORY_PRIORITY 순서대로 검사하여 먼저 매칭된 카테고리를 채택
 */
function resolveCategoryFromAliases(args: NormalizedTransitMarkerArgs): TransitMarkerCategory | null {
    for (const category of CATEGORY_PRIORITY) {
        const aliases = COMPILED_TRANSIT_MODE_ALIASES[category]
        
        if (
            hasCompiledAlias(args.modeName, aliases) ||
            hasCompiledAlias(args.transitClassName, aliases)
        ) {
            return category
        }
    }

    return null
}

/**
 * code 기반 분류와 alias 기반 분류가 충돌할 때 DEV 환경에서 1회 경고
 * 
 * 정책:
 * - 최종 분류는 modeCode 우선
 * - 경고는 데이터 품질 문제나 alias 사전 보정 필요성을 파악하기 위한 디버깅 용도
 */
function warnTransitMarkerCategoryConflictOnce(args: NormalizedTransitMarkerArgs, details: {
    categoryFromCode: TransitMarkerCategory
    categoryFromAliases: TransitMarkerCategory
}): void {
    if (!import.meta.env.DEV) return
    
    const warnKey = [
        args.modeCode,
        args.modeName,
        args.transitClassName,
        details.categoryFromCode,
        details.categoryFromAliases
    ].join("|")
    
    if (TRANSIT_MARKER_CONFLICT_WARN_KEYS.has(warnKey)) return
    TRANSIT_MARKER_CONFLICT_WARN_KEYS.add(warnKey)
    
    console.warn("[map] Transit marker category conflict detected. Using modeCode as the source of truth.", {
        modeCode: args.modeCode,
        modeName: args.modeName,
        transitClassName: args.transitClassName,
        categoryFromCode: details.categoryFromCode,
        categoryFromAliases: details.categoryFromAliases
    })
}

/**
 * 정규화된 입력을 기준으로 최종 카테고리를 결정
 * 
 * 동작:
 * - 먼저 code 기반 분류 시도
 * - alias 기반 분류 결과가 다르면 DEV 경고를 남기되, 최종 채택은 code 우선
 * - code 해석이 불가능한 경우 alias 결과 사용
 */
function resolveTransitMarkerCategoryFromNormalized(
    args: NormalizedTransitMarkerArgs
): TransitMarkerCategory | null {
    const categoryFromCode = resolveCategoryFromCode(args.modeCode)
    const categoryFromAliases = resolveCategoryFromAliases(args)
    
    if (categoryFromCode) {
        if (categoryFromAliases && categoryFromAliases !== categoryFromCode) {
            warnTransitMarkerCategoryConflictOnce(args, {categoryFromCode, categoryFromAliases}) 
        }

        return categoryFromCode
    }
    
    return categoryFromAliases
}

/**
 * 정규화된 입력을 기준으로 지하철 노선을 판별
 * 
 * 정책:
 * - 카테고리가 subway가 아니면 null
 * - modeCode의 S1/S2/S3는 최우선으로 해석
 * - 그렇지 않으면 transitClassName, modeName에서 노선 패턴을 검색
 */
function resolveTransitSubwayLineFromNormalized(
    args: NormalizedTransitMarkerArgs,
    category: TransitMarkerCategory | null
): SubwayLine | null {
    if (category !== "subway") return null

    if (args.modeCode === "S1") return 1
    if (args.modeCode === "S2") return 2
    if (args.modeCode === "S3") return 3
    
    const targets = [args.transitClassName, args.modeName]

    for (const line of SUBWAY_LINES) {
        const patterns = COMPILED_SUBWAY_LINE_PATTERNS[line]
        
        if (targets.some((target) => patterns.some((pattern) => target.includes(pattern)))) {
            return line
        }
    }

    return null
}

/**
 * 교통수단 메타데이터를 공통 분류 결과로 해석
 * 
 * 반환값:
 * - category: 공통 교통수단 카테고리
 * - subwayLine: 지하철인 경우 노선 번호, 아니면 null
 * 
 * 호출부 사용 예:
 * - markerIcons.ts에서 카테고리별 마커 선택
 * - presentation 계층에서 교통수단 라벨/표시 분기
 */
export function resolveTransitMarkerMetadata(args: TransitMarkerArgs): TransitMarkerMetadata {
    const normalized = normalizeTransitMarkerArgs(args)
    const category = resolveTransitMarkerCategoryFromNormalized(normalized)

    return {
        category,
        subwayLine: resolveTransitSubwayLineFromNormalized(normalized, category),
    }
    
}