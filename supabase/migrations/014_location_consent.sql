-- 개인위치정보 이용동의 (위치정보의 보호 및 이용 등에 관한 법률)
-- POL-081 / OPS-002: GPS 수집 전 별도 동의 + 서버측 강제 + 완료 후 파기

-- 1. 현재 동의 상태 빠른 조회용 컬럼 (NULL = 미동의)
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_consent_at TIMESTAMPTZ;

-- 2. 동의 이력 로그 (동의/철회 감사 추적)
CREATE TABLE IF NOT EXISTS location_consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consented    BOOLEAN NOT NULL,
  purpose      TEXT NOT NULL DEFAULT '실시간 탁송 위치 공유',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_location_consents_user ON location_consents(user_id, created_at DESC);

ALTER TABLE location_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user reads own consent log"
  ON location_consents FOR SELECT
  USING (user_id = auth.uid());

-- 3. 위치 직접 upsert 차단 — 클라이언트 쓰기 정책 제거 (이후 서버 라우트(service role)로만 기록)
DROP POLICY IF EXISTS "driver can upsert own location" ON driver_locations;
-- SELECT 정책("match participants can read location")은 유지.
