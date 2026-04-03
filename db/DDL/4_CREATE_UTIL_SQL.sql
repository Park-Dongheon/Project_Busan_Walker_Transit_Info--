/* =========================================================
   Busan Hiker Web Service - UTIL objects
   - 4_CREATE_UTIL_SQL (MySQL 8.0.44, UTF8MB4)
   ---------------------------------------------------------
   구성
   1) 계정/인증
      - users, oauth_accounts
      - refresh_tokens (JWT refresh: hash 저장)
      - email_verifications, password_resets (메일/일회성 토큰: hash 저장)
   2) 상호작용
      - user_favorites (즐겨찾기)
      - attraction_likes (관광지 좋아요)
      - attraction_reviews (리뷰: 탈퇴 사용자 작성분은 NULL 보존)
      - review_images (리뷰 이미지 다중)
      - review_comments (댓글/대댓글: parent_comment_id)
      - review_likes, comment_likes
   3) 조회 성능
      - attraction_review_stats (관광지 리뷰 통계 물리화)
      - review_reaction_stats (리뷰 좋아요/댓글 수 물리화)
      - attraction_engagement_stats (관광지 즐겨찾기/좋아요 수 물리화)
      - 트리거 증분 갱신 + 필요 시 리프레시 프로시저 제공
   4) 서비스용 View
      - 카드/목록/즐겨찾기 상세에서 JOIN 1회로 필요 값을 제공
   ========================================================= */

USE busan_walker;

SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION time_zone = '+09:00';

-- JSON/GROUP_CONCAT 기반 응답 조립 시 길이 부족 방지(확장 대비)
SET SESSION group_concat_max_len = 1048576;

