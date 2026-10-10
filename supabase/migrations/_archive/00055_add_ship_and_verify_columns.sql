-- 00055: 补全 orders 表发货/核销相关字段
-- 商家端「发货」与「到店核销」需要持久化物流信息与核销时间。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴运行（纯 SQL，非 Edge Function）

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ship_company text,
  ADD COLUMN IF NOT EXISTS ship_no text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 校验
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
