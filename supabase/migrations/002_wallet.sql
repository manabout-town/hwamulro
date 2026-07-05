-- ============================================================
-- 탁카 지갑 / 거래내역 스키마
-- ============================================================

-- 사용자 지갑
CREATE TABLE IF NOT EXISTS wallets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  points      INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- 거래 내역
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN (
    'deposit',          -- 충전
    'withdrawal',       -- 출금
    'escrow_hold',      -- 에스크로 보관 (화주)
    'escrow_release',   -- 에스크로 해제 → 기사 수령
    'escrow_refund',    -- 에스크로 환불
    'point_earn',       -- 포인트 적립
    'point_use',        -- 포인트 사용
    'payout'            -- 기사 정산 지급
  )),
  amount          INTEGER NOT NULL,              -- 양수=입금, 음수=출금
  balance_after   INTEGER NOT NULL DEFAULT 0,
  points_change   INTEGER NOT NULL DEFAULT 0,
  points_after    INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL DEFAULT '',
  reference_id    TEXT,                          -- order_id, match_id 등 연관 ID
  status          TEXT NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('pending', 'completed', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id  ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type      ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created   ON wallet_transactions(created_at DESC);

-- 출금 요청
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL CHECK (amount >= 10000),
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  account_holder  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  rejected_reason TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON withdrawal_requests(user_id);

-- 기존 사용자에게 지갑 자동 생성
INSERT INTO wallets (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- 신규 사용자 지갑 자동 생성 트리거
CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_created_wallet ON users;
CREATE TRIGGER on_user_created_wallet
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_wallet_for_user();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- 지갑: 본인만
CREATE POLICY "wallets_select" ON wallets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wallets_update" ON wallets
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 거래내역: 본인만
CREATE POLICY "wallet_tx_select" ON wallet_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 출금 요청: 본인만 조회/생성, 관리자는 전체
CREATE POLICY "withdrawal_select" ON withdrawal_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "withdrawal_insert" ON withdrawal_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