/* ---------------------------------------------------------
   0) 선행 테이블 체크
   - attractions: 상호작용 FK 기준(관광지)
   - attraction_transit_summary: 카드/목록에서 최단 접근수단 즉시 제공(3_BUILD 산출물)
   - transit_access/transit_types: 최단 접근수단 상세 표시용
   --------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_assert_util_deps;

DELIMITER $$
CREATE PROCEDURE sp_assert_util_deps()
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
        WHERE table_schema = DATABASE() AND table_name = 'attraction_transit_summary'
    ) THEN
      SIGNAL SQLSTATE '45000'
		SET MESSAGE_TEXT = 'Required table `attraction_transit_summary` not found.';
	END IF;
    
    IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'transit_access'
    ) THEN
      SIGNAL SQLSTATE '45000'
		SET MESSAGE_TEXT = 'Required table `transit_access` not found.';
	END IF;
    
    IF NOT EXISTS (
		SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'transit_types'
    ) THEN
      SIGNAL SQLSTATE '45000'
		SET MESSAGE_TEXT = 'Required table `transit_types` not found.';
	END IF;
    
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.routines
        WHERE routine_schema = DATABASE()
          AND routine_name = 'meters_to_walk_minutes'
          AND routine_type = 'FUNCTION'
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Required function `meters_to_walk_minutes` not found.';
    END IF;
END$$
DELIMITER ;

CALL sp_assert_util_deps();

/* ---------------------------------------------------------
   1) Users
   - email 유니크로 계정 식별
   - is_active/status로 인증/비활성 상태 관리
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS users (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email					VARCHAR(191) NOT NULL,
    password_hash			VARCHAR(255) NULL,
    display_name			VARCHAR(80)  NOT NULL,
    `role`					ENUM('ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
    
    email_verified_at		TIMESTAMP(6) NULL,
    is_active				TINYINT NOT NULL DEFAULT 0,
    `status`				ENUM('ACTIVE', 'DISABLED_BY_USER', 'DISABLED_BY_ADMIN') NOT NULL DEFAULT 'ACTIVE',
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
										  ON UPDATE CURRENT_TIMESTAMP(6),
	
    CONSTRAINT uq_users_email UNIQUE (email),
    INDEX idx_users_state (is_active, `status`, `role`),
    INDEX idx_users_created (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='service users';

/* ---------------------------------------------------------
   2) OAuth2 accounts
   - provider/provider_user_id로 외부 계정의 고유성 보장
   - 동일 사용자의 다중 소셜 계정 연동을 허용하는 구조
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS oauth_accounts (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id					BIGINT UNSIGNED NOT NULL,
    provider				ENUM('NAVER', 'KAKAO', 'GOOGLE', 'APPLE') NOT NULL,
    provider_user_id		VARCHAR(191) NOT NULL,
    
    email					VARCHAR(191) NULL,
    profile_name			VARCHAR(120) NULL,
    avatar_url				VARCHAR(512) NULL,
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
									  ON UPDATE CURRENT_TIMESTAMP(6),
	
    CONSTRAINT uq_oauth_provider_uid UNIQUE (provider, provider_user_id),
    INDEX idx_oauth_user (user_id, provider),
    
    CONSTRAINT fk_oauth_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='OAuth2 연동 계정';

/* ---------------------------------------------------------
   3) Refresh tokens (JWT Refresh Token, 해시 저장 기반)
   - 서버에는 원문 토큰 대신 해시만 저장(token_hash)
   - jti는 토큰 단위 폐기/추적에 사용 가능(UUID bytes 권장)
   - ip_address는 IPv4/IPv6 모두 16바이트를 담을 수 있어 VARBINARY(16) 사용
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS refresh_tokens (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id					BIGINT UNSIGNED NOT NULL,
    
    jti						BINARY(16) NOT NULL,
    token_hash				BINARY(32) NOT NULL,
    
    issued_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at				TIMESTAMP(6) NOT NULL,
    
    consumed_at				TIMESTAMP(6) NULL,
    revoked_at				TIMESTAMP(6) NULL,
    
    ip_address				VARBINARY(16) NULL,
    user_agent				VARCHAR(255) NULL,
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
								  ON UPDATE CURRENT_TIMESTAMP(6),
	
    CONSTRAINT fk_rt_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
        
	CONSTRAINT uq_rt_token_hash UNIQUE (token_hash),
    
    INDEX idx_rt_user_expires (user_id, expires_at),
    INDEX idx_rt_user_state	  (user_id, revoked_at, consumed_at, expires_at),
    INDEX idx_rt_jti		  (jti),
    INDEX idx_rt_expires	  (expires_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='JWT Refresh Token(해시 저장)';

/* ---------------------------------------------------------
   4) Email verification tokens
   - 가입/이메일 변경 목적 구분을 위해 purpose 제공
   - 토큰 원문은 저장하지 않고 hash만 저장
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS email_verifications (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id					BIGINT UNSIGNED NOT NULL,
    
    purpose				ENUM('SIGNUP','CHANGE_EMAIL') NOT NULL DEFAULT 'SIGNUP',
    
    token_hash				BINARY(32) NOT NULL,
    expires_at				TIMESTAMP(6) NOT NULL,
    consumed_at				TIMESTAMP(6) NULL,
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    CONSTRAINT fk_ev_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT uq_ev_user_token UNIQUE (user_id, token_hash),
    CONSTRAINT uq_ev_token_hash UNIQUE (token_hash),
    INDEX idx_ev_expires (expires_at),
    INDEX idx_ev_user_expires (user_id, expires_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='이메일 인증 토큰(해시 저장)';

/* ---------------------------------------------------------
   5) Password reset (one-time)
   - 일회용 비밀번호 재설정 토큰
   - 사용 후 즉시 정리 가능, 토큰 원문은 저장하지 않고 hash만 저장
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS password_resets (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id					BIGINT UNSIGNED NOT NULL,
    
    token_hash				BINARY(32) NOT NULL,
    expires_at				TIMESTAMP(6) NOT NULL,
    consumed_at				TIMESTAMP(6) NULL,
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    CONSTRAINT fk_pr_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT uq_pr_user_token UNIQUE (user_id, token_hash),
    CONSTRAINT uq_pr_token_hash UNIQUE (token_hash),
    INDEX idx_pr_expires (expires_at),
    INDEX idx_pr_user_expires (user_id, expires_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='비밀번호 재설정 토큰(해시 저장)';

/* ---------------------------------------------------------
   6) Favorites (즐겨찾기)
   - (user_id, keyid) PK로 중복 방지
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS user_favorites (
	user_id					BIGINT UNSIGNED NOT NULL,
    keyid					VARCHAR(64) NOT NULL,
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    PRIMARY KEY (user_id, keyid),
    
    CONSTRAINT fk_uf_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_uf_attraction
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_uf_keyid_created (keyid, created_at),
    INDEX idx_uf_user_created  (user_id, created_at, keyid)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

/* ---------------------------------------------------------
   7) Attraction likes (관광지 좋아요)
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS attraction_likes (
	user_id					BIGINT UNSIGNED NOT NULL,
    keyid					VARCHAR(64) NOT NULL,
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    PRIMARY KEY (user_id, keyid),
    
    CONSTRAINT fk_al_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_al_attraction
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_al_keyid_created (keyid, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='attraction likes';

/* ---------------------------------------------------------
   8) Reviews
   - 작성자 탈퇴 후에도 콘텐츠 보존을 위해 user_id는 NULL 허용 + ON DELETE SET NULL
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS attraction_reviews (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    keyid					VARCHAR(64) NOT NULL,
    
    user_id					BIGINT UNSIGNED NULL,
    author_name_snapshot	VARCHAR(80) NULL,
    
    rating					TINYINT UNSIGNED NOT NULL COMMENT '1~5',
    body					TEXT NOT NULL,
    
    is_hidden               TINYINT NOT NULL DEFAULT 0 COMMENT '신고/관리자 조치 처리',
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
										  ON UPDATE CURRENT_TIMESTAMP(6),
	
    CONSTRAINT fk_ar_attraction
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_ar_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
	
    CONSTRAINT chk_ar_rating CHECK (rating BETWEEN 1 AND 5),
    
    INDEX idx_ar_keyid_created (keyid, created_at, id),
    INDEX idx_ar_user_created  (user_id, created_at, id),
    INDEX idx_ar_hidden_keyid  (is_hidden, keyid, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='관광지 리뷰';
CREATE TABLE IF NOT EXISTS review_images (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id				BIGINT UNSIGNED NOT NULL,
    
    image_url				VARCHAR(500) NOT NULL,
    sort_order				INT UNSIGNED NOT NULL DEFAULT 1,
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    CONSTRAINT fk_ri_review
		FOREIGN KEY (review_id) REFERENCES attraction_reviews(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    UNIQUE KEY uq_ri_review_order (review_id, sort_order),
    INDEX idx_ri_review (review_id, sort_order, id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='리뷰 이미지(다중)';
/* ---------------------------------------------------------
   9) Comments (댓글/대댓글)
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS review_comments (
	id						BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id				BIGINT UNSIGNED NOT NULL,
    parent_comment_id		BIGINT UNSIGNED NULL,
    
    user_id					BIGINT UNSIGNED NULL,
    author_name_snapshot	VARCHAR(80) NULL,
    
    body					TEXT NOT NULL,
    is_hidden				TINYINT NOT NULL DEFAULT 0,
    
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
										  ON UPDATE CURRENT_TIMESTAMP(6),
	
    CONSTRAINT fk_rc_review
		FOREIGN KEY (review_id) REFERENCES attraction_reviews(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_rc_parent
		FOREIGN KEY (parent_comment_id) REFERENCES review_comments(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
	
    CONSTRAINT fk_rc_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
	
    INDEX idx_rc_review_created (review_id, created_at, id),
    INDEX idx_rc_parent_created (parent_comment_id, created_at, id),
    INDEX idx_rc_user_created	(user_id, created_at, id),
    INDEX idx_rc_hidden_review	(is_hidden, review_id, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COMMENT='리뷰 댓글/대댓글';

/* ---------------------------------------------------------
   10) Likes (리뷰/댓글 좋아요)
   --------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS review_likes (
	review_id				BIGINT UNSIGNED NOT NULL,
    user_id					BIGINT UNSIGNED NOT NULL,
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    PRIMARY KEY (review_id, user_id),
    
    CONSTRAINT fk_rl_review
		FOREIGN KEY (review_id) REFERENCES attraction_reviews(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_rl_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_rl_review_created (review_id, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='review likes';

CREATE TABLE IF NOT EXISTS comment_likes (
	comment_id				BIGINT UNSIGNED NOT NULL,
    user_id					BIGINT UNSIGNED NOT NULL,
    created_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    
    PRIMARY KEY (comment_id, user_id),
    
    CONSTRAINT fk_cl_comment
		FOREIGN KEY (comment_id) REFERENCES review_comments(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    CONSTRAINT fk_cl_user
		FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_cl_comment_created (comment_id, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='comment likes';

/* ---------------------------------------------------------
   11) 통계 테이블(물리화)
   --------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS attraction_review_stats (
	keyid					VARCHAR(64) NOT NULL,
    review_count			INT UNSIGNED NOT NULL DEFAULT 0,
    rating_sum				BIGINT UNSIGNED NOT NULL DEFAULT 0,
    latest_review_at		TIMESTAMP(6) NULL,
    
    avg_rating				DECIMAL(3,2)
		GENERATED ALWAYS AS (
			CASE WHEN review_count = 0 THEN NULL
				 ELSE ROUND(rating_sum / review_count, 2)
			END
        ) STORED,
	
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
									  ON UPDATE CURRENT_TIMESTAMP(6),
                                          
	PRIMARY KEY (keyid),
    
    CONSTRAINT fk_ars_attraction
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_ars_avg (avg_rating),
    INDEX idx_ars_cnt (review_count)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='관광지 리뷰 통계(물리화)';

CREATE TABLE IF NOT EXISTS review_reaction_stats (
	review_id				BIGINT UNSIGNED NOT NULL,
    like_count				INT UNSIGNED NOT NULL DEFAULT 0,
    comment_count			INT UNSIGNED NOT NULL DEFAULT 0,
    
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
									  ON UPDATE CURRENT_TIMESTAMP(6),
	
    PRIMARY KEY (review_id),
    
    CONSTRAINT fk_rrs_review
		FOREIGN KEY (review_id) REFERENCES attraction_reviews(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_rrs_like (like_count),
    INDEX idx_rrs_comment (comment_count)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='리뷰 반응 통계(물리화)';

CREATE TABLE IF NOT EXISTS attraction_engagement_stats (
	keyid					VARCHAR(64) NOT NULL,
    favorite_count			INT UNSIGNED NOT NULL DEFAULT 0,
    like_count				INT UNSIGNED NOT NULL DEFAULT 0,
    
    updated_at				TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
									  ON UPDATE CURRENT_TIMESTAMP(6),
	
    PRIMARY KEY (keyid),
    
    CONSTRAINT fk_aes_attraction
		FOREIGN KEY (keyid) REFERENCES attractions(keyid)
        ON UPDATE CASCADE ON DELETE CASCADE,
	
    INDEX idx_aes_fav (favorite_count),
    INDEX idx_aes_like (like_count)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='관광지 상호작용 통계(물리화)';

/* ---------------------------------------------------------
   11-4) 통계 수동 리프레시
   - 초기 구축/대량 데이터 정리/복구 시 전체 재계산용
   --------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_refresh_util_stats;

DELIMITER $$
CREATE PROCEDURE sp_refresh_util_stats()
BEGIN
    TRUNCATE TABLE attraction_review_stats;
    INSERT INTO attraction_review_stats (keyid, review_count, rating_sum, latest_review_at)
    SELECT
		r.keyid,
        COUNT(*) AS review_count,
        SUM(r.rating) AS rating_sum,
        MAX(r.created_at) AS latest_review_at
	FROM attraction_reviews r
    WHERE r.is_hidden = 0
    GROUP BY r.keyid;
    
    TRUNCATE TABLE review_reaction_stats;
    INSERT INTO review_reaction_stats (review_id, like_count, comment_count)
    SELECT
		r.id AS review_id,
        (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id) AS like_count,
        (SELECT COUNT(*) FROM review_comments rc WHERE rc.review_id = r.id AND rc.is_hidden = 0) AS comment_count
	FROM attraction_reviews r;
    
    TRUNCATE TABLE attraction_engagement_stats;
    INSERT INTO attraction_engagement_stats (keyid, favorite_count, like_count)
    SELECT
		a.keyid,
        (SELECT COUNT(*) FROM user_favorites uf WHERE uf.keyid = a.keyid) AS favorite_count,
        (SELECT COUNT(*) FROM attraction_likes al WHERE al.keyid = a.keyid) AS like_count
	FROM attractions a;
END$$
DELIMITER ;

/* ---------------------------------------------------------
   12) 트리거 기반 통계 증분 갱신
   --------------------------------------------------------- */
