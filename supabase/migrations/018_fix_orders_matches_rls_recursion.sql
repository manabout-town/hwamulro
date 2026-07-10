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
