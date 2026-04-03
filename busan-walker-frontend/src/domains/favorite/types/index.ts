// src/domains/favorite/types/index.ts

/**
 * FAVORITES_SORT_FIELDS
 * 
 * 역할/목적:
 * - 즐겨찾기 목록 조회(/favorites)에서 정렬에 사용할 수 있는 "필드 이름"의 집합을 정의
 * - UI/클라이언트 코드가 sort 문자열을 구성할 때 오타/비허용 필드를 타입 레벨에서 1차로 차단하는 데 사용
 * 
 * 정책(권한/검증 책임 분리):
 * - 이 목록은 "클라이언트가 기대하는 정렬 필드"
 * - 최종 허용/거절(화이트리스트 강제)은 서버가 책임지며, 서버는 목록 밖 필드에 대해 오류(예: 400)를 반환 가능
 * 
 * 포인트:
 * - 서버의 sort whitelist와 동기화되어야 UX가 일관 (클라이언트에서 허용되는 것처럼 보이는데 서버가 거절하는 상황 방지)
 */
export const FAVORITES_SORT_FIELDS = [
    "placeName",
    "avgRating",
    "totalAccess",
    "favoredAt",
    "keyId"
] as const

/**
 * FavoritesSortField
 * 
 * 역할:
 * - FAVORITES_SORT_FIELDS의 원소 중 하나만 선택 가능하도록 만드는 유니온 타입
 */
export type FavoritesSortField = (typeof FAVORITES_SORT_FIELDS)[number]

/**
 * FavoritesSortDirection
 * 
 * 역할/목적:
 * - 정렬 방향(direction) 문자열 계약
 * 
 * 정책:
 * - 서버가 대/소문자를 구분하지 않거나 내부에서 소문자 정규화를 수행할 수 있으므로,
 *   호출 측 편의를 위해 대문자 입력도 타입으로 허용
 * 
 * 주의:
 * - 실제 서버 구현이 대문자를 허용하지 않는다면, 클라이언트에서 정규화(소문자 변환) 후 전달하는 것이 안전
 */
export type FavoritesSortDirection = "asc" | "desc" | "ASC" | "DESC"

/**
 * FavoritesSimpleSort
 * 
 * 역할/목적:
 * - 단일 정렬 규칙을 표현하는 문자열 형식
 * 
 * 형식:
 * - "field"           (방향 생략: 서버 기본 방향 정책을 따르는 것을 전제)
 * - "field,asc|desc"  (명시적 방향 지정)
 * 
 * 포인트:
 * - 단일 정렬은 대부분의 목록 화면에서 "정렬 기준 1개"를 선택할 때 사용
 */
export type FavoritesSimpleSort =
    | FavoritesSortField
    | `${FavoritesSortField},${FavoritesSortDirection}`

/**
 * FavoritesCompositeSort
 * 
 * 역할/목적:
 * - 복합(다중) 정렬 규칙을 표현하는 문자열 형식
 * 
 * 형식(예시):
 * - "field:asc"
 * - "field:asc,field2:desc"
 *
 * 정책:
 * - 복합 정렬은 서버가 지원하는 파싱 규칙과 일치해야 의미
 * - 서버가 복합 정렬을 지원하지 않거나 구문이 다르면 요청이 거절
 * 
 * 주의:
 * - 템플릿 리터럴 타입은 "형식"을 보조할 뿐, 런타임에서 토큰 단위 검증까지 보장하지 않음
 * - 서버가 화이트리스트/방향 검증을 강제한다는 전제 하에 사용
 */
export type FavoritesCompositeSort =
    | `${FavoritesSortField}:${FavoritesSortDirection}`
    | `${FavoritesSortField}:${FavoritesSortDirection},${string}`

/**
 * FavoritesSort
 * 
 * 역할:
 * - 즐겨찾기 목록 정렬 파라미터의 최상위 타입(단일/복합 정렬을 모두 수용)
 */
export type FavoritesSort = FavoritesSimpleSort | FavoritesCompositeSort

/**
 * FavoritesQuery
 *
 * 역할/목적:
 * - 즐겨찾기 목록 조회 API(`/favorites`)의 요청 파라미터 모델
 * - UI 상태(page/size/sort)를 API 레이어에 전달할 때 사용하는 입력 계약
 *
 * 정책:
 * - 모든 필드는 optional이며, "미지정(undefined)"은 서버 기본 정책을 따르는 것을 의미
 * - page는 0-based 인덱스를 전제(Spring Data 페이지 규격)
 * - size는 과도한 값이 들어올 수 있으므로 API 레이어에서 상한 가능(클라이언트 안전장치/UX 목적)
 * 
 * 주의:
 * - 이 타입은 요청 형태를 정의할 뿐이며, 최종 검증/권한/정합성은 서버가 강제
 */
export type FavoritesQuery = {
    /**
     * 0-based 페이지 인덱스:
     * - 서버의 페이지네이션 규격(0부터 시작)을 따름
     */
    page?: number

    /**
     * 페이지당 항목 수:
     * - 서버/클라이언트 정책에 따라 상한이 적용 가능
     */
    size?: number

    /**
     * 정렬 규칙:
     * - 단일: "field" | "field,asc|desc"
     * - 복합: "field:asc,field2:desc"
     *
     * 포인트:
     * - UI에서 구성한 sort 문자열은 서버가 해석 가능한 문법이어야 함
     */
    sort?: FavoritesSort
}