DROP TRIGGER IF EXISTS trg_ar_ai;
DROP TRIGGER IF EXISTS trg_ar_au;
DROP TRIGGER IF EXISTS trg_ar_ad;

DROP TRIGGER IF EXISTS trg_rl_ai;
DROP TRIGGER IF EXISTS trg_rl_ad;

DROP TRIGGER IF EXISTS trg_rc_ai;
DROP TRIGGER IF EXISTS trg_rc_au;
DROP TRIGGER IF EXISTS trg_rc_ad;

DROP TRIGGER IF EXISTS trg_uf_ai;
DROP TRIGGER IF EXISTS trg_uf_ad;

DROP TRIGGER IF EXISTS trg_al_ai;
DROP TRIGGER IF EXISTS trg_al_ad;

DELIMITER $$

CREATE TRIGGER trg_ar_ai
AFTER INSERT ON attraction_reviews
FOR EACH ROW
BEGIN
	IF NEW.is_hidden = 0 THEN
		INSERT INTO attraction_review_stats (keyid, review_count, rating_sum, latest_review_at)
        VALUES (NEW.keyid, 1, NEW.rating, NEW.created_at)
        ON DUPLICATE KEY UPDATE
			review_count		= review_count + 1,
            rating_sum			= rating_sum + NEW.rating,
            latest_review_at	= GREATEST(IFNULL(latest_review_at, NEW.created_at), NEW.created_at);
	END IF;
    
    INSERT INTO review_reaction_stats (review_id, like_count, comment_count)
    VALUES (NEW.id, 0, 0)
    ON DUPLICATE KEY UPDATE
		review_id = review_id;
