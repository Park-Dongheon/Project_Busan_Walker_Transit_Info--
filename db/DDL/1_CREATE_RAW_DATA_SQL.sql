/* =========================================================
   Busan-hiker | 1_CREATE_RAW_DATA_SQL (MySQL 8.0.44)
   ---------------------------------------------------------
   목적
   - CSV 대량 적재 + 읽기(조회) 중심 서비스 + JPA/Hibernate 기반
   - 거리: transit_access에 "미터(distance_m) 확정 저장" + "km(distance_km) 생성열" 제공
     -> 런타임 ST_Distance_Sphere() 반복 계산을 피하고,
        (keyid, distance_m) 인덱스로 거리순 정렬/페이징을 안정적으로 처리

   입력 CSV
   - attractions.csv: 관광지(좌표 포함)
   - transit_types.csv: 교통수단 코드 마스터
   - transit_access.csv: 관광지별 접근시설/거리(DSTNC_VALUE: m 단위)
   ========================================================= */
   
-- 스키마 생성
CREATE DATABASE IF NOT EXISTS busan_walker
	DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_0900_ai_ci;
    
USE busan_walker;

-- 세션 설정: 대량 적재/검증 시 안정성
SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION time_zone = '+09:00';

-- FK 드롭/생성 편의(새로 구축 스크립트인 경우)
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS transit_access;
DROP TABLE IF EXISTS transit_types;
DROP TABLE IF EXISTS attractions;

SET FOREIGN_KEY_CHECKS = 1;

/* =========================================================
   1) 관광지(attractions)
   - KEYID를 PK로 사용(원본 식별자 유지)
   - lat/lon + has_coord 생성열(STORED)
   - 공간검색(SPATIAL)은 3_BUILD_ADDITIONAL_DB_SQL의 attractions_geo에서 담당
   ========================================================= */
