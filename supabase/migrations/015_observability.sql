-- OPS-001 / 관측성: 결제 정합성 대사 + 에러 로그
-- 결제 승인–에스크로 기록 부분실패("돈만 빠지고 미기록") 탐지·복구 기반

-- 1. 결제 시도 로그 — Toss 승인 호출 '이전'에 기록 → 대사(reconcile)로 escrow 누락 검출
CREATE TABLE IF NOT EXISTS payment_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_key   TEXT NOT NULL UNIQUE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  shipper_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,                         -- escrow | urgent
  amount        BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'attempted'
                CHECK (status IN ('attempted','confirmed','failed')),
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status, created_at);

-- 2. 에러 로그 (경량 자체 관측성)
CREATE TABLE IF NOT EXISTS error_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,
  message     TEXT NOT NULL,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);

-- 두 테이블 모두 service role 전용 (RLS on, 클라이언트 정책 없음 → 클라 접근 차단)
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
