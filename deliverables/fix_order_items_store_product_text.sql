-- ============================================================
-- 根治 order_items 下单 400：product_id / store_id 改为 text 并去 FK
-- ============================================================
-- 背景：
--   1) order_items 作为订单快照表，已冗余 product_name / store_name，
--      保留 product_id→products、store_id→stores 外键会在以下场景直接 400：
--      a) 占位/平台精选/测试下单时 product_id / store_id 为空字符串；
--      b) 商品或门店已被删除但订单仍需保留历史；
--      c) 非 uuid 格式的外部商品 ID；
--   2) 代码侧已改为 product_id / store_id: ... || null（空值传 null），但
--      UUID 列不接受空字符串 ""，且 FK 会在目标行不存在时拦截；
--   3) 小程序支付页兜底用例传 {"product_id":"","store_id":""}，导致
--      order_items 写入 400，主订单已创建但子表缺失。
-- 本脚本将 product_id / store_id 改为 text 并去除外键，彻底消除该类 400。
--
-- ⚠️ 执行方式：Supabase Dashboard → SQL Editor 粘贴整段执行。
--    幂等：DROP CONSTRAINT IF EXISTS / ALTER TYPE IF EXISTS 可重复执行。

-- 1) 去除 product_id 上的外键约束
DO $$
DECLARE
  _c text;
BEGIN
  SELECT conname INTO _c
  FROM pg_constraint
  WHERE conrelid = 'public.order_items'::regclass
    AND confrelid = 'public.products'::regclass
    AND array_to_string(conkey, ',') LIKE '%' || (
      SELECT attnum::text FROM pg_attribute
      WHERE attrelid = 'public.order_items'::regclass AND attname = 'product_id'
    ) || '%';
  IF _c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.order_items DROP CONSTRAINT %I', _c);
    RAISE NOTICE 'dropped product_id FK: %', _c;
  ELSE
    RAISE NOTICE 'no product_id FK found (already removed)';
  END IF;
END $$;

-- 2) 去除 store_id 上的外键约束
DO $$
DECLARE
  _c text;
BEGIN
  SELECT conname INTO _c
  FROM pg_constraint
  WHERE conrelid = 'public.order_items'::regclass
    AND confrelid = 'public.stores'::regclass
    AND array_to_string(conkey, ',') LIKE '%' || (
      SELECT attnum::text FROM pg_attribute
      WHERE attrelid = 'public.order_items'::regclass AND attname = 'store_id'
    ) || '%';
  IF _c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.order_items DROP CONSTRAINT %I', _c);
    RAISE NOTICE 'dropped store_id FK: %', _c;
  ELSE
    RAISE NOTICE 'no store_id FK found (already removed)';
  END IF;
END $$;

-- 3) product_id / store_id 改为 text（原 uuid 值会原样转成文本，数据不丢）
ALTER TABLE public.order_items ALTER COLUMN product_id TYPE text USING product_id::text;
ALTER TABLE public.order_items ALTER COLUMN store_id TYPE text USING store_id::text;

-- 4) 备注说明
COMMENT ON COLUMN public.order_items.product_id IS '商品ID快照（冗余，非强制外键，允许空或任意文本）';
COMMENT ON COLUMN public.order_items.store_id IS '门店ID快照（冗余，非强制外键，允许空或任意文本）';

-- 5) 校验
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items' AND column_name IN ('product_id', 'store_id')
ORDER BY column_name;