END$$

CREATE TRIGGER trg_ar_au
AFTER UPDATE ON attraction_reviews
FOR EACH ROW
BEGIN
	DECLARE v_last TIMESTAMP(6);
    
    IF NEW.keyid = OLD.keyid THEN
    
		/* hidden -> visible */
        IF OLD.is_hidden = 0 AND NEW.is_hidden = 1 THEN
			SELECT latest_review_at INTO v_last
            FROM attraction_review_stats
            WHERE keyid = OLD.keyid;
		
			UPDATE attraction_review_stats
            SET review_count = IF(review_count > 0, review_count - 1, 0),
				rating_sum	 = IF(rating_sum >= OLD.rating, rating_sum - OLD.rating, 0)
			WHERE keyid = OLD.keyid;
            
            IF v_last IS NOT NULL AND v_last = OLD.created_at THEN
				SELECT MAX(created_at) INTO v_last
                FROM attraction_reviews
                WHERE keyid = OLD.keyid AND is_hidden = 0;
                
                UPDATE attraction_review_stats
                SET latest_review_at = v_last
                WHERE keyid = OLD.keyid;
			END IF;
            
            UPDATE attraction_review_stats
            SET rating_sum = 0, latest_review_at = NULL
            WHERE keyid = OLD.keyid AND review_count = 0;
		END IF;
        
        /* hidden -> visible */
        IF OLD.is_hidden = 1 AND NEW.is_hidden = 0 THEN
			INSERT INTO attraction_review_stats (keyid, review_count, rating_sum, latest_review_at)
            VALUES (NEW.keyid, 1, NEW.rating, NEW.created_at)
            ON DUPLICATE KEY UPDATE
				review_count		= review_count + 1,
                rating_sum			= rating_sum + NEW.rating,
                latest_review_at	= GREATEST(IFNULL(latest_review_at, NEW.created_at), NEW.created_at);
		END IF;
        
        IF OLD.is_hidden = 0 AND NEW.is_hidden = 0 AND NEW.rating <> OLD.rating THEN
			UPDATE attraction_review_stats
            SET rating_sum = CASE
								WHEN rating_sum >= OLD.rating THEN rating_sum - OLD.rating + NEW.rating
                                ELSE NEW.rating
							 END
			WHERE keyid = NEW.keyid;
		END IF;
	
    ELSE
        IF OLD.is_hidden = 0 THEN
			SELECT latest_review_at INTO v_last
            FROM attraction_review_stats
            WHERE keyid = OLD.keyid;
            
            UPDATE attraction_review_stats
            SET review_count = IF(review_count > 0, review_count - 1, 0),
				rating_sum	 = IF(rating_sum >= OLD.rating, rating_sum - OLD.rating, 0)
			WHERE keyid = OLD.keyid;
            
            IF v_last IS NOT NULL AND v_last = OLD.created_at THEN
				SELECT MAX(created_at) INTO v_last
                FROM attraction_reviews
                WHERE keyid = OLD.keyid AND is_hidden = 0;
                
                UPDATE attraction_review_stats
                SET latest_review_at = v_last
                WHERE keyid = OLD.keyid;
			END IF;
            
            UPDATE attraction_review_stats
            SET rating_sum = 0, latest_review_at = NULL
            WHERE keyid = OLD.keyid AND review_count = 0;
		END IF;
        
        IF NEW.is_hidden = 0 THEN
			INSERT INTO attraction_review_stats (keyid, review_count, rating_sum, latest_review_at)
            VALUES (NEW.keyid, 1, NEW.rating, NEW.created_at)
            ON DUPLICATE KEY UPDATE
				review_count		= review_count + 1,
                rating_sum			= rating_sum + NEW.rating,
                latest_review_at	= GREATEST(IFNULL(latest_review_at, NEW.created_at), NEW.created_at);
		END IF;
        
	END IF;
