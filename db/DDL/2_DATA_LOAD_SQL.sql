/* =========================================================
   Busan-hiker | 2_DATA_LOAD_SQL (MySQL 8.0.44)
   ---------------------------------------------------------
   목적
   - CSV 대량 적재를 "안전하게" 수행한다.
     1) CSV -> STAGING(문자열 위주)로 먼저 적재
     2) STAGING -> 본 테이블로 정규화/검증 후 UPSERT
   - distance_m은 런타임 계산을 피하기 위해 적재 시 확정 저장한다.
     * GEO: (관광지 좌표 + 시설 좌표) 모두 있으면 ST_Distance_Sphere로 계산
     * RAW: GEO 불가 시 DSTNC_VALUE(원본 m)를 사용
   - Windows CSV(\r\n) 잔재(\r)로 인한 문자열/숫자 파싱 실패를 방지한다.

   입력 CSV (서버 경로)
   - C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/attractions.csv
   - C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/transit_types.csv
   - C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/transit_access.csv
   ========================================================= */

/* ---------------------------------------------------------
   0) 기본 세션 설정
   - STRICT 모드 유지(데이터 품질)
   - 타임존 고정(로그/타임스탬프 일관성)
   --------------------------------------------------------- */
USE busan_walker;

SET NAMES utf8mb4;
SET SESSION time_zone = '+09:00';
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

/* ---------------------------------------------------------
   1) STAGING 초기화 (반복 실행 안전)
   --------------------------------------------------------- */
TRUNCATE TABLE attractions_stg;
TRUNCATE TABLE transit_types_stg;
TRUNCATE TABLE transit_access_stg;

/* ---------------------------------------------------------
   2) CSV -> STAGING 적재
   ---------------------------------------------------------
   주의
   - 아래는 일반적인 CSV 형식(, 구분 + " 선택적 감싸기)을 기준으로 작성.
   - 파일이 \r\n 이더라도 LINES TERMINATED BY '\n' 으로 읽고,
     이후 단계에서 REPLACE(..., '\r','') 로 제거한다.
   --------------------------------------------------------- */
LOAD DATA INFILE 'C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/attractions.csv'
INTO TABLE attractions_stg
CHARACTER SET euckr
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' ESCAPED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(
	@DATA_NO,
	KEYID,
    CTPRVN_NM,
    SIGNGU_NM,
    EMD_NM,
    AREA_CLTUR_TRRSRT_NM,
    ADDR,
    TRRSRT_LA,
    TRRSRT_LO,
    TRRSRT_CL_NM,
    TRRSRT_STRY_NM,
    TRRSRT_STRY_SUMRY_CN,
    TRRSRT_STRY_URL,
    CORE_KWRD_CN
);

LOAD DATA INFILE 'C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/transit_types.csv'
INTO TABLE transit_types_stg
CHARACTER SET euckr
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' ESCAPED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(
	DATA_NO,
    `Value`,
    Transportation
);

LOAD DATA INFILE 'C:/ProgramData/MySQL/MySQL Server 8.0/Uploads/transit_access.csv'
INTO TABLE transit_access_stg
CHARACTER SET euckr
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' ESCAPED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(
	`no`,
    KEYID,
    `Value`,
    PBTRNSP_CL_NM,
    PBTRNSP_FCLTY_NM,
    BSTP_NO_NM,
    ENTRC_NM,
    PBTRNSP_FCLTY_ADDR,
    FCLTY_LA,
    FCLTY_LO,
    DSTNC_VALUE
);

/* ---------------------------------------------------------
   3) STAGING -> 본 테이블 적재(정규화/검증 + UPSERT)
   ---------------------------------------------------------
   적재 순서
   1) attractions (부모)
   2) transit_types (부모)
   3) transit_access (자식: FK 필요)
   --------------------------------------------------------- */

/* 3-1) attractions UPSERT
   - CTE(WITH) 대신 파생 테이블로 전처리 (MySQL 호환성 안정)
   - 좌표는 REGEXP_SUBSTR로 "첫 숫자 토큰"만 추출
   - 범위 밖이면 NULL로 저장하여 CHECK 위반 방지
 */
