-- ============================================================
-- 021: 매칭 이용료 환불·대사 컬럼
-- ============================================================
-- 019 match_fees에 환불(청약철회·자동환불) 및 거래 대사에 필요한
-- 컬럼을 추가한다. transactionId는 토스페이 환불/대사의 구분 값이라
-- payToken과 별도로 저장한다.

ALTER TABLE match_fees ADD COLUMN IF NOT EXISTS toss_transaction_id text;
ALTER TABLE match_fees ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE match_fees ADD COLUMN IF NOT EXISTS refund_reason text;
