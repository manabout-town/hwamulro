-- ============================================================
-- 019: 매칭 이용료(기사 과금) 테이블
-- ============================================================
-- 매칭 성사 시 기사에게 부과하는 건당 정액 이용료. 결제(paid)해야
-- 상대 연락처·채팅이 열리고, 24h 미결제 시 매칭 자동취소.
-- 탁송 대금과 무관한 중개 서비스 이용료 → 자금세탁/에스크로 조항 회피.
-- 선행: 018(is_shipper_of_order 헬퍼)에 의존.

CREATE TABLE IF NOT EXISTS match_fees (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id          uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount            integer NOT NULL CHECK (amount >= 0),
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','refunded','cancelled')),
  toss_payment_key  text,
  toss_order_no     text,
  paid_at           timestamptz,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id)
);

CREATE INDEX IF NOT EXISTS idx_match_fees_match_id ON match_fees(match_id);
CREATE INDEX IF NOT EXISTS idx_match_fees_status_expires ON match_fees(status, expires_at);

ALTER TABLE match_fees ENABLE ROW LEVEL SECURITY;

-- 조회: 해당 기사, 또는 매칭 화주(018 SECURITY DEFINER 헬퍼 재사용 → 재귀 회피)
DROP POLICY IF EXISTS "match_fees_select" ON match_fees;
CREATE POLICY "match_fees_select" ON match_fees FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_id AND public.is_shipper_of_order(m.order_id, auth.uid())
    )
  );
-- insert/update는 서버(service-role)만 → 유저 정책 없음(기본 거부)