END$$

CREATE TRIGGER trg_ar_ad
AFTER DELETE ON attraction_reviews
FOR EACH ROW
BEGIN
	DECLARE v_last TIMESTAMP(6);
    
    IF OLD.is_hidden = 0 THEN
		SELECT latest_review_at INTO v_last
        FROM attraction_review_stats
        WHERE keyid = OLD.keyid;
        
        UPDATE attraction_review_stats
        SET review_count = IF(review_count > 0, review_count - 1, 0),
			rating_sum	 = IF(rating_sum >= OLD.rating, rating_sum - OLD.rating, 0)
		WHERE keyid = OLD.keyid;
        
        IF v_last IS NOT NULL AND v_last = OLD.created_at THEN
			SELECT MAX(created_at) INTO v_last
            FROM attraction_reviews
            WHERE keyid = OLD.keyid AND is_hidden = 0;
            
            UPDATE attraction_review_stats
            SET latest_review_at = v_last
            WHERE keyid = OLD.keyid;
		END IF;
        
        UPDATE attraction_review_stats
        SET rating_sum = 0, latest_review_at = NULL
        WHERE keyid = OLD.keyid AND review_count = 0;
	END IF;
END$$

CREATE TRIGGER trg_rl_ai
AFTER INSERT ON review_likes
FOR EACH ROW
BEGIN
	INSERT INTO review_reaction_stats (review_id, like_count, comment_count)
    VALUES (NEW.review_id, 1, 0)
    ON DUPLICATE KEY UPDATE
		like_count = like_count + 1;
