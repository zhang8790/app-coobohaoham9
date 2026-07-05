-- 补全 orders 表缺失的 store_id 字段
-- Edge Function create-order 在插入订单时用了 store_id，但初始 schema 未加此列
-- 同时清理 stores 表的列名不一致问题（00018 曾错写为 store_short_code）
-- 执行时间：2026-07-03

-- =====================
-- 1. stores 表：确保列名统一为 short_code
-- =====================
DO $$
BEGIN
  -- 如果 00018 已错加了 store_short_code，将其值合并到 short_code 后删掉
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'store_short_code'
  ) THEN
    -- 把 store_short_code 的值复制到 short_code（只更新 short_code 为 NULL 的行）
    UPDATE stores
       SET short_code = store_short_code
     WHERE short_code IS NULL AND store_short_code IS NOT NULL;
    -- 删掉错加的列
    ALTER TABLE stores DROP COLUMN store_short_code;
  END IF;
END
$$;

-- 确保 short_code 列存在（00006 可能未执行）
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- 为已有店铺生成短码（如果还是 NULL）
UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

-- 加唯一约束（如果还没有）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_short_code_unique'
  ) THEN
    ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);
  END IF;
END
$$;

-- =====================
-- 2. orders 表：加 store_id
-- =====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- =====================
-- 3. orders 表：确保 00018 的所有字段都在
-- =====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN NOT NULL DEFAULT false;

SELECT '✅ 00019 执行完成：orders.store_id 已添加，stores.short_code 列名已统一' as result;
