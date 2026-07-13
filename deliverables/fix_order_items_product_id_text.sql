-- ============================================================
-- 根治 order_items 下单 400：product_id 由 uuid(FK) 改为 text
-- ============================================================
-- 背景：
--   1) order_items 已冗余存储 product_name，保留 product_id→products 外键意义不大；
--   2) 前端在占位/平台精选/测试下单时 product_id 可能为空或指向 products 表不存在的行，
--      此时外键约束会直接返回 400，阻塞下单；
--   3) 代码侧已改为 product_id: ... || null（空值传 null），但 FK 仍会在
--      “product_id 有值但 products 表无此行” 时拦截。
-- 本脚本将 product_id 改为 text 并去除外键，彻底消除该类 400。
--
-- ⚠️ 执行方式：Supabase Dashboard → SQL Editor 粘贴整段执行。
--    幂等：DROP CONSTRAINT IF EXISTS / ALTER TYPE 可重复执行（已存在则 no-op）。

-- 1) 去除 product_id 上的外键约束（约束名随生成方式可能不同，用 IF EXISTS 容错）
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
    RAISE NOTICE 'dropped FK: %', _c;
  ELSE
    RAISE NOTICE 'no product_id FK found (already removed)';
  END IF;
END $$;

-- 2) product_id 改为 text（原 uuid 值会原样转成文本，数据不丢）
ALTER TABLE public.order_items ALTER COLUMN product_id TYPE text USING product_id::text;

-- 3) 备注说明
COMMENT ON COLUMN public.order_items.product_id IS '商品ID快照（冗余，非强制外键，允许空或任意文本）';

-- 4) 校验
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items' AND column_name = 'product_id';
