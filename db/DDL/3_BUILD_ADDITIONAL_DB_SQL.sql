/* =========================================================
   Busan-hiker | 3_BUILD_ADDITIONAL_DB_SQL (MySQL 8.0.44)
   ---------------------------------------------------------
   구성(베이스 3테이블만 사용)
   1) 조회 성능 보강 인덱스
   2) 도보 시간 계산 유틸 함수
   3) 공간검색 최적화를 위한 Geo 보조 테이블(+ SPATIAL 인덱스)
   4) 관광지별 “가장 가까운 교통 접근” 요약 테이블(물리화)
   5) 서비스에서 바로 쓰기 좋은 View 세트
   ---------------------------------------------------------
   특징
   - Geo/요약 테이블은 원본에서 재생성 가능한 파생 데이터로 구성
   - 데이터 적재(2_DATA_LOAD_SQL) 이후에 1회 리프레시하면 즉시 사용 가능
   ========================================================= */
   
   USE busan_walker;
   
   SET NAMES utf8mb4;
   SET SESSION time_zone = '+09:00';
   SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
   
   -- JSON / GROUP_CONCAT 기반 응답 조립 시 길이 부족 방지(상세 뷰 등 확장 대비)
   SET SESSION group_concat_max_len = 1048576;
   
   /* ---------------------------------------------------------
   0) 필수 베이스 테이블 존재성 점검
   - 스키마 구축/적재 순서가 꼬였을 때 원인을 빠르게 확인하기 위함
   --------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_assert_base_tables;

DELIMITER $$

CREATE PROCEDURE sp_assert_base_tables()
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'attractions'
    ) THEN
      SIGNAL SQLSTATE '45000'
		SET MESSAGE_TEXT = 'Required table `attractions` not found.';
	END IF;
    
    IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'transit_types'
    ) THEN
      SIGNAL SQLSTATE '45000'
		SET MESSAGE_TEXT = 'Required table `transit_types` not found.';
	END IF;
    
    IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'transit_access'
    ) THEN
      SIGNAL SQLSTATE '45000'
		SET MESSAGE_TEXT = 'Required table `transit_access` not found.';
	END IF;
END$$
DELIMITER ;

CALL sp_assert_base_tables();

/* ---------------------------------------------------------
   1) 조회 성능 보강 인덱스
   - 지도/박스(bbox) 필터, 시설 좌표 기반 필터 등에 사용
   - 이미 존재하면 생성하지 않도록 시그니처(컬럼 조합)로 확인
   --------------------------------------------------------- */