END$$

CREATE TRIGGER trg_rl_ad
AFTER DELETE ON review_likes
FOR EACH ROW
BEGIN
	UPDATE review_reaction_stats
    SET like_count = IF(like_count > 0, like_count - 1, 0)
    WHERE review_id = OLD.review_id;
END$$

CREATE TRIGGER trg_rc_ai
AFTER INSERT ON review_comments
FOR EACH ROW
BEGIN
	IF NEW.is_hidden = 0 THEN
		INSERT INTO review_reaction_stats (review_id, like_count, comment_count)
        VALUES (NEW.review_id, 0, 1)
        ON DUPLICATE KEY UPDATE
			comment_count = comment_count + 1;
	END IF;
END$$

CREATE TRIGGER trg_rc_au
AFTER UPDATE ON review_comments
FOR EACH ROW
BEGIN
    IF OLD.review_id = NEW.review_id THEN
		IF OLD.is_hidden = 0 AND NEW.is_hidden = 1 THEN
			UPDATE review_reaction_stats
            SET comment_count = IF(comment_count > 0, comment_count - 1, 0)
            WHERE review_id = NEW.review_id;
		END IF;
        
        IF OLD.is_hidden = 1 AND NEW.is_hidden = 0 THEN
			INSERT INTO review_reaction_stats (review_id, like_count, comment_count)
            VALUES (NEW.review_id, 0, 1)
            ON DUPLICATE KEY UPDATE
				comment_count = comment_count + 1;
		END IF;
	ELSE
		IF OLD.is_hidden = 0 THEN
			UPDATE review_reaction_stats
            SET comment_count = IF(comment_count > 0, comment_count - 1, 0)
            WHERE review_id = OLD.review_id;
		END IF;

		IF NEW.is_hidden = 0 THEN
			INSERT INTO review_reaction_stats (review_id, like_count, comment_count)
            VALUES (NEW.review_id, 0, 1)
            ON DUPLICATE KEY UPDATE
				comment_count = comment_count + 1;
		END IF;
	END IF;
