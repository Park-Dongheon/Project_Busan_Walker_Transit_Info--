# Busan Walker — 부산 관광지 대중교통 접근성 안내 서비스

> 관광지 + 대중교통 접근성 데이터를 결합하여, 사용자에게 최적 이동 옵션을 제공하는 지도 기반 풀스택 웹 서비스

<p align="center">
  <img src="https://github.com/Park-Dongheon/--Project_Busan_Walker_Transit_Info/releases/download/v1.0.0/Home_Animation.gif" alt="서비스 메인 화면" width="800"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/Spring Boot-3-6DB33F?style=flat-square&logo=springboot&logoColor=white"/>
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white"/>
  <img src="https://img.shields.io/badge/AWS-S3%20%2B%20CloudFront-FF9900?style=flat-square&logo=amazonaws&logoColor=white"/>
</p>

---

## 목차

1. [프로젝트 소개](#-프로젝트-소개)
2. [주요 기능](#-주요-기능)
3. [기술 스택](#-기술-스택)
4. [시스템 아키텍처](#-시스템-아키텍처)
5. [핵심 설계 결정](#-핵심-설계-결정)
6. [DB 설계](#-db-설계)
7. [프론트엔드 구조](#-프론트엔드-구조)
8. [설치 및 실행](#-설치-및-실행)

---

## 프로젝트 소개

부산 지역 관광지 **40곳**의 대중교통 접근 정보 **983건**을 공공데이터와 연계하여, 지도 위에서 관광지를 탐색하고 버스·지하철·도보 이동 옵션을 한눈에 비교할 수 있는 웹 서비스입니다.

훈련 과정에서 팀 프로젝트로 진행한 결과물을 **풀스택으로 개인 재설계·재구현**하였습니다.

| 항목 | 내용 |
|------|------|
| 개발 기간 | 2024년 (훈련 프로젝트) → 2026년 (개인 재설계·재구현) |
| 원본 팀 구성 | 2인 (프론트엔드 1, 백엔드 1) |
| 재구현 담당 | 풀스택 개인 (박동헌) |

---

## 주요 기능

### 지도 기반 관광지 탐색

<p align="center">
  <img src="https://github.com/Park-Dongheon/--Project_Busan_Walker_Transit_Info/releases/download/v1.0.0/Map_Page_Animation.gif" alt="지도 탐색 시연" width="800"/>
</p>

Naver Maps API를 활용하여 관광지 마커를 지도 위에 표시합니다. 마커 클릭 시 해당 관광지의 교통 접근 정보 패널이 슬라이드로 열리며, 사용자의 현재 위치 기준으로 거리순 정렬이 적용됩니다.

---

### 관광지 상세 및 교통 접근 정보

<p align="center">
  <img src="https://github.com/Park-Dongheon/--Project_Busan_Walker_Transit_Info/releases/download/v1.0.0/Attraction_Detail_Page_Animation.gif" alt="관광지 상세 및 교통 패널 시연" width="800"/>
</p>

버스·지하철·도보 수단별로 필터링하며, 거리 기준으로 정렬된 최대 6개 접근 옵션을 제공합니다. 정보 과부하를 방지하기 위해 표시 개수를 의도적으로 제한했습니다.

**프론트엔드 3단계 데이터 파이프라인**으로 UI 렌더링 모델과 서버 원본 데이터를 분리합니다.

```
MapTransitOption          ← 서버 원본 데이터 (정규화된 사실)
       │
       ▼
ResolvedTransitOption     ← 거리 계산, 정렬, 가공 (런타임 파생)
       │
       ▼
TransitOptionPanelItem    ← UI 렌더링용 모델 (표시 포맷 변환)
```

---

### 즐겨찾기

<p align="center">
  <img src="https://github.com/Park-Dongheon/--Project_Busan_Walker_Transit_Info/releases/download/v1.0.0/Favorite_Page_Animation.gif" alt="즐겨찾기 시연" width="800"/>
</p>

관심 관광지를 즐겨찾기에 추가·제거할 수 있습니다. TanStack Query **Optimistic Update**를 적용하여 서버 응답 전에도 UI가 즉시 반응하며, 실패 시 자동으로 롤백됩니다.

---

### 리뷰

<p align="center">
  <img src="https://github.com/Park-Dongheon/--Project_Busan_Walker_Transit_Info/releases/download/v1.0.0/Review_Page_Animation.gif" alt="리뷰 시연" width="800"/>
</p>

관광지에 리뷰를 작성하고 이미지를 다중 업로드할 수 있습니다. 이미지는 **Presigned URL → S3 직접 업로드 → CloudFront CDN 배포** 흐름으로 처리되어 서버 트래픽 부담을 최소화합니다.

---

### 회원 인증

<p align="center">
  <img src="https://github.com/Park-Dongheon/--Project_Busan_Walker_Transit_Info/releases/download/v1.0.0/Auth_Animation.gif" alt="회원 인증 시연" width="800"/>
</p>

이메일 인증 기반 회원가입, **JWT + HttpOnly 쿠키 + CSRF Double Submit Cookie** 패턴으로 보안을 구성했습니다. Rate Limiting을 통해 로그인·회원가입·이메일 재전송 엔드포인트를 보호합니다.

---

## 기술 스택

### Frontend

| 분류 | 기술 |
|------|------|
| 프레임워크 | React 19, TypeScript, Vite |
| 서버 상태 | TanStack Query v5 (Optimistic Update) |
| 폼 검증 | React Hook Form + Zod |
| 지도 | Naver Maps API |

### Backend

| 분류 | 기술 |
|------|------|
| 프레임워크 | Spring Boot 3 (Stateless REST API) |
| DB | MySQL 8.0 |
| 인프라 | AWS S3 + CloudFront (이미지), SMTP (이메일 인증) |
| 인증 | JWT + HttpOnly Cookie + CSRF Double Submit Cookie |
| 보안 | Rate Limiting (Token Bucket), IP 기반 요청 제한 |

---

## 시스템 아키텍처

```
[사용자]
    │
    ▼
[React SPA] ──── Naver Maps API
    │
    │ REST API (JWT + HttpOnly Cookie + CSRF)
    ▼
[Spring Boot]
    ├──────────────────── [MySQL 8.0]
    │
    └── Presigned URL 발급 ──── [AWS S3]
                                     │
                               [CloudFront CDN]
                                     │
                               [사용자 브라우저]
```

---

## 핵심 설계 결정

### 1. 데이터 vs 파생 데이터 분리

> **"DB에는 정적 사실만, 파생 계산은 클라이언트에서"**

거리 정렬, 포맷 변환, 최적 옵션 선별 등 동적으로 변하는 파생 데이터는 서버가 아닌 클라이언트 런타임에서 계산합니다.

- **장점**: 서버 부하 감소, 응답 속도 향상
- **트레이드오프**: 클라이언트 번들 복잡도 증가

### 2. 클라이언트 메모리 캐싱 전략

```ts
// signature 기반 key로 동일 조합의 중복 계산 방지
Map<string, ResolvedTransitOption[]>
```

동일한 관광지 + 사용자 위치 조합의 재계산을 방지하고, 최대 항목 수를 제한해 메모리 누수를 관리합니다.

### 3. DB 거리 확정 저장 전략

```sql
-- 데이터 적재 시 한 번만 계산, 런타임 ST_Distance_Sphere() 반복 호출 없음
distance_m   DOUBLE  NOT NULL  -- 서비스 기준 거리 (m)
distance_km  DECIMAL GENERATED ALWAYS AS (ROUND(distance_m / 1000, 3)) VIRTUAL
```

GEO(좌표 계산) / RAW(원본값) 두 가지 출처를 `distance_source` 컬럼으로 추적합니다.

### 4. 이미지 업로드 흐름 (서버 트래픽 우회)

```
클라이언트 → Spring Boot (Presigned URL 발급)
           → S3 직접 업로드
           → CloudFront CDN 배포
```

리뷰 이미지를 서버를 거치지 않고 S3에 직접 업로드하여 서버 대역폭 부담을 제거했습니다.

---

## DB 설계

### 핵심 테이블 구조

```
attractions (관광지)
    │  1
    │
    │  N
transit_access (교통 접근정보) ──── transit_types (교통수단 코드)
```

**설계 원칙**

| 컬럼 | 역할 |
|------|------|
| `keyid` | 외부 원본 자연키 — 외부 데이터 정합성 확보 |
| `access_no` | 내부 surrogate key — 내부 확장성 확보 |
| `has_coord` | STORED 생성열 — 좌표 보유 여부를 인덱스 탐색에 활용 |

**데이터 적재 파이프라인 (SQL 4단계)**

```
1_CREATE_RAW_DATA_SQL     ← 테이블 스키마 + STG 테이블 생성
2_DATA_LOAD_SQL           ← CSV → STG → 본 테이블 UPSERT
3_BUILD_ADDITIONAL_DB_SQL ← Geo 보조 테이블 + 공간 인덱스 + 요약 테이블
4_CREATE_UTIL_SQL         ← 계정/인증/상호작용/통계 테이블 + 트리거
```

STG(Staging) 테이블을 경유해 CSV 원본 오염이 본 테이블에 직접 영향을 주지 않도록 설계했습니다.

---

## 프론트엔드 구조

Feature Slice 패턴 기반 도메인 모듈 구조를 적용했습니다.

```
src/
├── domains/
│   ├── account/          # 프로필, 설정
│   ├── attraction/       # 관광지 목록·상세
│   ├── auth/             # 로그인·회원가입·이메일 인증
│   ├── favorite/         # 즐겨찾기
│   ├── map/
│   │   └── lib/
│   │       └── transit/
│   │           ├── transitOptions.ts     # MapTransitOption → ResolvedTransitOption
│   │           └── transitDerived.ts     # ResolvedTransitOption → TransitOptionPanelItem
│   └── review/           # 리뷰 CRUD · 이미지 다중 업로드
├── shared/               # 공통 컴포넌트, 훅, 유틸
└── app/                  # 라우터, 전역 설정
```

---

## 설치 및 실행

### 사전 요구사항

- Node.js 20+
- Java 21+
- MySQL 8.0

### Frontend

```bash
cd busan-walker-frontend
npm install
cp .env.example .env.local   # 환경변수 설정
npm run dev
```

**필수 환경변수 (`.env.local`)**

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_NAVER_MAP_CLIENT_ID=your_client_id
```

### Backend

```bash
cd busan-walker-backend/busan-walker
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

**필수 환경변수 / 시크릿**

```properties
# config/application-local-secrets.properties
spring.datasource.url=jdbc:mysql://localhost:3306/busan_walker
spring.datasource.username=...
spring.datasource.password=...
BH_JWT_ACTIVE_KID=main-v1
BH_JWT_KEYS_MAIN_V1=...
```