-- 1-1) attractions(latitude, longitude)
SET @sig_exists := (
    SELECT COUNT(*) FROM (
        SELECT INDEX_NAME,
               GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attractions'
        GROUP BY INDEX_NAME
    ) x
    WHERE x.cols IN ('latitude,longitude', 'has_coord,latitude,longitude')
);
SET @sql := IF(@sig_exists=0,
    'CREATE INDEX idx_attractions_lat_lon ON attractions (latitude, longitude)',
    'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1-2) transit_access(facility_lat, facility_lon)
SET @sig_exists := (
	SELECT COUNT(*) FROM (
		SELECT INDEX_NAME,
			   GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
		FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transit_access'
        GROUP BY INDEX_NAME
    ) x
    WHERE x.cols='facility_lat,facility_lon'
);
SET @sql := IF(@sig_exists=0,
	'CREATE INDEX idx_transit_access_fac_lat_lon ON transit_access (facility_lat, facility_lon)',
    'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1-3) 교통수단 단위 탐색이 필요할 때 유용한 인덱스(모드별 거리 정렬/페이징)
SET @sig_exists := (
	SELECT COUNT(*) FROM(
		SELECT INDEX_NAME,
			   GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
		FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transit_access'
        GROUP BY INDEX_NAME
    ) x
    WHERE x.cols='transport_code,distance_m,access_no'
);
SET @sql := IF(@sig_exists=0,
	'CREATE INDEX idx_transit_access_mode_dist ON transit_access (transport_code, distance_m, access_no)',
    'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

/* ---------------------------------------------------------
   2) 거리 기반 도보 시간(분) 계산 함수
   - 목록/카드 응답에서 "대략적인 이동 시간" 표시에 사용
   - 4.5km/h 가정(= 75m/min)
   --------------------------------------------------------- */
DROP FUNCTION IF EXISTS meters_to_walk_minutes;

DELIMITER $$
CREATE FUNCTION meters_to_walk_minutes(meters DOUBLE)
RETURNS INT
DETERMINISTIC
BEGIN
	IF meters IS NULL OR meters < 0 THEN
		RETURN NULL;
	END IF;
    
    RETURN CEILING(meters / 75.0);
END$$
DELIMITER ;

/* ---------------------------------------------------------
   3) Geo 보조 테이블(+SPATIAL 인덱스)
   - 원본 테이블의 위경도 컬럼은 NULL이 허용되므로,
     "좌표가 있는 행만" 별도 테이블로 분리하여 SPATIAL 인덱스를 적용
   - 지도/bbox/근접(거리) 검색에서 인덱스를 적극 활용 가능
   --------------------------------------------------------- */

DROP TABLE IF EXISTS attractions_geo;
CREATE TABLE attractions_geo (
	keyid				VARCHAR(64) NOT NULL,
    latitude			DECIMAL(10,7) NOT NULL,
    longitude			DECIMAL(10,7) NOT NULL,
    
    place_point			POINT SRID 4326 NOT NULL,
    
    created_at			TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at			TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
									  ON UPDATE CURRENT_TIMESTAMP(6),
	
    PRIMARY KEY (keyid),
    
    CONSTRAINT fk_attractions_geo_keyid
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
        
	SPATIAL INDEX spx_attractions_geo_point (place_point),
    INDEX idx_attractions_geo_lat_lon (latitude, longitude)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='좌표 보유 관광지 전용(공간검색 최적화)';

DROP TABLE IF EXISTS transit_access_geo;
CREATE TABLE transit_access_geo (
	access_no			BIGINT NOT NULL,
    keyid				VARCHAR(64) NOT NULL,
    transport_code		VARCHAR(8) NOT NULL,
    
    facility_lat		DECIMAL(10,7) NOT NULL,
    facility_lon		DECIMAL(10,7) NOT NULL,
    facility_point		POINT SRID 4326 NOT NULL,
    
    created_at			TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at			TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
									  ON UPDATE CURRENT_TIMESTAMP(6),
	
    PRIMARY KEY (access_no),
    
    CONSTRAINT fk_ta_geo_access
		FOREIGN KEY (access_no) REFERENCES transit_access(access_no)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_ta_geo_keyid
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_ta_geo_transport
		FOREIGN KEY (transport_code) REFERENCES transit_types(`code`)
        ON UPDATE CASCADE ON DELETE RESTRICT,
	
    SPATIAL INDEX spx_ta_geo_point (facility_point),
    INDEX idx_ta_geo_keyid (keyid),
    INDEX idx_ta_geo_keyid_mode (keyid, transport_code)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='시설 좌표 보유 접근정보 전용(공간검색 최적화)';

-- 3-1) Geo 테이블 리프레시(원본 기반 재생성)
DROP PROCEDURE IF EXISTS sp_refresh_geo_tables;

DELIMITER $$
CREATE PROCEDURE sp_refresh_geo_tables()
BEGIN
	TRUNCATE TABLE transit_access_geo;
    TRUNCATE TABLE attractions_geo;
    
    INSERT INTO attractions_geo (keyid, latitude, longitude, place_point)
    SELECT
		a.keyid,
        a.latitude,
        a.longitude,
        ST_SRID(POINT(a.longitude, a.latitude), 4326)
	FROM attractions a
    WHERE a.has_coord = 1
      AND a.latitude	IS NOT NULL
      AND a.longitude	IS NOT NULL;
	
    INSERT INTO transit_access_geo (access_no, keyid, transport_code, facility_lat, facility_lon, facility_point)
    SELECT
		ta.access_no,
        ta.keyid,
        ta.transport_code,
        ta.facility_lat,
        ta.facility_lon,
        ST_SRID(POINT(ta.facility_lon, ta.facility_lat), 4326)
	FROM transit_access ta
    WHERE ta.facility_has_coord = 1
      AND ta.facility_lat IS NOT NULL
      AND ta.facility_lon IS NOT NULL;
END$$
DELIMITER ;

/* ---------------------------------------------------------
   4) 관광지별 교통 접근성 요약(물리화)
   - 관광지 목록/카드에서 "가장 가까운 접근 수단"을 즉시 제공
   - 원본 transit_access의 (keyid, distance_m, access_no) 정렬 패턴을 그대로 활용
   --------------------------------------------------------- */
DROP TABLE IF EXISTS attraction_transit_summary;
CREATE TABLE attraction_transit_summary (
	keyid					VARCHAR(64) NOT NULL,
    total_transit_count		INT UNSIGNED NOT NULL,
    
    nearest_distance_m		DOUBLE NULL,
    nearest_access_no		BIGINT NULL,
    nearest_transport_code	VARCHAR(8) NULL,
    
    refreshed_at			TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    PRIMARY KEY (keyid),
    
    CONSTRAINT fk_transit_summary_keyid
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_transit_summary_nearest (nearest_distance_m),
    INDEX idx_transit_summary_mode	  (nearest_transport_code)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='관광지별 교통 접근성 요약(최단 1건 + 총 건수)';

DROP PROCEDURE IF EXISTS sp_refresh_transit_summary;

DELIMITER $$
CREATE PROCEDURE sp_refresh_transit_summary()
BEGIN
	TRUNCATE TABLE attraction_transit_summary;
    
    INSERT INTO attraction_transit_summary (
		keyid, total_transit_count,
        nearest_distance_m, nearest_access_no, nearest_transport_code
    )
    SELECT
		x.keyid,
        x.total_cnt,
        x.nearest_distance_m,
        x.nearest_access_no,
        x.nearest_transport_code
	FROM (
		SELECT
			ta.keyid,
            COUNT(*) OVER (PARTITION BY ta.keyid) AS total_cnt,
            ta.distance_m AS nearest_distance_m,
            ta.access_no  AS nearest_access_no,
            ta.transport_code AS nearest_transport_code,
            ROW_NUMBER() OVER (
				PARTITION BY ta.keyid
                ORDER BY ta.distance_m ASC, ta.access_no ASC
            ) AS rn
		FROM transit_access ta
    ) x
    WHERE x.rn = 1;
END$$
DELIMITER ;

/* ---------------------------------------------------------
   5) 서비스용 View
   - JOIN 비용을 애플리케이션에서 반복하지 않도록 "읽기 친화" 형태로 제공
   --------------------------------------------------------- */

-- 5-1) 접근정보 상세(enriched): 관광지/교통수단명/거리/도보시간 포함
DROP VIEW IF EXISTS vw_transit_access_enriched;
CREATE OR REPLACE VIEW vw_transit_access_enriched AS
SELECT
	ta.access_no,
    ta.keyid,
    
    a.place_name,
    a.address AS place_address,
    a.category_name AS place_category,
    a.ctprvn_nm, a.signgu_nm, a.emd_nm,
    a.latitude 	AS place_lat,
    a.longitude AS place_lon,
    
    ta.transport_code,
    tt.`name` AS transport_name,
    
    ta.pbtrnsp_cl_nm,
    ta.facility_name,
    ta.bus_stop_no,
    ta.entrance_name,
    ta.facility_address,
    ta.facility_lat,
    ta.facility_lon,
    
    ta.raw_distance_m,
    ta.distance_m,
    ta.distance_km,
    ta.distance_source,
    
    meters_to_walk_minutes(ta.distance_m) AS est_walk_min
FROM transit_access ta
JOIN attractions a		ON a.keyid = ta.keyid
JOIN transit_types tt	ON tt.`code` = ta.transport_code;

-- 5-2) 레거시 카드 뷰 정리
--  - 카드/목록 조회의 SSOT는 4_CREATE_UTIL_SQL의 vw_attraction_cards로 통일
--  - 과거 호환 뷰(v_attraction_cards)는 중복/정책 분산 방지를 위해 제거
DROP VIEW IF EXISTS v_attraction_cards;

/* ---------------------------------------------------------
   6) 최초 1회 리프레시
   - 적재 직후 즉시 조회 가능하도록 파생 테이블을 채움
   --------------------------------------------------------- */
CALL sp_refresh_geo_tables();
CALL sp_refresh_transit_summary();

/* ---------------------------------------------------------
   7) 간단 검증
   --------------------------------------------------------- */
SELECT 'attractions_geo' AS tbl, COUNT(*) AS cnt FROM attractions_geo
UNION ALL
SELECT 'transit_access_geo' AS tbl, COUNT(*) AS cnt FROM transit_access_geo
UNION ALL
SELECT 'attraction_transit_summary' AS tbl, COUNT(*) AS cnt FROM attraction_transit_summary;

SELECT distance_source, COUNT(*) AS cnt
FROM transit_access
GROUP BY distance_source;
