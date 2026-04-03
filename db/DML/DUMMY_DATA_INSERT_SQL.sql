-- ============================================================================
-- Busan Hiker - Dummy Seed v4 + Scenarios (UTC-safe, Idempotent, Transactional)
-- ============================================================================

USE busan_hiker;
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- ✅ 모든 연산을 UTC 기준으로 강제
SET time_zone = '+00:00';

-- ✅ 상수(운영 TTL과 동일하게 유지 가능)
SET @RT_DAYS    := 14;   -- Refresh Token TTL (days)
SET @RESET_MIN  := 30;   -- Password Reset TTL (minutes)

-- ✅ 시나리오 토글 (필요 시 0으로 끄세요)
SET @SCN_CONSUMED := 1;  -- 소비된 토큰 만들기
SET @SCN_REVOKED  := 1;  -- 폐기된 토큰 만들기
SET @SCN_EXPIRED  := 1;  -- 이미 만료된 토큰 1건 추가

-- 트랜잭션 & 세이프 모드
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
SET SQL_SAFE_UPDATES = 0;

-- 0) 샘플 관광지 키 확보 (없으면 이후 삽입 일부 스킵)
SET @a1 := (SELECT key_id FROM attractions ORDER BY key_id LIMIT 1 OFFSET 0);
SET @a2 := (SELECT key_id FROM attractions ORDER BY key_id LIMIT 1 OFFSET 1);
SET @a3 := (SELECT key_id FROM attractions ORDER BY key_id LIMIT 1 OFFSET 2);

-- 1) Users (존재 시 미삽입)
INSERT INTO users (email, password_hash, display_name, role, email_verified_at, is_active)
SELECT * FROM (
  SELECT 'admin@bh.kr'  AS email, '$argon2id$v=19$m=65536,t=3,p=2$ZHVtbXk$abcdefghijklmnop' AS password_hash, '관리자'  AS display_name, 'ADMIN'  AS role, UTC_TIMESTAMP() AS email_verified_at, 1 AS is_active
  UNION ALL
  SELECT 'hiker1@bh.kr', '$argon2id$v=19$m=65536,t=3,p=2$ZHVtbXk$qrstuvwxyz012345',         '도보러',                           'MEMBER', UTC_TIMESTAMP(), 1
  UNION ALL
  SELECT 'social@bh.kr', NULL,                                                             '소셜유저',                         'MEMBER', NULL, 1
) AS s
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = s.email);

-- 사용자 ID 캐싱
SET @uid_admin  := (SELECT id FROM users WHERE email='admin@bh.kr');
SET @uid_hiker1 := (SELECT id FROM users WHERE email='hiker1@bh.kr');
SET @uid_social := (SELECT id FROM users WHERE email='social@bh.kr');

-- 2) OAuth Accounts (존재 시 미삽입)
INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, profile_name, avatar_url)
SELECT @uid_hiker1, 'GOOGLE', 'google-uid-1001', 'hiker1@bh.kr', 'Hiker One', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM oauth_accounts
  WHERE user_id=@uid_hiker1 AND provider='GOOGLE' AND provider_user_id='google-uid-1001'
);

INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, profile_name, avatar_url)
SELECT @uid_social, 'KAKAO', 'kakao-uid-2001', NULL, '소셜유저', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM oauth_accounts
  WHERE user_id=@uid_social AND provider='KAKAO' AND provider_user_id='kakao-uid-2001'
);

-- 3) Refresh Tokens (고정 jti/hash, 존재 시 미삽입)
SET @jti_hiker1 := UUID_TO_BIN('11111111-1111-4111-8111-111111111111', TRUE);
SET @jti_social := UUID_TO_BIN('22222222-2222-4222-8222-222222222222', TRUE);

INSERT INTO refresh_tokens (user_id, jti, token_hash, issued_at, expires_at, ip_address, user_agent)
SELECT
  @uid_hiker1,
  @jti_hiker1,
  UNHEX('0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'),
  UTC_TIMESTAMP(),
  DATE_ADD(UTC_TIMESTAMP(), INTERVAL @RT_DAYS DAY),
  INET6_ATON('203.0.113.10'),
  'Mozilla/5.0 (Windows NT 10.0)'