INSERT INTO attractions (
	keyid, ctprvn_nm, signgu_nm, emd_nm,
    place_name, address,
    latitude, longitude,
    category_name,
    story_title, story_summary, story_url,
    core_keywords
)
SELECT
	s.keyid,
    s.ctprvn_nm, s.signgu_nm, s.emd_nm,
    s.place_name, s.address,
    
    /* 범위 밖이면 NULL (CHECK 통과) */
    CASE WHEN s.lat_raw BETWEEN -90 AND 90 THEN s.lat_raw ELSE NULL END AS latitude,
    CASE WHEN s.lon_raw BETWEEN -180 AND 180 THEN s.lon_raw ELSE NULL END AS longitude,
    
    s.category_name,
    s.story_title, s.story_summary, s.story_url,
    s.core_keywords
FROM (
	SELECT
		/* PK */
		TRIM(REPLACE(KEYID, 							'\r', '')) AS keyid,

		/* 지역 */
		NULLIF(TRIM(REPLACE(CTPRVN_NM, 					'\r', '')), '') AS ctprvn_nm,
		NULLIF(TRIM(REPLACE(SIGNGU_NM, 					'\r', '')), '') AS signgu_nm,
		NULLIF(TRIM(REPLACE(EMD_NM, 					'\r', '')), '') AS emd_nm,

		/* 필수 */
		TRIM(REPLACE(AREA_CLTUR_TRRSRT_NM, 				'\r', '')) AS place_name,

		/* 주소 */
		NULLIF(TRIM(REPLACE(ADDR, 						'\r', '')), '') AS address,

		CAST(
			NULLIF(
				REPLACE(REPLACE(REPLACE(REPLACE(
					REPLACE(REPLACE(TRIM(REPLACE(TRRSRT_LA, '\r', '')),
						'－','-'), '−','-'
					),
                    '．','.'), '。','.'), '','.'), '·','.'
				),
                ''
            ) AS DECIMAL(10,7)
        ) AS lat_raw,
        
        CAST(
			NULLIF(
				REPLACE(REPLACE(REPLACE(REPLACE(
					REPLACE(REPLACE(TRIM(REPLACE(TRRSRT_LO, '\r', '')),
						'－','-'), '−','-'
					),
                    '．','.'), '。','.'), '','.'), '·','.'
				),
                ''
            ) AS DECIMAL(10,7)
        ) AS lon_raw,

		/* 분류 */
		NULLIF(TRIM(REPLACE(TRRSRT_CL_NM, 				'\r', '')), '') AS category_name,

		/* 스토리 */
		NULLIF(TRIM(REPLACE(TRRSRT_STRY_NM, 			'\r', '')), '') AS story_title,
		NULLIF(TRIM(REPLACE(TRRSRT_STRY_SUMRY_CN, 		'\r', '')), '') AS story_summary,
		NULLIF(TRIM(REPLACE(TRRSRT_STRY_URL, 			'\r', '')), '') AS story_url,

		/* 키워드 */
		NULLIF(TRIM(REPLACE(CORE_KWRD_CN, 				'\r', '')), '') AS core_keywords
	FROM attractions_stg
) s
WHERE s.keyid IS NOT NULL AND s.keyid <> ''
  AND s.place_name IS NOT NULL AND s.place_name <> ''
ON DUPLICATE KEY UPDATE
	ctprvn_nm 					= VALUES(ctprvn_nm),
    signgu_nm 					= VALUES(signgu_nm),
    emd_nm	  					= VALUES(emd_nm),
    place_name 					= VALUES(place_name),
    address						= VALUES(address),
    latitude					= VALUES(latitude),
    longitude					= VALUES(longitude),
    category_name				= VALUES(category_name),
    story_title					= VALUES(story_title),
    story_summary				= VALUES(story_summary),
    story_url					= VALUES(story_url),
    core_keywords				= VALUES(core_keywords),
    updated_at					= CURRENT_TIMESTAMP(6);

