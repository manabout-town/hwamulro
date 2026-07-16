-- ============================================================
-- APPLY_018_021: 프로덕션 일괄 적용 (대시보드 SQL Editor에 그대로 붙여넣기)
-- 순서 의존: 018 헬퍼 → 019 match_fees → 020 페이월 → 021 환불 컬럼
-- 전부 멱등(IF EXISTS/IF NOT EXISTS/OR REPLACE) — 재실행 안전
-- ⚠️ 적용 전: 새 웹 코드가 먼저 배포되어 있어야 함(020이 users RLS를 본인행으로 제한)
-- ============================================================

-- ▼▼▼ migrations/018_fix_orders_matches_rls_recursion.sql ▼▼▼
-- ============================================================
-- 018: orders ↔ matches RLS 무한재귀 수정
-- ============================================================
-- 증상: 유저 세션으로 orders(또는 chats) 조회 시
--   "infinite recursion detected in policy for relation orders"
-- 원인: orders_select_pending 정책이 matches를 EXISTS로 참조하고,
--   matches_select 정책이 다시 orders를 EXISTS로 참조 → 상호 재귀.
--   (웹앱은 service-role로 조회해 RLS를 우회하므로 드러나지 않았고,
--    앱인토스 미니앱은 유저 세션으로 조회해 최초로 노출됨)
-- 해결: 교차 테이블 체크를 SECURITY DEFINER 함수로 감싸 내부 RLS를
--   우회 → 정책 상호 트리거 고리를 끊는다. 의미(가시성)는 동일.

CREATE OR REPLACE FUNCTION public.is_driver_matched_to_order(p_order_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM matches WHERE order_id = p_order_id AND driver_id = p_uid);
$$;

CREATE OR REPLACE FUNCTION public.is_shipper_of_order(p_order_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND shipper_id = p_uid);
$$;

-- orders 정책: matches 직접 참조 제거 → 헬퍼 사용
DROP POLICY IF EXISTS "orders_select_pending" ON orders;
CREATE POLICY "orders_select_pending" ON orders FOR SELECT TO authenticated
  USING (
    status = 'pending'
    OR shipper_id = auth.uid()
    OR public.is_driver_matched_to_order(id, auth.uid())
  );

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated
  USING (
    shipper_id = auth.uid()
    OR public.is_driver_matched_to_order(id, auth.uid())
  );

-- matches 정책: orders 직접 참조 제거 → 헬퍼 사용
DROP POLICY IF EXISTS "matches_select" ON matches;
CREATE POLICY "matches_select" ON matches FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.is_shipper_of_order(order_id, auth.uid())
  );

DROP POLICY IF EXISTS "matches_update" ON matches;
CREATE POLICY "matches_update" ON matches FOR UPDATE TO authenticated
  USING (
    driver_id = auth.uid()
    OR public.is_shipper_of_order(order_id, auth.uid())
  );

-- ▼▼▼ migrations/019_match_fees.sql ▼▼▼
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

-- ▼▼▼ migrations/020_contact_paywall.sql ▼▼▼
-- ============================================================
-- 020: 연락처 페이월 강제 + 한 오더 활성 매칭 1건 보장
-- ============================================================
-- Bug1: users_select 가 USING(true) 라 아무 로그인 유저나 전 유저의
--   phone/email/toss_user_key 를 덤프 가능했음. 또 chats RLS 는 당사자
--   여부만 검사해 매칭 이용료(match_fees) 미결제 상태에서도 직접 insert 로
--   채팅이 뚫렸음. → users 는 본인 행만, chats 는 당사자 AND 이용료 결제로 게이팅.
-- Bug2: matches 유니크가 (order_id, driver_id) 뿐이라 서로 다른 두 입찰을
--   동시 승인하면 한 오더에 기사 2명이 매칭됐음. → order_id 부분 유니크 인덱스.
-- 선행: 018(is_shipper_of_order 헬퍼)에 의존.

-- ------------------------------------------------------------
-- 1) users: 본인 행만 조회 (타인 PII 덤프 차단)
-- ------------------------------------------------------------
-- 웹앱 서버코드는 대부분 service-role 이라 영향 없음. 유저세션으로 타인 행을
-- 읽던 경로는 service-role 로 전환(코드 반영). insert/update 정책은 유지.
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ------------------------------------------------------------
-- 2) 매칭 이용료 결제 여부 헬퍼 (018 스타일: SECURITY DEFINER, STABLE)
-- ------------------------------------------------------------
-- fee row 가 없으면 true(웹 경로 매칭은 과금 대상 아님), 있으면 'paid' 일 때만 true.
CREATE OR REPLACE FUNCTION public.is_match_fee_paid(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status = 'paid' FROM match_fees WHERE match_id = p_match_id LIMIT 1),
    true
  );
$$;

-- ------------------------------------------------------------
-- 3) chats: 당사자 AND 이용료 결제 게이팅 (018 헬퍼로 재귀 회피)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "chats_select" ON chats;
CREATE POLICY "chats_select" ON chats FOR SELECT TO authenticated
  USING (
    public.is_match_fee_paid(match_id)
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_id
        AND (m.driver_id = auth.uid() OR public.is_shipper_of_order(m.order_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "chats_insert" ON chats;
CREATE POLICY "chats_insert" ON chats FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_match_fee_paid(match_id)
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_id
        AND (m.driver_id = auth.uid() OR public.is_shipper_of_order(m.order_id, auth.uid()))
    )
  );

-- ------------------------------------------------------------
-- 4) 한 오더 = 활성 매칭 1건 (동시 승인으로 기사 2명 매칭 차단)
-- ------------------------------------------------------------
-- 기존 중복 데이터 정리: order_id 별 status<>'cancelled' 가 2건 이상이면
-- matched_at 최신 1건만 남기고 나머지 cancelled.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT order_id
    FROM matches
    WHERE status <> 'cancelled'
    GROUP BY order_id
    HAVING count(*) > 1
  LOOP
    UPDATE matches
    SET status = 'cancelled'
    WHERE order_id = r.order_id
      AND status <> 'cancelled'
      AND id <> (
        SELECT id FROM matches
        WHERE order_id = r.order_id AND status <> 'cancelled'
        ORDER BY matched_at DESC
        LIMIT 1
      );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_one_active_per_order
  ON matches(order_id) WHERE status <> 'cancelled';

-- ▼▼▼ migrations/021_match_fee_refund.sql ▼▼▼
-- ============================================================
-- 021: 매칭 이용료 환불·대사 컬럼
-- ============================================================
-- 019 match_fees에 환불(청약철회·자동환불) 및 거래 대사에 필요한
-- 컬럼을 추가한다. transactionId는 토스페이 환불/대사의 구분 값이라
-- payToken과 별도로 저장한다.

ALTER TABLE match_fees ADD COLUMN IF NOT EXISTS toss_transaction_id text;
ALTER TABLE match_fees ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE match_fees ADD COLUMN IF NOT EXISTS refund_reason text;
