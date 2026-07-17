-- 프로덕션 미적용 확인됨 (2026-07-17, 앱 실사에서 발견)
-- 증상: orders insert 시 "null value in column cargo_type violates not-null constraint"
-- 원본: supabase/migrations/012_vehicle_fields.sql 중 cargo_type nullable 처리
-- 적용 순서: 012 → 018 → 019 → 020 → 021 (APPLY_018_021.sql 앞에 이것 먼저)
ALTER TABLE orders ALTER COLUMN cargo_type DROP NOT NULL;