WHERE NOT EXISTS (SELECT 1 FROM refresh_tokens WHERE jti = @jti_hiker1);

INSERT INTO refresh_tokens (user_id, jti, token_hash, issued_at, expires_at, ip_address, user_agent)
SELECT
  @uid_social,
  @jti_social,
  UNHEX('FEDCBA9876543210FEDCBA9876543210CAFEBABEDEADBEEF0011223344556677'),
  UTC_TIMESTAMP(),
  DATE_ADD(UTC_TIMESTAMP(), INTERVAL @RT_DAYS DAY),
  INET6_ATON('2001:db8::1'),
  'okhttp/4.10'
WHERE NOT EXISTS (SELECT 1 FROM refresh_tokens WHERE jti = @jti_social);

-- 4) Password Reset (1회용, 존재시 무시)
INSERT IGNORE INTO password_resets (user_id, token_hash, expires_at)
VALUES (
  @uid_hiker1,
  UNHEX('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  DATE_ADD(UTC_TIMESTAMP(), INTERVAL @RESET_MIN MINUTE)
);

-- 5) Reviews (존재 시 미삽입)
INSERT INTO attraction_reviews (attraction_id, user_id, rating, body)
SELECT @a1, @uid_hiker1, 5, '해변 산책로가 좋아요. 환승도 편리합니다.'
WHERE @a1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM attraction_reviews WHERE attraction_id=@a1 AND user_id=@uid_hiker1);

INSERT INTO attraction_reviews (attraction_id, user_id, rating, body)
SELECT @a2, @uid_social, 4, '주말엔 붐비지만 도보 접근성이 좋네요.'
WHERE @a2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM attraction_reviews WHERE attraction_id=@a2 AND user_id=@uid_social);

INSERT INTO attraction_reviews (attraction_id, user_id, rating, body)
SELECT @a3, @uid_social, 3, '경사 구간이 조금 힘들 수 있어요.'
WHERE @a3 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM attraction_reviews WHERE attraction_id=@a3 AND user_id=@uid_social);

-- 리뷰 ID 캐싱
SET @r1 := (SELECT id FROM attraction_reviews WHERE attraction_id=@a1 AND user_id=@uid_hiker1 ORDER BY id DESC LIMIT 1);
SET @r2 := (SELECT id FROM attraction_reviews WHERE attraction_id=@a2 AND user_id=@uid_social ORDER BY id DESC LIMIT 1);
SET @r3 := (SELECT id FROM attraction_reviews WHERE attraction_id=@a3 AND user_id=@uid_social ORDER BY id DESC LIMIT 1);

-- 5-1) Review images (중복 URL 방지)
INSERT INTO review_images (review_id, image_url, sort_order)
SELECT @r1, 'https://picsum.photos/id/1018/800/600', 1
WHERE @r1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM review_images WHERE review_id=@r1 AND image_url='https://picsum.photos/id/1018/800/600');

INSERT INTO review_images (review_id, image_url, sort_order)
SELECT @r1, 'https://picsum.photos/id/1025/800/600', 2
WHERE @r1 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM review_images WHERE review_id=@r1 AND image_url='https://picsum.photos/id/1025/800/600');

INSERT INTO review_images (review_id, image_url, sort_order)
SELECT @r2, 'https://picsum.photos/id/1039/800/600', 1
WHERE @r2 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM review_images WHERE review_id=@r2 AND image_url='https://picsum.photos/id/1039/800/600');

-- 6) Comments (중복 방지)
INSERT INTO review_comments (review_id, user_id, body)
SELECT @r1, @uid_social, '정보 감사합니다! 아침 시간대 추천 드려요.'
WHERE @r1 IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM review_comments WHERE review_id=@r1 AND user_id=@uid_social
      AND body='정보 감사합니다! 아침 시간대 추천 드려요.'
  );

INSERT INTO review_comments (review_id, user_id, body)
SELECT @r2, @uid_hiker1, '동의합니다. 표지판이 잘 되어 있네요.'
WHERE @r2 IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM review_comments WHERE review_id=@r2 AND user_id=@uid_hiker1
      AND body='동의합니다. 표지판이 잘 되어 있네요.'
  );

