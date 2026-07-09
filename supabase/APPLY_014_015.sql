-- ============================================================
-- 탁카 프로덕션 적용용 통합 마이그레이션 (014 + 015)
-- Supabase Dashboard → SQL Editor 에 전체 붙여넣고 Run
-- 재실행 안전(idempotent). 프로젝트: ypqwifcbgemmaatnzcbb
-- ============================================================

-- ===== 014: 개인위치정보 이용동의 =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_consent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS location_consents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consented    BOOLEAN NOT NULL,
  purpose      TEXT NOT NULL DEFAULT '실시간 탁송 위치 공유',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_location_consents_user ON location_consents(user_id, created_at DESC);

ALTER TABLE location_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user reads own consent log" ON location_consents;
CREATE POLICY "user reads own consent log"
  ON location_consents FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "driver can upsert own location" ON driver_locations;

-- ===== 015: 관측성 (결제 대사 + 에러 로그) =====
CREATE TABLE IF NOT EXISTS payment_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_key   TEXT NOT NULL UNIQUE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  shipper_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'attempted'
                CHECK (status IN ('attempted','confirmed','failed')),
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status, created_at);

CREATE TABLE IF NOT EXISTS error_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,
  message     TEXT NOT NULL,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
