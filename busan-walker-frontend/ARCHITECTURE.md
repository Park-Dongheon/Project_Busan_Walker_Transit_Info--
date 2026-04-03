# Busan Walker - 프로젝트 설계 문서

> 부산 관광지 탐색 웹 서비스 | MySQL 8.0 · Spring Boot · React 18 · TypeScript

---

## 목차

1. [기능 요구사항](#1-기능-요구사항)
2. [시스템 구성](#2-시스템-구성)
3. [화면 설계](#3-화면-설계)
4. [REST API 명세 목록](#4-rest-api-명세-목록)
5. [REST API 상세 명세](#5-rest-api-상세-명세)
6. [Data Base (DB) 설계](#6-data-base-db-설계)
7. [Table 명세](#7-table-명세)
8. [프론트엔드 기술 아키텍처](#8-프론트엔드-기술-아키텍처)

---

## 1. 기능 요구사항

### 1.1 비기능 요구사항

| 항목 | 내용 |
|------|------|
| 성능 | 관광지 목록 API 응답 시간 1초 이내 (bbox 필터 포함) |
| 보안 | JWT Access/Refresh Token 이중 인증, CSRF 토큰 검증, HttpOnly Cookie |
| 확장성 | 도메인 단위 코드 분리, 페이지 레벨 코드 스플리팅(lazy import) |
| 접근성 | ARIA 속성 적용, 키보드 포커스 가시화 |
| 지도 | 네이버 지도 SDK 기반 좌표/마커/오버레이 렌더링 |
| 데이터 적재 | 공공 데이터 CSV 기반 관광지·교통 접근 정보 대량 적재 |

### 1.2 기능 요구사항 목록

#### 관광지 탐색
| ID | 기능 | 설명 |
|----|------|------|
| F-01 | 관광지 목록 조회 | 페이지네이션, 키워드 검색, 정렬 지원 |
| F-02 | 지도 기반 탐색 | 네이버 지도 위 bbox 필터링으로 현재 지도 영역 관광지 표시 |
| F-03 | 관광지 상세 조회 | 기본 정보(명칭·주소·카테고리·스토리·키워드) + 대중교통 접근 정보 |
| F-04 | 대중교통 접근 정보 | 관광지별 버스·지하철 정류장, 거리(km/m), 도보 예상 시간(분) 표시 |
| F-05 | 교통 옵션 지도 표시 | 선택된 교통 수단 위치를 지도 마커/오버레이로 시각화 |

#### 회원 기능
| ID | 기능 | 설명 |
|----|------|------|
| F-10 | 회원가입 | 이메일·비밀번호·표시 이름 입력, 이메일 인증 후 활성화 |
| F-11 | 이메일 인증 | 가입 시 발송되는 인증 링크로 계정 활성화 |
| F-12 | 로그인 | 이메일/비밀번호 로그인, JWT Access + Refresh Token 발급 |
| F-13 | 로그아웃 | 서버 세션 및 Refresh Token 폐기 |
| F-14 | 토큰 자동 갱신 | 401 응답 시 Refresh Token으로 Access Token 자동 재발급 (Single-flight) |
| F-15 | 비밀번호 찾기 | 이메일로 재설정 링크 발송 |
| F-16 | 비밀번호 재설정 | 일회용 토큰 검증 후 새 비밀번호 설정 |
| F-17 | 소셜 로그인 | 네이버·카카오·구글·애플 OAuth2 연동 (DB 설계 기준) |

#### 내 계정 관리
| ID | 기능 | 설명 |
|----|------|------|
| F-20 | 내 정보 조회 | 이메일·표시 이름·역할·계정 상태 조회 |
| F-21 | 프로필 수정 | 표시 이름(displayName) 변경 |
| F-22 | 비밀번호 변경 | 현재 비밀번호 검증 후 새 비밀번호 저장 |
| F-23 | 계정 상태 변경 | 활성/비활성 전환 |

#### 즐겨찾기
| ID | 기능 | 설명 |
|----|------|------|
| F-30 | 즐겨찾기 추가 | 관광지를 즐겨찾기에 등록 (로그인 필요) |
| F-31 | 즐겨찾기 제거 | 등록된 즐겨찾기 삭제 (Optimistic Update) |
| F-32 | 즐겨찾기 목록 조회 | 사용자별 즐겨찾기 관광지 카드 목록, 정렬 지원 |
| F-33 | 즐겨찾기 존재 여부 확인 | 카드 UI의 토글 버튼 상태 동기화 |

#### 리뷰
| ID | 기능 | 설명 |
|----|------|------|
| F-40 | 리뷰 목록 조회 | 관광지별 리뷰 무한 스크롤 목록, 정렬(최신/평점순) |
| F-41 | 리뷰 작성 | 별점(1~5) + 본문 텍스트, 이미지 첨부 |
| F-42 | 리뷰 수정 | 작성자 본인만 수정 가능 |
| F-43 | 리뷰 삭제 | 작성자 본인만 삭제 가능 (탈퇴 후 콘텐츠 보존) |
| F-44 | 리뷰 좋아요 | 리뷰별 좋아요 토글 |
| F-45 | 댓글 조회 | 리뷰별 댓글/대댓글 무한 스크롤 |
| F-46 | 댓글 작성 | 리뷰에 댓글 또는 대댓글 작성 |
| F-47 | 댓글 삭제 | 작성자 본인만 삭제 가능 |

---

## 2. 시스템 구성

### 2.1 서비스 구조도

```
[사용자 브라우저]
        │
        ▼
[React SPA (Vite)]
 ├─ React Router v7 (페이지 라우팅)
 ├─ TanStack Query (서버 상태 캐싱)
 ├─ Axios (HTTP 클라이언트)
 ├─ Naver Maps SDK (지도 렌더링)
 └─ TailwindCSS (UI 스타일)
        │  HTTP/HTTPS (REST API)
        ▼
[Spring Boot 백엔드]
 ├─ 인증 API (/auth/*)
 ├─ 관광지 API (/attractions/*)
 ├─ 즐겨찾기 API (/favorites/*)
 ├─ 리뷰 API (/reviews/*)
 └─ 내 계정 API (/me/*)
        │  JDBC
        ▼
[MySQL 8.0.44 (busan_walker)]
 ├─ 관광지/교통 접근 (attractions, transit_access, transit_types)
 ├─ Geo 보조 테이블 (attractions_geo, transit_access_geo)
 ├─ 사용자/인증 (users, oauth_accounts, refresh_tokens, ...)
 └─ 상호작용 (user_favorites, attraction_reviews, ...)
```

[이미지: 시스템 전체 아키텍처 구성도]

### 2.2 기술 스택

| 구분 | 기술 | 버전/비고 |
|------|------|-----------|
| 언어 | TypeScript | 엄격 모드 |
| 프레임워크 | React | 18 |
| 빌드 | Vite | 페이지 레벨 코드 스플리팅 |
| 스타일 | TailwindCSS | utility-first |
| 라우터 | React Router | v7, createBrowserRouter |
| 서버 상태 | TanStack Query (React Query) | keepPreviousData, Optimistic Update |
| HTTP | Axios | 인터셉터 기반 JWT/CSRF 자동 주입 |
| 지도 SDK | Naver Maps API | 마커·오버레이·bbox |
| DB | MySQL | 8.0.44 |
| 인증 | JWT | Access Token (메모리) + Refresh Token (HttpOnly Cookie) |
| ORM | JPA/Hibernate | 백엔드 (Spring Boot) |

---

## 3. 화면 설계

### 3.1 사이트맵

```
/                       홈 페이지
├─ /attractions         관광지 소개 (목록/검색)
│   └─ /:keyId          관광지 상세
├─ /map                 지도 탐색
├─ /favorites           즐겨찾기 목록 (로그인 필요)
├─ /login               로그인
├─ /register            회원가입
├─ /forgot-password     비밀번호 찾기
├─ /reset-password      비밀번호 재설정 (토큰 포함)
├─ /auth/email-verify   이메일 인증 (토큰 포함)
├─ /access-denied       접근 거부 안내
└─ /my-account          내 계정 (로그인 필요)
```

### 3.2 화면 목록

| 화면 ID | 경로 | 화면명 | 인증 필요 |
|---------|------|--------|-----------|
| SCR-01 | `/` | 홈 | 불필요 |
| SCR-02 | `/attractions` | 관광지 소개 | 불필요 |
| SCR-03 | `/attractions/:keyId` | 관광지 상세 | 불필요 |
| SCR-04 | `/map` | 지도 탐색 | 불필요 |
| SCR-05 | `/favorites` | 즐겨찾기 목록 | 필요 (활성 계정) |
| SCR-06 | `/login` | 로그인 | 불필요 |
| SCR-07 | `/register` | 회원가입 | 불필요 |
| SCR-08 | `/forgot-password` | 비밀번호 찾기 | 불필요 |
| SCR-09 | `/reset-password` | 비밀번호 재설정 | 불필요 |
| SCR-10 | `/auth/email-verify` | 이메일 인증 | 불필요 |
| SCR-11 | `/access-denied` | 접근 거부 안내 | 불필요 |
| SCR-12 | `/my-account` | 내 계정 | 필요 (활성 계정) |

### 3.3 주요 화면 설명

#### SCR-02: 관광지 소개

[이미지: 관광지 소개 페이지 와이어프레임]

- **상단 히어로 배너**: 서비스 소개 문구, 키워드 검색 입력창
- **필터/정렬 바**: 정렬 기준 선택 (최신순, 이름순, 평점순)
- **관광지 카드 그리드**: 이미지·명칭·주소·평점·최단 교통 접근 요약 카드
- **페이지네이션**: 이전/다음 페이지 전환, 페이지 번호 표시

#### SCR-03: 관광지 상세

[이미지: 관광지 상세 페이지 와이어프레임]

- **상단 기본 정보 섹션**: 대표 이미지, 명칭, 주소, 카테고리
- **스토리 섹션**: 스토리 제목, 요약, 외부 링크, 핵심 키워드
- **대중교통 접근 정보 섹션**: 교통 수단별 정류장명·거리·도보 시간 목록
- **리뷰 섹션**: 평균 평점, 리뷰 카드 목록(무한 스크롤), 리뷰 작성 폼

#### SCR-04: 지도 탐색

[이미지: 지도 탐색 페이지 와이어프레임]

- **네이버 지도**: 현재 bbox 내 관광지 마커 렌더링
- **관광지 마커 클릭**: 우측 하단 교통 정보 패널 표시
- **교통 정보 패널**: 선택된 관광지의 교통 접근 옵션 목록, 내 위치 기준 도보 시간
- **교통 옵션 클릭**: 해당 시설 위치 마커 오버레이 표시

#### SCR-12: 내 계정

[이미지: 내 계정 페이지 와이어프레임]

- **계정 헤더**: 표시 이름, 이메일, 계정 역할/상태
- **기본 정보 섹션**: 표시 이름 수정 폼
- **비밀번호 섹션**: 현재 비밀번호 + 새 비밀번호 변경 폼
- **계정 상태 섹션**: 계정 비활성화 옵션

---

## 4. REST API 명세 목록

> Base URL: `/api/v1` | 인증: `Authorization: Bearer {accessToken}`

### 인증 (Auth)

| # | Method | Endpoint | 설명 | 인증 |
|---|--------|----------|------|------|
| 1 | GET | `/auth/csrf` | CSRF 토큰 쿠키 발급 | 불필요 |
| 2 | POST | `/auth/register` | 회원가입 | 불필요 |
| 3 | POST | `/auth/login` | 이메일/비밀번호 로그인 | 불필요 |
| 4 | POST | `/auth/logout` | 로그아웃 (Refresh Token 폐기) | 필요 |
| 5 | POST | `/auth/refresh` | Access Token 재발급 | 쿠키(Refresh) |
| 6 | POST | `/auth/email/verify` | 이메일 인증 토큰 확인 | 불필요 |
| 7 | POST | `/auth/email/resend` | 인증 메일 재발송 | 불필요 |
| 8 | POST | `/auth/password/reset-request` | 비밀번호 재설정 메일 발송 | 불필요 |
| 9 | POST | `/auth/password/reset-confirm` | 비밀번호 재설정 확인 | 불필요 |

### 관광지 (Attractions)

| # | Method | Endpoint | 설명 | 인증 |
|---|--------|----------|------|------|
| 10 | GET | `/attractions` | 관광지 목록 조회 (페이징·키워드·bbox·정렬) | 불필요 |
| 11 | GET | `/attractions/{keyId}` | 관광지 상세 조회 (교통 접근 옵션 포함) | 불필요 |

### 즐겨찾기 (Favorites)

| # | Method | Endpoint | 설명 | 인증 |
|---|--------|----------|------|------|
| 12 | GET | `/favorites` | 내 즐겨찾기 목록 조회 (페이징·정렬) | 필요 |
| 13 | GET | `/favorites/{keyId}/exists` | 특정 관광지 즐겨찾기 존재 여부 확인 | 필요 |
| 14 | POST | `/favorites` | 즐겨찾기 추가 | 필요 |
| 15 | DELETE | `/favorites/{keyId}` | 즐겨찾기 제거 | 필요 |

### 리뷰 (Reviews)

| # | Method | Endpoint | 설명 | 인증 |
|---|--------|----------|------|------|
| 16 | GET | `/reviews` | 관광지별 리뷰 목록 조회 (무한 스크롤) | 불필요 |
| 17 | GET | `/reviews/{reviewId}` | 리뷰 단건 상세 조회 | 불필요 |
| 18 | POST | `/reviews` | 리뷰 작성 | 필요 |
| 19 | PUT | `/reviews/{reviewId}` | 리뷰 수정 | 필요 |
| 20 | DELETE | `/reviews/{reviewId}` | 리뷰 삭제 | 필요 |
| 21 | POST | `/reviews/{reviewId}/likes` | 리뷰 좋아요 | 필요 |
| 22 | DELETE | `/reviews/{reviewId}/likes` | 리뷰 좋아요 취소 | 필요 |
| 23 | GET | `/reviews/{reviewId}/comments` | 댓글 목록 조회 (무한 스크롤) | 불필요 |
| 24 | POST | `/reviews/{reviewId}/comments` | 댓글/대댓글 작성 | 필요 |
| 25 | DELETE | `/reviews/{reviewId}/comments/{commentId}` | 댓글 삭제 | 필요 |

### 내 계정 (My Account)

| # | Method | Endpoint | 설명 | 인증 |
|---|--------|----------|------|------|
| 26 | GET | `/me` | 내 계정 정보 조회 | 필요 |
| 27 | PATCH | `/me` | 프로필(표시 이름) 수정 | 필요 |
| 28 | POST | `/me/password` | 비밀번호 변경 | 필요 |
| 29 | PATCH | `/me/status` | 계정 상태 변경 (활성/비활성) | 필요 |

---

## 5. REST API 상세 명세

### 5-1. GET `/auth/csrf`

**목적**: CSRF 토큰 쿠키 발급 (POST unsafe 요청 전 선행 호출)

| 항목 | 내용 |
|------|------|
| 요청 헤더 | 없음 |
| 요청 Body | 없음 |
| 응답 코드 | `200 OK` |
| 응답 Body | 없음 (Set-Cookie로 CSRF 토큰 전달) |

---

### 5-2. POST `/auth/register`

**목적**: 신규 회원가입 (이메일 인증 메일 발송)

**요청 Body**
```json
{
  "email": "user@example.com",
  "password": "P@ssw0rd!",
  "displayName": "홍길동"
}
```

| 응답 코드 | 설명 |
|-----------|------|
| `201 Created` | 가입 성공, 인증 메일 발송 |
| `409 Conflict` | 이미 등록된 이메일 |
| `422 Unprocessable Entity` | 입력값 검증 오류 (비밀번호 정책 등) |

---

### 5-3. POST `/auth/login`

**목적**: 이메일/비밀번호 로그인, JWT 토큰 발급

**요청 Body**
```json
{
  "email": "user@example.com",
  "password": "P@ssw0rd!"
}
```

**응답 Body (200 OK)**
```json
{
  "accessToken": "eyJhbGci...",
  "tokenType": "Bearer"
}
```

| 응답 코드 | 설명 |
|-----------|------|
| `200 OK` | 로그인 성공, Refresh Token은 HttpOnly Cookie로 설정 |
| `401 Unauthorized` | 이메일 또는 비밀번호 불일치 |
| `403 Forbidden` | 이메일 미인증 또는 비활성 계정 |

---

### 5-4. POST `/auth/logout`

**목적**: 서버 세션 종료 및 Refresh Token 폐기

| 항목 | 내용 |
|------|------|
| 요청 헤더 | `Authorization: Bearer {accessToken}` |
| 요청 Body | 없음 |
| 응답 코드 | `204 No Content` |

---

### 5-5. POST `/auth/refresh`

**목적**: Access Token 재발급 (Single-flight, CSRF 검증)

| 항목 | 내용 |
|------|------|
| 요청 헤더 | `X-CSRF-Token: {csrfToken}` |
| 요청 쿠키 | `refreshToken={token}` (HttpOnly) |
| 응답 Body | `{ "accessToken": "..." }` |

| 응답 코드 | 설명 |
|-----------|------|
| `200 OK` | 재발급 성공 |
| `401 Unauthorized` | Refresh Token 만료 또는 폐기 |
| `403 Forbidden` | CSRF_INVALID (CSRF 토큰 불일치) |

---

### 5-6. POST `/auth/email/verify`

**목적**: 이메일 인증 토큰 확인으로 계정 활성화

**요청 Body**
```json
{ "token": "uuid-token-string" }
```

| 응답 코드 | 설명 |
|-----------|------|
| `200 OK` | 인증 성공, 계정 활성화 |
| `400 Bad Request` | 토큰 만료 또는 이미 사용된 토큰 |

---

### 5-7. POST `/auth/email/resend`

**목적**: 이메일 인증 메일 재발송

**요청 Body**
```json
{ "email": "user@example.com" }
```

---

### 5-8. POST `/auth/password/reset-request`

**목적**: 비밀번호 재설정 링크 메일 발송

**요청 Body**
```json
{ "email": "user@example.com" }
```

| 응답 코드 | 설명 |
|-----------|------|
| `200 OK` | 발송 성공 (미가입 이메일도 동일 응답 — 계정 존재 여부 노출 방지) |

---

### 5-9. POST `/auth/password/reset-confirm`

**목적**: 일회용 토큰 검증 후 비밀번호 재설정

**요청 Body**
```json
{
  "token": "reset-uuid-token",
  "newPassword": "NewP@ss1!"
}
```

---

### 5-10. GET `/attractions`

**목적**: 관광지 목록 조회 (페이징, bbox 필터, 키워드 검색, 정렬)

**쿼리 파라미터**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `page` | integer | 아니오 | 페이지 번호 (0-based, 기본값 0) |
| `size` | integer | 아니오 | 페이지 크기 (최대 200, 기본값 서버 정책) |
| `sort` | string | 아니오 | 정렬 규칙 (`field,asc\|desc`) |
| `keyword` | string | 아니오 | 키워드 검색 (명칭·주소·키워드 풀텍스트) |
| `bbox` | string | 아니오 | 지도 영역 필터 (`"south,west,north,east"`) |

**응답 Body (200 OK)**
```json
{
  "content": [
    {
      "keyId": "TRRSRT_000001",
      "placeName": "해운대 해수욕장",
      "address": "부산광역시 해운대구 해운대해변로",
      "imageUrl": "https://...",
      "latitude": 35.1588,
      "longitude": 129.1603,
      "reviewCount": 42,
      "avgRating": 4.3,
      "totalAccess": 5,
      "nearestModeCode": "b",
      "nearestModeName": "버스",
      "nearestDistanceM": 120.5,
      "nearestDistanceKm": 0.121,
      "nearestWalkMin": 2
    }
  ],
  "totalElements": 500,
  "totalPages": 25,
  "page": 0,
  "size": 20
}
```

---

### 5-11. GET `/attractions/{keyId}`

**목적**: 관광지 상세 조회 (대중교통 접근 정보 포함)

**경로 파라미터**: `keyId` — 관광지 고유 키 (encodeURIComponent 적용)

**응답 Body (200 OK)**
```json
{
  "keyId": "TRRSRT_000001",
  "placeName": "해운대 해수욕장",
  "address": "부산광역시 해운대구 해운대해변로",
  "imageUrl": "https://...",
  "latitude": 35.1588,
  "longitude": 129.1603,
  "categoryName": "해수욕장",
  "storyTitle": "부산의 대표 해변",
  "storySummary": "...",
  "storyUrl": "https://...",
  "coreKeywords": "해수욕, 모래사장, 야경",
  "transitOptions": [
    {
      "accessNo": "100001",
      "modeCode": "b",
      "modeName": "버스",
      "transitClassName": "시내버스",
      "facilityName": "해운대해수욕장(정류장)",
      "busStopNo": "07-140",
      "entranceName": null,
      "facilityAddress": "부산 해운대구 해운대해변로",
      "distanceKm": 0.121,
      "distanceM": 120.5,
      "rawDistanceM": 120.5,
      "distanceSource": "GEO",
      "facilityLat": 35.1590,
      "facilityLon": 129.1610,
      "facilityHasCoord": true,
      "walkMin": 2
    }
  ]
}
```

---

### 5-12. GET `/favorites`

**목적**: 내 즐겨찾기 관광지 목록 조회

**쿼리 파라미터**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `page` | integer | 페이지 번호 (0-based) |
| `size` | integer | 페이지 크기 |
| `sort` | string | 정렬 규칙 |

**응답 Body**: `PageResp<AttractionCard>` (관광지 목록과 동일한 카드 구조)

---

### 5-13. GET `/favorites/{keyId}/exists`

**목적**: 특정 관광지 즐겨찾기 등록 여부 확인

**응답 Body (200 OK)**
```json
{ "exists": true }
```

---

### 5-14. POST `/favorites`

**목적**: 즐겨찾기 추가

**요청 Body**
```json
{ "keyId": "TRRSRT_000001" }
```

| 응답 코드 | 설명 |
|-----------|------|
| `201 Created` | 추가 성공 |
| `409 Conflict` | 이미 등록된 즐겨찾기 |

---

### 5-15. DELETE `/favorites/{keyId}`

**목적**: 즐겨찾기 제거

| 응답 코드 | 설명 |
|-----------|------|
| `204 No Content` | 제거 성공 |
| `404 Not Found` | 등록되지 않은 즐겨찾기 |

---

### 5-16. GET `/reviews`

**목적**: 관광지별 리뷰 목록 조회 (무한 스크롤)

**쿼리 파라미터**

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `keyId` | string | 관광지 키 (필수) |
| `page` | integer | 페이지 번호 |
| `size` | integer | 페이지 크기 |
| `sort` | string | 정렬 (`createdAt,desc` 등) |

---

### 5-18. POST `/reviews`

**목적**: 리뷰 작성

**요청 Body**
```json
{
  "keyId": "TRRSRT_000001",
  "rating": 5,
  "body": "정말 멋진 곳입니다!",
  "imageUrls": ["https://..."]
}
```

---

### 5-21. POST `/reviews/{reviewId}/likes`

| 응답 코드 | 설명 |
|-----------|------|
| `201 Created` | 좋아요 성공 |
| `409 Conflict` | 이미 좋아요 등록됨 |

---

### 5-24. POST `/reviews/{reviewId}/comments`

**목적**: 댓글 또는 대댓글 작성

**요청 Body**
```json
{
  "body": "좋은 리뷰 감사합니다.",
  "parentCommentId": null
}
```

---

### 5-26. GET `/me`

**응답 Body (200 OK)**
```json
{
  "id": 1,
  "email": "user@example.com",
  "displayName": "홍길동",
  "role": "MEMBER",
  "isActive": true,
  "status": "ACTIVE",
  "emailVerifiedAt": "2025-01-01T00:00:00Z"
}
```

---

### 5-27. PATCH `/me`

**요청 Body**
```json
{ "displayName": "새이름" }
```

---

### 5-28. POST `/me/password`

**요청 Body**
```json
{
  "currentPassword": "OldP@ss1!",
  "newPassword": "NewP@ss1!"
}
```

| 응답 코드 | 설명 |
|-----------|------|
| `204 No Content` | 변경 성공 |
| `400 Bad Request` | 현재 비밀번호 불일치 또는 정책 위반 |

---

### 5-29. PATCH `/me/status`

**요청 Body**
```json
{ "status": "DISABLED_BY_USER" }
```

---

## 6. Data Base (DB) 설계

### 6.1 데이터베이스 개요

| 항목 | 내용 |
|------|------|
| DBMS | MySQL 8.0.44 |
| 스키마 | `busan_walker` |
| 문자셋 | `utf8mb4` / `utf8mb4_0900_ai_ci` |
| 시간대 | `+09:00 (KST)` |

### 6.2 테이블 그룹

| 그룹 | 테이블 | 설명 |
|------|--------|------|
| 관광지/교통 | `attractions`, `transit_types`, `transit_access` | 공공데이터 CSV 원본 기반 |
| Geo 보조 | `attractions_geo`, `transit_access_geo` | SPATIAL 인덱스 전용 파생 테이블 |
| 교통 요약 | `attraction_transit_summary` | 최단 접근 수단 물리화 |
| 사용자/인증 | `users`, `oauth_accounts`, `refresh_tokens`, `email_verifications`, `password_resets` | 계정·인증 |
| 상호작용 | `user_favorites`, `attraction_likes`, `attraction_reviews`, `review_images`, `review_comments`, `review_likes`, `comment_likes` | 즐겨찾기·리뷰·좋아요 |
| 통계 | `attraction_review_stats`, `review_reaction_stats`, `attraction_engagement_stats` | 조회 성능 물리화 |

### 6.3 ERD 관계 요약

[이미지: 전체 ERD 다이어그램]

```
attractions (1) ──< transit_access (N)     교통 접근 정보
transit_types (1) ──< transit_access (N)  교통수단 코드

attractions (1) ──< attractions_geo (1)   공간 인덱스 보조
transit_access (1) ──< transit_access_geo (1)

attractions (1) ──< attraction_transit_summary (1)  최단 접근 요약

users (1) ──< refresh_tokens (N)
users (1) ──< oauth_accounts (N)
users (1) ──< email_verifications (N)
users (1) ──< password_resets (N)

users (N) >──< attractions  (via user_favorites)    즐겨찾기
users (N) >──< attractions  (via attraction_likes)  관광지 좋아요
users (1) ──< attraction_reviews (N)
attraction_reviews (1) ──< review_images (N)
attraction_reviews (1) ──< review_comments (N)
review_comments (1) ──< review_comments (N)         대댓글 self-ref

attractions (1) ──< attraction_review_stats (1)
attraction_reviews (1) ──< review_reaction_stats (1)
attractions (1) ──< attraction_engagement_stats (1)
```

### 6.4 거리 산출 정책

- `distance_m`: 적재 시 확정 저장 (런타임 반복 계산 회피)
  - 좌표가 있으면 `ST_Distance_Sphere()` 계산 → `distance_source = 'GEO'`
  - 좌표 없으면 CSV 원본 `DSTNC_VALUE` 사용 → `distance_source = 'RAW'`
- `distance_km`: `ROUND(distance_m / 1000, 3)` — VIRTUAL 생성열 (저장 없음)
- 도보 시간: `CEILING(distance_m / 75.0)` — `meters_to_walk_minutes()` 함수

---

## 7. Table 명세

### 7-1. attractions (관광지 마스터)

| 컬럼명 | 타입 | NULL | 기본값 | 설명 |
|--------|------|------|--------|------|
| `keyid` | VARCHAR(64) | NOT NULL | — | 관광지 고유 키 (PK, 원본 KEYID) |
| `ctprvn_nm` | VARCHAR(32) | NULL | — | 시/도 |
| `signgu_nm` | VARCHAR(32) | NULL | — | 시/군/구 |
| `emd_nm` | VARCHAR(32) | NULL | — | 읍/면/동 |
| `place_name` | VARCHAR(200) | NOT NULL | — | 관광지명 |
| `address` | VARCHAR(300) | NULL | — | 주소 |
| `image_url` | VARCHAR(512) | NULL | — | 대표 이미지 URL |
| `latitude` | DECIMAL(10,7) | NULL | — | 위도 (WGS84) |
| `longitude` | DECIMAL(10,7) | NULL | — | 경도 (WGS84) |
| `has_coord` | TINYINT UNSIGNED | STORED | 생성열 | 좌표 보유 여부 (1/0) |
| `category_name` | VARCHAR(80) | NULL | — | 분류명 |
| `story_title` | VARCHAR(200) | NULL | — | 스토리 제목 |
| `story_summary` | TEXT | NULL | — | 스토리 요약 |
| `story_url` | VARCHAR(500) | NULL | — | 스토리 URL |
| `core_keywords` | TEXT | NULL | — | 핵심 키워드 |
| `created_at` | TIMESTAMP(6) | NOT NULL | CURRENT_TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP(6) | NOT NULL | CURRENT_TIMESTAMP | 수정 시각 |

**인덱스**: PK(keyid), idx_place_name, idx_region(ctprvn/signgu/emd), idx_has_coord_lat_lon, FULLTEXT(place_name·address·keywords·story)

---

### 7-2. transit_types (교통수단 코드 마스터)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `code` | VARCHAR(8) | NOT NULL | 교통수단 코드 (PK, 예: b, s1, s2) |
| `data_no` | SMALLINT UNSIGNED | NOT NULL | 원본 일련번호 (UNIQUE) |
| `name` | VARCHAR(40) | NOT NULL | 표시명 (예: 버스, 지하철 1호선) |
| `created_at` | TIMESTAMP(6) | NOT NULL | 생성 시각 |
| `updated_at` | TIMESTAMP(6) | NOT NULL | 수정 시각 |

---

### 7-3. transit_access (관광지 접근정보)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `access_no` | BIGINT | NOT NULL | 접근정보 고유 키 (PK) |
| `keyid` | VARCHAR(64) | NOT NULL | 관광지 FK |
| `transport_code` | VARCHAR(8) | NOT NULL | 교통수단 코드 FK |
| `pbtrnsp_cl_nm` | VARCHAR(80) | NULL | 대중교통 구분 |
| `facility_name` | VARCHAR(200) | NULL | 시설명 (정류장·역명) |
| `bus_stop_no` | VARCHAR(40) | NULL | 정류소 번호 |
| `entrance_name` | VARCHAR(120) | NULL | 출입구명 |
| `facility_address` | VARCHAR(300) | NULL | 시설 주소 |
| `facility_lat` | DECIMAL(10,7) | NULL | 시설 위도 |
| `facility_lon` | DECIMAL(10,7) | NULL | 시설 경도 |
| `facility_has_coord` | TINYINT UNSIGNED | STORED | 시설 좌표 보유 (1/0) |
| `raw_distance_m` | DOUBLE | NULL | CSV 원본 거리(m) |
| `distance_m` | DOUBLE | NOT NULL | 서비스 기준 거리(m) — 적재 확정 |
| `distance_source` | ENUM('GEO','RAW') | NOT NULL | 거리 산출 출처 |
| `distance_km` | DECIMAL(10,3) | VIRTUAL | 서비스 응답용 거리(km) |
| `created_at` | TIMESTAMP(6) | NOT NULL | 생성 시각 |
| `updated_at` | TIMESTAMP(6) | NOT NULL | 수정 시각 |

**인덱스**: PK(access_no), idx_keyid_dist(keyid,distance_m,access_no), idx_keyid_mode_dist(keyid,transport_code,distance_m)

---

### 7-4. attractions_geo (공간검색 보조)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `keyid` | VARCHAR(64) | NOT NULL | 관광지 FK (PK) |
| `latitude` | DECIMAL(10,7) | NOT NULL | 위도 |
| `longitude` | DECIMAL(10,7) | NOT NULL | 경도 |
| `place_point` | POINT SRID 4326 | NOT NULL | 공간 지오메트리 |
| `created_at` | TIMESTAMP(6) | NOT NULL | 생성 시각 |
| `updated_at` | TIMESTAMP(6) | NOT NULL | 수정 시각 |

**인덱스**: SPATIAL(place_point), idx_lat_lon

> 좌표 보유 관광지만 적재. `sp_refresh_geo_tables()`로 원본 기반 재생성 가능.

---

### 7-5. transit_access_geo (시설 공간검색 보조)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `access_no` | BIGINT | NOT NULL | 접근정보 FK (PK) |
| `keyid` | VARCHAR(64) | NOT NULL | 관광지 FK |
| `transport_code` | VARCHAR(8) | NOT NULL | 교통수단 코드 FK |
| `facility_lat` | DECIMAL(10,7) | NOT NULL | 시설 위도 |
| `facility_lon` | DECIMAL(10,7) | NOT NULL | 시설 경도 |
| `facility_point` | POINT SRID 4326 | NOT NULL | 공간 지오메트리 |

**인덱스**: SPATIAL(facility_point), idx_keyid, idx_keyid_mode

---

### 7-6. attraction_transit_summary (교통 접근성 요약)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `keyid` | VARCHAR(64) | NOT NULL | 관광지 FK (PK) |
| `total_transit_count` | INT UNSIGNED | NOT NULL | 전체 접근 수단 수 |
| `nearest_distance_m` | DOUBLE | NULL | 최단 거리(m) |
| `nearest_access_no` | BIGINT | NULL | 최단 접근 번호 |
| `nearest_transport_code` | VARCHAR(8) | NULL | 최단 교통수단 코드 |
| `refreshed_at` | TIMESTAMP(6) | NOT NULL | 마지막 갱신 시각 |

> `sp_refresh_transit_summary()`로 원본 기반 재생성. 목록/카드 응답에서 JOIN 없이 즉시 제공.

---

### 7-7. users (사용자)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | 사용자 PK (AUTO_INCREMENT) |
| `email` | VARCHAR(191) | NOT NULL | 이메일 (UNIQUE) |
| `password_hash` | VARCHAR(255) | NULL | 비밀번호 해시 (소셜 전용 계정은 NULL) |
| `display_name` | VARCHAR(80) | NOT NULL | 표시 이름 |
| `role` | ENUM('ADMIN','MEMBER') | NOT NULL | 역할 |
| `email_verified_at` | TIMESTAMP(6) | NULL | 이메일 인증 시각 |
| `is_active` | TINYINT | NOT NULL | 활성 여부 (0: 비활성, 1: 활성) |
| `status` | ENUM('ACTIVE','DISABLED_BY_USER','DISABLED_BY_ADMIN') | NOT NULL | 계정 상태 |
| `created_at` | TIMESTAMP(6) | NOT NULL | 생성 시각 |
| `updated_at` | TIMESTAMP(6) | NOT NULL | 수정 시각 |

---

### 7-8. oauth_accounts (OAuth2 연동 계정)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `user_id` | BIGINT UNSIGNED | NOT NULL | users FK |
| `provider` | ENUM('NAVER','KAKAO','GOOGLE','APPLE') | NOT NULL | OAuth2 제공자 |
| `provider_user_id` | VARCHAR(191) | NOT NULL | 제공자 내 사용자 ID |
| `email` | VARCHAR(191) | NULL | 제공자 계정 이메일 |
| `profile_name` | VARCHAR(120) | NULL | 제공자 프로필 이름 |
| `avatar_url` | VARCHAR(512) | NULL | 프로필 이미지 URL |

**UNIQUE**: (provider, provider_user_id)

---

### 7-9. refresh_tokens (JWT Refresh Token)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `user_id` | BIGINT UNSIGNED | NOT NULL | users FK |
| `jti` | BINARY(16) | NOT NULL | 토큰 단위 식별자 (UUID bytes) |
| `token_hash` | BINARY(32) | NOT NULL | 토큰 해시 (원문 미저장) |
| `issued_at` | TIMESTAMP(6) | NOT NULL | 발급 시각 |
| `expires_at` | TIMESTAMP(6) | NOT NULL | 만료 시각 |
| `consumed_at` | TIMESTAMP(6) | NULL | 사용(갱신) 시각 |
| `revoked_at` | TIMESTAMP(6) | NULL | 폐기 시각 |
| `ip_address` | VARBINARY(16) | NULL | 발급 IP (IPv4/IPv6) |
| `user_agent` | VARCHAR(255) | NULL | 발급 User-Agent |

---

### 7-10. email_verifications (이메일 인증 토큰)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `user_id` | BIGINT UNSIGNED | NOT NULL | users FK |
| `purpose` | ENUM('SIGNUP','CHANGE_EMAIL') | NOT NULL | 인증 목적 |
| `token_hash` | BINARY(32) | NOT NULL | 토큰 해시 |
| `expires_at` | TIMESTAMP(6) | NOT NULL | 만료 시각 |
| `consumed_at` | TIMESTAMP(6) | NULL | 사용 시각 |

---

### 7-11. password_resets (비밀번호 재설정 토큰)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `user_id` | BIGINT UNSIGNED | NOT NULL | users FK |
| `token_hash` | BINARY(32) | NOT NULL | 토큰 해시 (일회용) |
| `expires_at` | TIMESTAMP(6) | NOT NULL | 만료 시각 |
| `consumed_at` | TIMESTAMP(6) | NULL | 사용 시각 |

---

### 7-12. user_favorites (즐겨찾기)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `user_id` | BIGINT UNSIGNED | NOT NULL | users FK (복합 PK) |
| `keyid` | VARCHAR(64) | NOT NULL | attractions FK (복합 PK) |
| `created_at` | TIMESTAMP(6) | NOT NULL | 등록 시각 |

**PK**: (user_id, keyid)

---

### 7-13. attraction_likes (관광지 좋아요)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `user_id` | BIGINT UNSIGNED | NOT NULL | users FK (복합 PK) |
| `keyid` | VARCHAR(64) | NOT NULL | attractions FK (복합 PK) |
| `created_at` | TIMESTAMP(6) | NOT NULL | 등록 시각 |

---

### 7-14. attraction_reviews (리뷰)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `keyid` | VARCHAR(64) | NOT NULL | attractions FK |
| `user_id` | BIGINT UNSIGNED | NULL | users FK (탈퇴 시 NULL) |
| `author_name_snapshot` | VARCHAR(80) | NULL | 작성 시점 이름 스냅샷 |
| `rating` | TINYINT UNSIGNED | NOT NULL | 별점 (1~5) |
| `body` | TEXT | NOT NULL | 리뷰 본문 |
| `is_hidden` | TINYINT | NOT NULL | 숨김 여부 (신고/관리자) |
| `created_at` | TIMESTAMP(6) | NOT NULL | 작성 시각 |
| `updated_at` | TIMESTAMP(6) | NOT NULL | 수정 시각 |

---

### 7-15. review_images (리뷰 이미지)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `review_id` | BIGINT UNSIGNED | NOT NULL | attraction_reviews FK |
| `image_url` | VARCHAR(500) | NOT NULL | 이미지 URL |
| `sort_order` | INT UNSIGNED | NOT NULL | 표시 순서 |

---

### 7-16. review_comments (댓글/대댓글)

| 컬럼명 | 타입 | NULL | 설명 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | NOT NULL | PK |
| `review_id` | BIGINT UNSIGNED | NOT NULL | attraction_reviews FK |
| `parent_comment_id` | BIGINT UNSIGNED | NULL | 부모 댓글 FK (self-ref, 대댓글) |
| `user_id` | BIGINT UNSIGNED | NULL | users FK (탈퇴 시 NULL) |
| `author_name_snapshot` | VARCHAR(80) | NULL | 작성 시점 이름 |
| `body` | TEXT | NOT NULL | 댓글 본문 |
| `is_hidden` | TINYINT | NOT NULL | 숨김 여부 |

---

### 7-17. review_likes (리뷰 좋아요)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `review_id` | BIGINT UNSIGNED | attraction_reviews FK (복합 PK) |
| `user_id` | BIGINT UNSIGNED | users FK (복합 PK) |
| `created_at` | TIMESTAMP(6) | 등록 시각 |

---

### 7-18. comment_likes (댓글 좋아요)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `comment_id` | BIGINT UNSIGNED | review_comments FK (복합 PK) |
| `user_id` | BIGINT UNSIGNED | users FK (복합 PK) |
| `created_at` | TIMESTAMP(6) | 등록 시각 |

---

### 7-19. attraction_review_stats (관광지 리뷰 통계)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `keyid` | VARCHAR(64) | attractions FK (PK) |
| `review_count` | INT UNSIGNED | 리뷰 수 |
| `rating_sum` | BIGINT UNSIGNED | 별점 합계 |
| `latest_review_at` | TIMESTAMP(6) | 최신 리뷰 시각 |
| `avg_rating` | DECIMAL(3,2) | 평균 별점 (STORED 생성열) |

> 트리거 증분 갱신 + `sp_refresh_review_stats()` 제공

---

### 7-20. review_reaction_stats (리뷰 반응 통계)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `review_id` | BIGINT UNSIGNED | attraction_reviews FK (PK) |
| `like_count` | INT UNSIGNED | 좋아요 수 |
| `comment_count` | INT UNSIGNED | 댓글 수 |

---

### 7-21. attraction_engagement_stats (관광지 참여 통계)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `keyid` | VARCHAR(64) | attractions FK (PK) |
| `favorite_count` | INT UNSIGNED | 즐겨찾기 수 |
| `like_count` | INT UNSIGNED | 좋아요 수 |

---

## 8. 프론트엔드 기술 아키텍처

### 목표
- 도메인 경계를 명확히 하고, import 경로를 일관된 배럴 형태로 관리
- 타입 노출 규칙을 고정해 외부에서 예측 가능한 API를 제공

### 디렉터리 개요

| 경로 | 역할 |
|------|------|
| `src/app` | 앱 전역 설정 (라우팅, 쿼리, 네비게이션 등) |
| `src/pages` | 라우트 단위 페이지 |
| `src/domains` | 도메인 단위 기능 모음 |
| `src/components` | 도메인에 속하지 않는 공통 UI |
| `src/services` | 외부 API/SDK 연동 |
| `src/utils` | 범용 유틸 |
| `src/types` | 전역 타입 |
| `src/styles` | 전역 스타일 |

### 도메인 구조
각 도메인은 다음 레이어를 필요에 따라 가진다.

| 레이어 | 역할 |
|--------|------|
| `api` | 서버 통신 / React Query 훅 |
| `model` | 상태·훅·도메인 로직 |
| `ui` | 도메인 UI 컴포넌트 |
| `lib` | 도메인 유틸·순수 함수 |
| `types` | 외부 노출용 타입 (type-only export) |

### 도메인 루트 `index.ts` 규칙

```ts
export * from "./types"
export * as api from "./api"
export * as ui from "./ui"
export * as model from "./model"
export * as lib from "./lib"
```

### 타입 노출 규칙
- 도메인 밖에서 쓰이는 타입은 `types/index.ts`에서 `export type`으로 재노출
- 타입이 `api/ui/model/lib`에 정의돼 있더라도, 외부 노출이 필요하면 `types`에서 재노출
- `types`는 런타임 의존을 만들지 않도록 **type-only**로 유지

### Import 규칙
- 내부 import는 항상 alias `@/` 사용 (`tsconfig.app.json`의 `@/* → src/*`)
- 도메인 외부에서 접근할 때는 루트 배럴만 사용

```ts
import { api as reviewApi, ui as reviewUi } from "@/domains/review"
import type { ReviewCardResponse } from "@/domains/review"

const list = reviewApi.useInfiniteReviewList(...)
return <reviewUi.ReviewList items={...} />
```

- 순환 의존 문제가 생길 경우에만 레이어 배럴(`@/domains/<domain>/<layer>`)로 국소적으로 완화

### ESLint 규칙
- 도메인 외부(`src/domains` 이외)에서는 `@/domains/<domain>` 루트 배럴만 허용
- 타입 전용 import는 반드시 `import type`을 사용
- 도메인 내부에서는 필요 시 레이어 배럴(`@/domains/<domain>/<layer>`) 사용 허용