END$$

CREATE TRIGGER trg_rc_ad
AFTER DELETE ON review_comments
FOR EACH ROW
BEGIN
	IF OLD.is_hidden = 0 THEN
		UPDATE review_reaction_stats
		SET comment_count = IF(comment_count > 0, comment_count - 1, 0)
		WHERE review_id = OLD.review_id;
	END IF;
END$$

CREATE TRIGGER trg_uf_ai
AFTER INSERT ON user_favorites
FOR EACH ROW
BEGIN
	INSERT INTO attraction_engagement_stats (keyid, favorite_count, like_count)
    VALUES (NEW.keyid, 1, 0)
    ON DUPLICATE KEY UPDATE
		favorite_count = favorite_count + 1;
END$$

CREATE TRIGGER trg_uf_ad
AFTER DELETE ON user_favorites
FOR EACH ROW
BEGIN
	UPDATE attraction_engagement_stats
    SET favorite_count = IF(favorite_count > 0, favorite_count - 1, 0)
    WHERE keyid = OLD.keyid;
END$$

CREATE TRIGGER trg_al_ai
AFTER INSERT ON attraction_likes
FOR EACH ROW
BEGIN
	INSERT INTO attraction_engagement_stats (keyid, favorite_count, like_count)
    VALUES (NEW.keyid, 0, 1)
    ON DUPLICATE KEY UPDATE
		like_count = like_count + 1;
END$$

CREATE TRIGGER trg_al_ad
AFTER DELETE ON attraction_likes
FOR EACH ROW
BEGIN
	UPDATE attraction_engagement_stats
    SET like_count = IF(like_count > 0, like_count - 1, 0)
    WHERE keyid = OLD.keyid;
END$$

DELIMITER ;

/* ---------------------------------------------------------
   13) 조회용 View 세트
   - 카드/목록에서 필요한 데이터를 JOIN 1회로 제공
   - 최단 접근수단은 3_BUILD의 attraction_transit_summary + transit_access(최단 1건) 조합
   - 보행 시간은 4.5km/h(=75m/min) 기준으로 즉시 계산
   --------------------------------------------------------- */

DROP VIEW IF EXISTS vw_attraction_review_stats;
DROP VIEW IF EXISTS vw_review_counts;

DROP VIEW IF EXISTS vw_attraction_cards;
CREATE OR REPLACE VIEW vw_attraction_cards AS
SELECT
	a.keyid,
    a.place_name,
    a.address,
    a.image_url,
    a.category_name,
    a.ctprvn_nm, a.signgu_nm, a.emd_nm,
    a.latitude, a.longitude,
    a.has_coord,

COALESCE(rs.review_count, 0) AS review_count,
rs.avg_rating,
rs.latest_review_at,

COALESCE(es.favorite_count, 0) AS favorite_count,
COALESCE(es.like_count, 0)	   AS attraction_like_count,

ts.total_transit_count,
ts.nearest_distance_m,
ROUND(ts.nearest_distance_m / 1000, 3) AS nearest_distance_km,
meters_to_walk_minutes(ts.nearest_distance_m) AS nearest_walk_min,

ts.nearest_transport_code AS nearest_mode_code,
tt.`name`				  AS nearest_mode_name,

ta.facility_name		  AS nearest_facility_name,
ta.facility_address		  AS nearest_facility_address,
ta.bus_stop_no			  AS nearest_bus_stop_no,
ta.entrance_name		  AS nearest_entrance_name,
ts.nearest_access_no

