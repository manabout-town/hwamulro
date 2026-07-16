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
