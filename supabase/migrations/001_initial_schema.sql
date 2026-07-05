-- ============================================================
-- 탁카 플랫폼 초기 스키마
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  phone       TEXT,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('shipper', 'driver', 'admin')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DRIVER PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  vehicle_number   TEXT NOT NULL,
  vehicle_type     TEXT NOT NULL,
  business_number  TEXT,
  is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg       FLOAT NOT NULL DEFAULT 0,
  rating_count     INT NOT NULL DEFAULT 0
);

-- ============================================================
-- SHIPPER PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS shipper_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name     TEXT,
  business_number  TEXT
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipper_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin        TEXT NOT NULL,
  destination   TEXT NOT NULL,
  cargo_type    TEXT NOT NULL,
  cargo_detail  TEXT,
  price         INTEGER NOT NULL CHECK (price >= 0),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','matched','in_progress','completed','cancelled','disputed')),
  is_urgent     BOOLEAN NOT NULL DEFAULT FALSE,
  urgent_fee    INTEGER NOT NULL DEFAULT 0,
  pickup_at     TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_shipper_id ON orders(shipper_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_at ON orders(pickup_at);
CREATE INDEX IF NOT EXISTS idx_orders_is_urgent ON orders(is_urgent DESC);

-- ============================================================
-- MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'accepted'
                CHECK (status IN ('accepted','in_progress','completed','cancelled')),
  matched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE(order_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_order_id ON matches(order_id);
CREATE INDEX IF NOT EXISTS idx_matches_driver_id ON matches(driver_id);

-- ============================================================
-- ESCROW
-- ============================================================
CREATE TABLE IF NOT EXISTS escrow (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  match_id            UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  total_amount        INTEGER NOT NULL CHECK (total_amount >= 0),
  platform_fee        INTEGER NOT NULL DEFAULT 0,
  driver_payout       INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'held'
                      CHECK (status IN ('held','released','refunded','disputed')),
  pg_transaction_id   TEXT,
  held_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escrow_order_id ON escrow(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_match_id ON escrow(match_id);

-- ============================================================
-- PAYOUTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payouts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  escrow_id   UUID NOT NULL REFERENCES escrow(id) ON DELETE CASCADE,
  driver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at     TIMESTAMPTZ
);

-- ============================================================
-- URGENT PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS urgent_payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipper_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount              INTEGER NOT NULL DEFAULT 1000,
  pg_transaction_id   TEXT,
  status              TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded')),
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CHATS
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chats_match_id ON chats(match_id);
CREATE INDEX IF NOT EXISTS idx_chats_sent_at ON chats(sent_at);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reviewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id, reviewer_id)
);

-- ============================================================
-- DISPUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id      UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  escrow_id     UUID REFERENCES escrow(id),
  raised_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','investigating','resolved')),
  resolution    TEXT CHECK (resolution IN ('driver_win','shipper_win','partial_refund')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipper_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE urgent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES
-- ============================================================

-- USERS: 자신의 정보만 수정, 전체 조회는 인증 사용자
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- DRIVER_PROFILES: 공개 조회, 본인만 수정
CREATE POLICY "driver_profiles_select" ON driver_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "driver_profiles_insert" ON driver_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "driver_profiles_update" ON driver_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- SHIPPER_PROFILES
CREATE POLICY "shipper_profiles_select" ON shipper_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "shipper_profiles_insert" ON shipper_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "shipper_profiles_update" ON shipper_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ORDERS: 대기 중은 기사들도 조회, 본인 의뢰는 수정 가능
CREATE POLICY "orders_select_pending" ON orders FOR SELECT TO authenticated
  USING (status = 'pending' OR shipper_id = auth.uid() OR
    EXISTS (SELECT 1 FROM matches WHERE matches.order_id = id AND matches.driver_id = auth.uid()));
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated
  WITH CHECK (shipper_id = auth.uid());
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated
  USING (shipper_id = auth.uid() OR
    EXISTS (SELECT 1 FROM matches WHERE matches.order_id = id AND matches.driver_id = auth.uid()));

-- MATCHES: 당사자만 조회/생성
CREATE POLICY "matches_select" ON matches FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.shipper_id = auth.uid()));
CREATE POLICY "matches_insert" ON matches FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid());
CREATE POLICY "matches_update" ON matches FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.shipper_id = auth.uid()));

-- ESCROW: 당사자만
CREATE POLICY "escrow_select" ON escrow FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM matches m
    JOIN orders o ON o.id = m.order_id
    WHERE m.id = match_id AND (m.driver_id = auth.uid() OR o.shipper_id = auth.uid())
  ));

-- CHATS: 해당 매칭 당사자만
CREATE POLICY "chats_select" ON chats FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM matches m
    JOIN orders o ON o.id = m.order_id
    WHERE m.id = match_id AND (m.driver_id = auth.uid() OR o.shipper_id = auth.uid())
  ));
CREATE POLICY "chats_insert" ON chats FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM matches m
      JOIN orders o ON o.id = m.order_id
      WHERE m.id = match_id AND (m.driver_id = auth.uid() OR o.shipper_id = auth.uid())
    )
  );

-- REVIEWS: 공개 조회, 본인만 작성
CREATE POLICY "reviews_select" ON reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "reviews_insert" ON reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

-- DISPUTES: 당사자 및 관리자
CREATE POLICY "disputes_select" ON disputes FOR SELECT TO authenticated
  USING (raised_by = auth.uid() OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "disputes_insert" ON disputes FOR INSERT TO authenticated
  WITH CHECK (raised_by = auth.uid());

-- PAYOUTS: 해당 기사만
CREATE POLICY "payouts_select" ON payouts FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

-- URGENT_PAYMENTS: 해당 화주만
CREATE POLICY "urgent_payments_select" ON urgent_payments FOR SELECT TO authenticated
  USING (shipper_id = auth.uid());

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE chats;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