/* 3-2) transit_types UPSERT */
INSERT INTO transit_types (`code`, data_no, name)
SELECT
	TRIM(REPLACE(`Value`, '\r', '')) AS code,
    CAST(
		NULLIF(
			REGEXP_REPLACE(TRIM(REPLACE(DATA_NO, '\r', '')), '[^0-9]+', ''), ''
        ) AS UNSIGNED
    ) AS data_no,
    TRIM(REPLACE(Transportation, '\r', '')) AS name
FROM transit_types_stg
WHERE `Value` IS NOT NULL AND TRIM(REPLACE(`Value`, '\r', '')) <> ''
  AND Transportation IS NOT NULL AND TRIM(REPLACE(Transportation, '\r', '')) <> ''
  AND NULLIF(REGEXP_REPLACE(TRIM(REPLACE(DATA_NO, '\r', '')), '[^0-9]+', ''), '') IS NOT NULL
ON DUPLICATE KEY UPDATE
	data_no 					= VALUES(data_no),
    name 						= VALUES(name),
    updated_at 					= CURRENT_TIMESTAMP(6);

/* 3-3) transit_access UPSERT
   - CTE(WITH) 제거: 파생 테이블 1개로 전처리/정규화
   - FK 정합성: attractions/transit_types JOIN으로 존재하는 것만 삽입
   - distance_m: GEO 가능하면 ST_Distance_Sphere, 아니면 raw_distance_m
   - raw_distance_m는 음수면 NULL 처리
*/
INSERT INTO transit_access (
	access_no, keyid, transport_code,
    pbtrnsp_cl_nm, facility_name, bus_stop_no, entrance_name, facility_address,
    facility_lat, facility_lon,
    raw_distance_m,
    distance_m,
    distance_source
)
SELECT
	ta.access_no,
    ta.keyid,
    ta.transport_code,
    
    ta.pbtrnsp_cl_nm,
    ta.facility_name,
    ta.bus_stop_no,
    ta.entrance_name,
    ta.facility_address,
    
    ta.facility_lat,
    ta.facility_lon,
    
    ta.raw_distance_m,
    
    /* distance_m 확정 저장 */
    CASE
		WHEN a.latitude IS NOT NULL AND a.longitude IS NOT NULL
         AND ta.facility_lat IS NOT NULL AND ta.facility_lon IS NOT NULL
		THEN ST_Distance_Sphere(
				POINT(a.longitude, a.latitude),
                POINT(ta.facility_lon, ta.facility_lat)
			 )
		ELSE ta.raw_distance_m
    END AS distance_m,
    
    /* 출처 기록 */
    CASE
		WHEN a.latitude IS NOT NULL AND a.longitude IS NOT NULL
         AND ta.facility_lat IS NOT NULL AND ta.facility_lon IS NOT NULL
		THEN 'GEO'
        ELSE 'RAW'
    END AS distance_source
