-- 补丁：修复 favorites/footprints/cart + stores 表缺失字段 + orders 佣金字段
-- 执行时间：2026-07-03
-- 在 Supabase SQL Editor 中执行

-- =============================================================
-- 1. favorites 表（收藏）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- =============================================================
-- 2. footprints 表（浏览足迹）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- =============================================================
-- 3. cart_items 补 user_id / selected 字段
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'selected'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN selected BOOLEAN NOT NULL DEFAULT true;
  END IF;
END
$$;

-- =============================================================
-- 4. stores 表补全所有缺失字段（店铺设置页需要）
-- =============================================================
ALTER TABLE public.stores
  -- 联系与营业
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '20:00',
  -- 配送配置
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_radius NUMERIC(5,2) DEFAULT 3,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0,
  -- 其他
  ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_tags TEXT[] DEFAULT '{}',
  -- 分销/让利
  ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,4) DEFAULT 0.09,
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- 为已有店铺生成短码
UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

-- =============================================================
-- 5. orders 表补全所有缺失字段（Edge Function + V5分佣 需要）
-- =============================================================
ALTER TABLE public.orders
  -- V5 分佣字段
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  -- 跨门店 & Edge Function 字段
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- 6. RLS 关闭（测试阶段）
-- =============================================================
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- =============================================================
-- 7. 性能索引
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user_id ON footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);

SELECT '✅ 00018 补丁执行完成：favorites/footprints/stores/orders 字段已补全' as result;