-- 6-1) Likes (PK 중복 자동 차단)
INSERT IGNORE INTO review_likes (review_id, user_id) VALUES
(@r1, @uid_social),
(@r1, @uid_hiker1),
(@r2, @uid_hiker1);

-- 7) Favorites (PK 중복 자동 차단)
INSERT IGNORE INTO user_favorites (user_id, attraction_id) VALUES
(@uid_hiker1, @a1),
(@uid_hiker1, @a2),
(@uid_social, @a3);

-- 8) 집계 리프레시
CALL sp_refresh_attraction_transit_summary();

-- --------------------------------------------------------------------------
-- 9) Scenarios (테스트 목적) - 토글 변수로 제어
-- --------------------------------------------------------------------------

-- A) 소비(consumed): hiker1의 RT를 10일 전에 소비한 상태로 설정(정리 정책 검증)
UPDATE refresh_tokens
   SET consumed_at = UTC_TIMESTAMP() - INTERVAL 10 DAY,
       updated_at  = UTC_TIMESTAMP() - INTERVAL 10 DAY
 WHERE jti = @jti_hiker1
   AND consumed_at IS NULL
   AND @SCN_CONSUMED = 1;

-- B) 폐기(revoked): social의 RT를 1시간 전에 폐기 상태로 설정
UPDATE refresh_tokens
   SET revoked_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
 WHERE jti = @jti_social
   AND revoked_at IS NULL
   AND @SCN_REVOKED = 1;

-- C) 만료(expired): hiker1에 만료된 토큰 1건 추가(고유 jti/hash 사용)
--    uk_rt_token_hash 충돌 피하려고 새로운 해시 사용
SET @jti_expired := UUID_TO_BIN('33333333-3333-4333-8333-333333333333', TRUE);
INSERT INTO refresh_tokens (user_id, jti, token_hash, issued_at, expires_at, ip_address, user_agent)
SELECT
  @uid_hiker1,
  @jti_expired,
  UNHEX('B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2B2'),
  UTC_TIMESTAMP() - INTERVAL 2 HOUR,
  UTC_TIMESTAMP() - INTERVAL 1 HOUR,
  INET6_ATON('198.51.100.5'),
  'dummy/1.0'
WHERE @SCN_EXPIRED = 1
  AND NOT EXISTS (SELECT 1 FROM refresh_tokens WHERE jti=@jti_expired);

-- 커밋
SET SQL_SAFE_UPDATES = 1;
COMMIT;

-- --------------------------------------------------------------------------
-- 10) Quick sanity checks
-- --------------------------------------------------------------------------
SELECT NOW() AS now_local, UTC_TIMESTAMP() AS now_utc, TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS diff;

SELECT 'users' AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'oauth_accounts', COUNT(*) FROM oauth_accounts
UNION ALL SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'password_resets', COUNT(*) FROM password_resets
UNION ALL SELECT 'attraction_reviews', COUNT(*) FROM attraction_reviews
UNION ALL SELECT 'review_images', COUNT(*) FROM review_images
UNION ALL SELECT 'review_comments', COUNT(*) FROM review_comments
UNION ALL SELECT 'review_likes', COUNT(*) FROM review_likes
UNION ALL SELECT 'user_favorites', COUNT(*) FROM user_favorites;

-- 시나리오 대상 토큰 상태 확인
SELECT
  HEX(jti) AS jti_hex,
  consumed_at, revoked_at, issued_at, expires_at, updated_at
FROM refresh_tokens
WHERE jti IN (@jti_hiker1, @jti_social, @jti_expired);

-- 뷰 프리뷰
SELECT * FROM vw_attraction_cards
ORDER BY nearest_distance_m IS NULL, nearest_distance_m
LIMIT 10;

SELECT * FROM vw_user_favorites_detail
ORDER BY favored_at DESC
LIMIT 10;

SELECT access_id, key_id, transport_code, transport_name, distance_m, est_walk_min
FROM vw_nearest_transit_overall_1
LIMIT 10;

-- ============================================================================
-- End of Seed v4 + Scenarios
-- ============================================================================