FROM (
	SELECT
		/* PK 후보 */
        CAST(
			NULLIF(
				REGEXP_SUBSTR(TRIM(REPLACE(s.`no`, 			'\r', '')), '[0-9]+'), ''
            ) AS UNSIGNED
        ) AS access_no,
        
        TRIM(REPLACE(s.KEYID, 								'\r', '')) AS keyid,
        TRIM(REPLACE(s.`Value`, 							'\r', '')) AS transport_code,
        
        NULLIF(TRIM(REPLACE(s.PBTRNSP_CL_NM, 				'\r', '')), '') AS pbtrnsp_cl_nm,
        NULLIF(TRIM(REPLACE(s.PBTRNSP_FCLTY_NM, 			'\r', '')), '') AS facility_name,
        NULLIF(TRIM(REPLACE(s.BSTP_NO_NM, 					'\r', '')), '') AS bus_stop_no,
        NULLIF(TRIM(REPLACE(s.ENTRC_NM, 					'\r', '')), '') AS entrance_name,
        NULLIF(TRIM(REPLACE(s.PBTRNSP_FCLTY_ADDR, 			'\r', '')), '') AS facility_address,
        
        /* 시설 좌표 */
        CAST(
			NULLIF(REPLACE(REPLACE(TRIM(REPLACE(s.FCLTY_LA, '\r', '')), '．', '.'), ' ', ''), 
            '') AS DECIMAL(10,7)
		) AS facility_lat,
        CAST(
			NULLIF(REPLACE(REPLACE(TRIM(REPLACE(s.FCLTY_LO, '\r', '')), '．', '.'), ' ', ''), 
            '') AS DECIMAL(10,7)
        ) AS facility_lon,
        
		/* 거리값(raw_distance_m)
		   - 저장 단위는 항상 meter(m)로 통일
		   - 원본 문자열에 'km' 표기가 있으면 m로 환산(×1000), 그 외는 m로 간주 */
        CASE
			WHEN LOWER(TRIM(REPLACE(s.DSTNC_VALUE, '\r', ''))) REGEXP 'km$' THEN
				CAST(
					NULLIF(
						REPLACE(
							REGEXP_SUBSTR(TRIM(REPLACE(s.DSTNC_VALUE, '\r', '')), '[0-9,.]+'),
							',', ''
						),
						''
					) AS DOUBLE
				) * 1000
			ELSE
				CAST(
					NULLIF(
						REPLACE(
							REGEXP_SUBSTR(TRIM(REPLACE(s.DSTNC_VALUE, '\r', '')), '[0-9,.]+'),
							',', ''
						),
						''
					) AS DOUBLE
				)
		END AS raw_distance_m
	FROM transit_access_stg s
) ta
JOIN attractions a ON a.keyid = ta.keyid
JOIN transit_types tt ON tt.`code` = ta.transport_code
WHERE ta.access_no IS NOT NULL
  AND ta.keyid IS NOT NULL AND ta.keyid <> ''
  AND ta.transport_code IS NOT NULL AND ta.transport_code <> ''
  /* distance_m NOT NULL 보장:
	 - GEO 계산이 가능하거나
     - RAW 값이 존재해야 삽입 */
  AND (
	(a.latitude IS NOT NULL AND a.longitude IS NOT NULL
      AND ta.facility_lat IS NOT NULL AND ta.facility_lon IS NOT NULL)
      OR ta.raw_distance_m IS NOT NULL
	)
ON DUPLICATE KEY UPDATE
	keyid 					= VALUES(keyid),
    transport_code 			= VALUES(transport_code),
    
    pbtrnsp_cl_nm 			= VALUES(pbtrnsp_cl_nm),
    facility_name 			= VALUES(facility_name),
    bus_stop_no 			= VALUES(bus_stop_no),
    entrance_name 			= VALUES(entrance_name),
    facility_address 		= VALUES(facility_address),
    
    facility_lat 			= VALUES(facility_lat),
    facility_lon 			= VALUES(facility_lon),
    
    raw_distance_m 			= VALUES(raw_distance_m),
    distance_m 				= VALUES(distance_m),
    distance_source 		= VALUES(distance_source),
    
    updated_at 				= CURRENT_TIMESTAMP(6);

/* ---------------------------------------------------------
   4) 적재 후 빠른 검증(운영/품질 체크)
   --------------------------------------------------------- */
-- 테이블 행 수
SELECT 'attractions' AS tbl, COUNT(*) AS cnt FROM attractions
UNION ALL
SELECT 'transit_types' AS tbl, COUNT(*) AS cnt FROM transit_types
UNION ALL
SELECT 'transit_access' AS tbl, COUNT(*) AS cnt FROM transit_access;

-- 거리 NULL/음수 여부(이상치)
SELECT COUNT(*) AS bad_distance_cnt
FROM transit_access
WHERE distance_m IS NULL OR distance_m < 0;

-- GEO/RAW 분포(좌표 품질 확인)
SELECT distance_source, COUNT(*) AS cnt
FROM transit_access
GROUP BY distance_source