CREATE TABLE attractions (
	/* CSV: KEYID */
    keyid				VARCHAR(64) 	NOT NULL COMMENT '관광지 고유 키(원본 KEYID)',
    
    /* CSV: CTPRVN_NM, SIGNGU_NM, EMD_NM */
    ctprvn_nm			VARCHAR(32) 	NULL COMMENT '시/도',
    signgu_nm			VARCHAR(32) 	NULL COMMENT '시/군/구',
    emd_nm				VARCHAR(32) 	NULL COMMENT '읍/면/동',
    
    /* CSV: AREA_CLTUR_TRRSRT_NM */
    place_name			VARCHAR(200) 	NOT NULL COMMENT '관광지명(AREA_CLTUR_TRRSRT_NM)',
    
    /* CSV: ADDR */
    address				VARCHAR(300) 	NULL COMMENT '주소(ADDR)',
    image_url			VARCHAR(512)	NULL COMMENT '관광지 대표 이미지 URL(관리자 업로드)',
    
    /* CSV: TRRSRT_LA, TRRSRT_LO */
    latitude			DECIMAL(10,7) 	NULL COMMENT '위도(TRRSRT_LA, WGS84)',
    longitude			DECIMAL(10,7) 	NULL COMMENT '경도(TRRSRT_LO, WGS84)',
    
    /* 좌표가 "있는 행"만 지도/근접 검색 대상으로 태우기 위한 플래그 */
    has_coord			TINYINT UNSIGNED
					GENERATED ALWAYS AS (
						CASE
							WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1
                            ELSE 0
                        END
                    ) STORED
                    COMMENT '좌표 보유 여부(1:있음, 0:없음)',
	
    /* CSV: TRRSRT_CL_NM */
    category_name		VARCHAR(80) 	NULL COMMENT '분류명(TRRSRT_CL_NM)',
    
    /* CSV: TRRSRT_STRY_NM, TRRSRT_STRY_SUMRY_CN, TRRSRT_STRY_URL */
    story_title			VARCHAR(200) 	NULL COMMENT '스토리 제목(TRRSRT_STRY_NM)',
    story_summary		TEXT		 	NULL COMMENT '스토리 요약(TRRSRT_STRY_SUMRY_CN)',
    story_url			VARCHAR(500) 	NULL COMMENT '스토리 URL(TRRSRT_STRY_URL)',
    
    /* CSV: CORE_KWRD_CN */
    core_keywords		TEXT		 	NULL COMMENT '핵심 키워드(CORE_KWRD_CN)',
    
    /* 운영/관리 편의(CSV에 없어도 기본값으로 자동 채움) */
    created_at			TIMESTAMP(6) 	NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 시각',
    updated_at			TIMESTAMP(6) 	NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
										 ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 시각',
                                      
	PRIMARY KEY (keyid),
    
    /* 좌표 값 범위 검증(누락 허용) */
    CONSTRAINT chk_attractions_lat CHECK (latitude  IS NULL OR (latitude  BETWEEN -90 AND 90)),
    CONSTRAINT chk_attractions_lon CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
    
    /* 조회 패턴 인덱스 */
    INDEX idx_attractions_place_name (place_name),
    INDEX idx_attractions_region (ctprvn_nm, signgu_nm, emd_nm),
    
    /* 지도/bbox 전용 */
    INDEX idx_attractions_has_coord_lat_lon (has_coord, latitude, longitude),
    
    /* 키워드/이름 검색 */
    FULLTEXT INDEX ftx_attractions_text (place_name, address, core_keywords, story_title, story_summary)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='관광지 마스터';

/* =========================================================
   2) 교통수단 코드(transit_types)
   - CSV: DATA_NO, Value, Transportation
   - transit_access.Value(=transport_code)와 FK 연결을 위해 value를 PK로 사용
   ========================================================= */
CREATE TABLE transit_types (
	/* CSV: Value */
    `code`				VARCHAR(8) 		NOT NULL COMMENT '교통수단 코드(Value: b, s1, s2, ...)',
    
    /* CSV: DATA_NO */
    data_no				SMALLINT UNSIGNED NOT NULL COMMENT '원본 코드 일련번호(DATA_NO)',
    
    /* CSV: Transportation */
    name				VARCHAR(40)		NOT NULL COMMENT '표시명(Transportation)',
    
    created_at			TIMESTAMP(6)	NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 시각',
    updated_at			TIMESTAMP(6)	NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
										 ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 시각',
	
    PRIMARY KEY (`code`),
    UNIQUE KEY uq_transit_types_data_no (data_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='교통수단 코드 마스터';

/* =========================================================
   3) 관광지 접근 정보(transit_access)
   - CSV: no(KEY), KEYID(FK), Value(FK), ... , DSTNC_VALUE(원본 m)
   - 시나리오 핵심:
     * raw_distance_m: CSV 원본 보관(검증/디버깅)
     * distance_m: 서비스 기준 거리(미터) "적재 시 확정 저장"
     * distance_km: distance_m/1000 생성열(VIRTUAL) -> 응답 편의
     * distance_source: 'GEO'(좌표 계산) / 'RAW'(원본 사용)
   ========================================================= */
CREATE TABLE transit_access (
	/* CSV: no */
    access_no			BIGINT 			NOT NULL COMMENT '접근정보 고유키(원본 no)',
    
    /* CSV: KEYID */
    keyid				VARCHAR(64) 	NOT NULL COMMENT '관광지 KEYID(FK)',
    
    /* CSV: Value */
    transport_code		VARCHAR(8)		NOT NULL COMMENT '교통수단 코드(FK: transit_types.code)',
    
    /* CSV: PBTRNSP_CL_NM */
    pbtrnsp_cl_nm		VARCHAR(80)		NULL COMMENT '대중교통 구분(PBTRNSP_CL_NM)',
    
    /* CSV: PBTRNSP_FCLTY_NM */
    facility_name		VARCHAR(200)	NULL COMMENT '시설명(정류장/역/시설 등)',
    
    /* CSV: BSTP_NO_NM */
    bus_stop_no			VARCHAR(40)		NULL COMMENT '정류소 번호(BSTP_NO_NM)',
    
    /* CSV: ENTRC_NM */
    entrance_name		VARCHAR(120)	NULL COMMENT '출입구/입구(ENTRC_NM)',
    
    /* CSV: PBTRNSP_FCLTY_ADDR */
    facility_address	VARCHAR(300)	NULL COMMENT '시설 주소(PBTRNSP_FCLTY_ADDR)',
    
    /* CSV: FCLTY_LA, FCLTY_LO */
    facility_lat		DECIMAL(10,7) 	NULL COMMENT '시설 위도(FCLTY_LA)',
    facility_lon		DECIMAL(10,7)	NULL COMMENT '시설 경도(FCLTY_LO)',
    
    /* 시설 지오메트리(좌표가 있을 때만 생성) */
    facility_has_coord	TINYINT UNSIGNED
					GENERATED ALWAYS AS (
						CASE
							WHEN facility_lat IS NOT NULL AND facility_lon IS NOT NULL THEN 1
                            ELSE 0
                        END
                    ) STORED
                    COMMENT '시설 좌표 보유 여부(1/0)',
        
	/* CSV: DSTNC_VALUE (m 단위) */
    raw_distance_m		DOUBLE			NULL COMMENT '원본 거리(m): CSV DSTNC_VALUE 그대로 보관',
    
    /* 서비스 기준 거리(m): 적재 시 확정 저장 (좌표 있으면 계산, 없으면 raw 사용) */
    distance_m			DOUBLE			NOT NULL COMMENT '서비스 기준 거리(m): 적재 시 확정 저장',
    
    /* 거리 산출 출처 */
    distance_source		ENUM('GEO', 'RAW') NOT NULL COMMENT 'GEO: 좌표기반 계산, RAW: CSV 원본 사용',
    
    /* 서비스 응답 편의: km 단위(저장하지 않고 계산만) */
    distance_km			DECIMAL(10,3)
					GENERATED ALWAYS AS (ROUND(distance_m / 1000, 3)) VIRTUAL
                    COMMENT '서비스 응답용 거리(km): ROUND(distance_m/1000, 3)',
	
    created_at			TIMESTAMP(6)	NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '생성 시각',
    updated_at			TIMESTAMP(6)	NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
										 ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '수정 시각',

	PRIMARY KEY (access_no),
    
    /* FK: 관광지 */
    CONSTRAINT fk_transit_access_attraction
		FOREIGN KEY (keyid)
        REFERENCES attractions (keyid)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
	
    /* FK: 교통수단 코드 */
    CONSTRAINT fk_transit_access_transit_type
		FOREIGN KEY (transport_code)
        REFERENCES transit_types (`code`)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
	
    /* 좌표 값 범위 검증(누락 허용) */
    CONSTRAINT chk_transit_access_fac_lat CHECK (facility_lat IS NULL OR (facility_lat BETWEEN -90 AND 90)),
    CONSTRAINT chk_transit_access_fac_lon CHECK (facility_lon IS NULL OR (facility_lon BETWEEN -180 AND 180)),
    
    /* 거리 값 검증 */
    CONSTRAINT chk_transit_access_raw_dist CHECK (raw_distance_m IS NULL OR raw_distance_m >= 0),
    CONSTRAINT chk_transit_access_dist	   CHECK (distance_m >= 0),
    
    /* "distance_m NOT NULL"을 안전하게 쓰기 위한 최소 보장:
	   - 좌표가 없더라도 raw_distance_m이 있으면 적재 시 distance_m을 채울 수 있어야 함 */
	CONSTRAINT chk_transit_access_dist_input CHECK (
		(facility_lat IS NOT NULL AND facility_lon IS NOT NULL)
        OR raw_distance_m IS NOT NULL
    ),
    
    /* 조회 패턴 최적화 인덱스
	   - 상세: 특정 관광지(keyid)의 접근정보를 거리순 정렬
       - 필터: 특정 관광지 + 교통수단별 조회 */
    INDEX idx_transit_access_keyid_dist (keyid, distance_m, access_no),
    INDEX idx_transit_access_keyid_mode_dist (keyid, transport_code, distance_m, access_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='관광지 접근시설/거리(distance_m 확정 저장)';
  
/* =========================================================
   4) 적재용 STAGING 테이블 DDL (대량 적재 안정성 목적)
   ---------------------------------------------------------
   - CSV 원본이 흔들려도(공백/개행/문자 혼입) 본 테이블 제약으로 전체 실패하지 않게
   - STAGING은 "문자열 위주"로 받고 -> 정규화/검증 후 본 테이블로 INSERT
   - 운영에서는 적재 완료 후 DROP 가능
   ========================================================= */

-- 관광지 STG (원본 컬럼명 유지)
CREATE TABLE IF NOT EXISTS attractions_stg (
	KEYID						VARCHAR(255) NULL,
    CTPRVN_NM					VARCHAR(255) NULL,
    SIGNGU_NM					VARCHAR(255) NULL,
    EMD_NM						VARCHAR(255) NULL,
    AREA_CLTUR_TRRSRT_NM		VARCHAR(255) NULL,
    ADDR						VARCHAR(255) NULL,
    TRRSRT_LA					VARCHAR(64)	 NULL,
    TRRSRT_LO					VARCHAR(64)	 NULL,
    TRRSRT_CL_NM				VARCHAR(255) NULL,
    TRRSRT_STRY_NM				VARCHAR(500) NULL,
    TRRSRT_STRY_SUMRY_CN		TEXT		 NULL,
    TRRSRT_STRY_URL				VARCHAR(800) NULL,
    CORE_KWRD_CN				TEXT		 NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='CSV 원본 임시 적재용(관광지)';

-- 접근정보 STG
CREATE TABLE IF NOT EXISTS transit_access_stg (
	`no`						VARCHAR(64)	 NULL,
    KEYID						VARCHAR(255) NULL,
    `Value`						VARCHAR(64)  NULL,
    PBTRNSP_CL_NM				VARCHAR(255) NULL,
    PBTRNSP_FCLTY_NM			VARCHAR(500) NULL,
    BSTP_NO_NM					VARCHAR(255) NULL,
    ENTRC_NM					VARCHAR(255) NULL,
    PBTRNSP_FCLTY_ADDR			VARCHAR(800) NULL,
    FCLTY_LA					VARCHAR(64)  NULL,
    FCLTY_LO					VARCHAR(64)  NULL,
    DSTNC_VALUE					VARCHAR(64)  NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='CSV 원본 임시 적재용(접근정보)';

-- 교통수단 STG
CREATE TABLE IF NOT EXISTS transit_types_stg (
	DATA_NO						VARCHAR(64)	 NULL,
    `Value`						VARCHAR(64)	 NULL,
    Transportation				VARCHAR(255) NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='CSV 원본 임시 적재용(교통수단 코드)';