-- ============================================================
-- 017: 앱인토스 토스로그인 사용자 매핑
-- users.toss_user_key — 토스 userKey ↔ users 레코드 매핑
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS toss_user_key TEXT;

-- 매핑 유일성 (한 토스 유저 = 한 users 레코드)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_toss_user_key
  ON users(toss_user_key)
  WHERE toss_user_key IS NOT NULL;
