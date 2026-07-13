-- ============================================================
-- 00055 独立执行版：补全 orders 表 发货/核销 字段
-- 执行位置：Supabase Dashboard → SQL Editor 粘贴运行（纯 SQL）
-- 作用：补齐 ship_company / ship_no / verified_at 三列
--   其中 verified_at 缺失会导致「纯金豆 + 到店消费」订单 insert 失败、
--   金豆支付卡死（已通过代码容错修复，但补列后可恢复核销时间标记）。
-- 安全：全部 IF NOT EXISTS，可重复执行。
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ship_company text,
  ADD COLUMN IF NOT EXISTS ship_no text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 校验（执行后看 Notice 输出应含三个字段）
DO $$
DECLARE
  v_found text;
BEGIN
  SELECT ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('ship_company','ship_no','verified_at'))
    INTO v_found
  FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name IN ('ship_company','ship_no','verified_at');
  RAISE NOTICE 'orders 发货/核销字段: %', COALESCE(v_found::text, '无');
END $$;
