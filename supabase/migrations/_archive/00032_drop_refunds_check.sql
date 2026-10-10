-- ============================================================
-- 00032: 删除 refunds 表的 status CHECK 约束
-- 执行时间: 2026-07-04
-- 说明: 解决 "violates check constraint refunds_status_check"
-- ============================================================

-- 查看当前约束（可选）
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'refunds'::regclass;

-- 删除 status 的 CHECK 约束
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;

-- 如果上面的约束名不对，尝试通用方式
DO $$
BEGIN
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'refunds'::regclass AND contype = 'c')
    LOOP
      EXECUTE format('ALTER TABLE refunds DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

-- 验证：确认无 CHECK 约束
SELECT conname, contype, pg_get_constraintdef(oid) as definition 
FROM pg_constraint 
WHERE conrelid = 'refunds'::regclass;