FROM attractions a
LEFT JOIN attraction_review_stats rs		ON rs.keyid = a.keyid
LEFT JOIN attraction_engagement_stats es	ON es.keyid = a.keyid
LEFT JOIN attraction_transit_summary ts		ON ts.keyid = a.keyid
LEFT JOIN transit_types tt					ON tt.`code` = ts.nearest_transport_code
LEFT JOIN transit_access ta					ON ta.access_no = ts.nearest_access_no;

DROP VIEW IF EXISTS vw_user_favorites_detail;
CREATE OR REPLACE VIEW vw_user_favorites_detail AS
SELECT
	uf.user_id,
    uf.keyid,
    uf.created_at AS favored_at,
    
    c.place_name, c.address, c.image_url, c.category_name,
    c.ctprvn_nm, c.signgu_nm, c.emd_nm,
    c.latitude, c.longitude, c.has_coord,
    
    c.review_count, c.avg_rating, c.latest_review_at,
    c.favorite_count, c.attraction_like_count,
    
    c.total_transit_count,
    c.nearest_distance_m, c.nearest_distance_km, c.nearest_walk_min,
    c.nearest_mode_code, c.nearest_mode_name,
    c.nearest_facility_name, c.nearest_facility_address,
    c.nearest_bus_stop_no, c.nearest_entrance_name,
    c.nearest_access_no
FROM user_favorites uf
JOIN vw_attraction_cards c ON c.keyid = uf.keyid;

/* ---------------------------------------------------------
   14) 정리 프로시저 & 이벤트(만료 토큰 청소)
   - 토큰 테이블 적재 방지 및 조회 성능 유지
   - 이벤트 스케줄러가 ON이면 자동 실행, OFF면 수동 CALL 운영 가능
   --------------------------------------------------------- */
DROP PROCEDURE IF EXISTS sp_cleanup_auth_minimal;

DELIMITER $$
CREATE PROCEDURE sp_cleanup_auth_minimal()
BEGIN
    SET time_zone = '+00:00';
    
    DELETE FROM refresh_tokens
    WHERE expires_at < UTC_TIMESTAMP(6)
       OR revoked_at IS NOT NULL
       OR (consumed_at IS NOT NULL AND consumed_at < UTC_TIMESTAMP(6) - INTERVAL 7 DAY);
	
    DELETE FROM email_verifications
    WHERE expires_at < UTC_TIMESTAMP(6)
       OR consumed_at IS NOT NULL;
	
    DELETE FROM password_resets
    WHERE expires_at < UTC_TIMESTAMP(6)
       OR consumed_at IS NOT NULL;
END$$
DELIMITER ;

DROP EVENT IF EXISTS ev_cleanup_auth_minimal;

CREATE EVENT ev_cleanup_auth_minimal
	ON SCHEDULE EVERY 1 DAY
    STARTS (UTC_DATE() + INTERVAL 3 HOUR)
    DO CALL sp_cleanup_auth_minimal();

/* ---------------------------------------------------------
   15) 초기 1회 리프레시
   - 기존 데이터가 있는 상태에서 트리거 생성 전에 쌓인 데이터를 수동 리프레시로 정합
   --------------------------------------------------------- */
CALL sp_refresh_util_stats();

/* ---------------------------------------------------------
   16) 간단 검증
   --------------------------------------------------------- */
SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'oauth_accounts', COUNT(*) FROM oauth_accounts
UNION ALL SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'email_verifications', COUNT(*) FROM email_verifications
UNION ALL SELECT 'password_resets', COUNT(*) FROM password_resets
UNION ALL SELECT 'user_favorites', COUNT(*) FROM user_favorites
UNION ALL SELECT 'attraction_likes', COUNT(*) FROM attraction_likes
UNION ALL SELECT 'attraction_reviews', COUNT(*) FROM attraction_reviews
UNION ALL SELECT 'review_images', COUNT(*) FROM review_images
UNION ALL SELECT 'review_comments', COUNT(*) FROM review_comments
UNION ALL SELECT 'review_likes', COUNT(*) FROM review_likes
UNION ALL SELECT 'comment_likes', COUNT(*) FROM comment_likes
UNION ALL SELECT 'attraction_review_stats', COUNT(*) FROM attraction_review_stats
UNION ALL SELECT 'review_reaction_stats', COUNT(*) FROM review_reaction_stats
UNION ALL SELECT 'attraction_engagement_stats', COUNT(*) FROM attraction_engagement_stats;
