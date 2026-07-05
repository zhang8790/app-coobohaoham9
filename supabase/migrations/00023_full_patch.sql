-- ============================================================
-- 终极合并补丁：00021 + 00022 + Storage + 金豆充值
-- 一次性补全所有缺失字段 + 创建图片存储桶 + 充值金豆
-- 执行方式：Supabase SQL Editor → 新建 query → 全选粘贴 → Run
-- 执行时间：2026-07-03
-- ============================================================


-- =============================================================
-- 1. 缺失表创建（favorites / footprints）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);


-- =============================================================
-- 2. cart_items 补 user_id / selected 字段
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'user_id') THEN
    ALTER TABLE cart_items ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'selected') THEN
    ALTER TABLE cart_items ADD COLUMN selected BOOLEAN NOT NULL DEFAULT true;
  END IF;
END
$$;


-- =============================================================
-- 3. stores 表：列名统一 + 补全所有缺失字段
-- =============================================================

-- 3a. 清理可能错加的 store_short_code 列
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'store_short_code') THEN
    UPDATE stores SET short_code = store_short_code WHERE short_code IS NULL AND store_short_code IS NOT NULL;
    ALTER TABLE stores DROP COLUMN store_short_code;
  END IF;
END
$$;

-- 3b. 确保 short_code 列存在 + 生成短码 + 唯一约束
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS short_code TEXT;

UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_short_code_unique') THEN
    ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);
  END IF;
END
$$;

-- 3c. 补全店铺设置页所需的所有字段
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_radius NUMERIC(5,2) DEFAULT 3,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,4) DEFAULT 0.09;


-- =============================================================
-- 4. orders 表：补全所有缺失字段
-- =============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
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


-- =============================================================
-- 5. order_items 表：补 created_at 字段
-- =============================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.order_items oi
SET created_at = COALESCE(o.created_at, NOW())
FROM public.orders o
WHERE oi.order_id = o.id AND oi.created_at IS NULL;


-- =============================================================
-- 6. products 表：补全所有缺失字段（解决商品保存 400）
-- =============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD COLUMN IF NOT EXISTS main_image TEXT,
  ADD COLUMN IF NOT EXISTS sub_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;


-- =============================================================
-- 7. 创建图片存储桶（图片上传到 Supabase Storage）
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS：允许所有人读取公开图片
CREATE POLICY IF NOT EXISTS "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

-- Storage RLS：允许登录用户上传图片
CREATE POLICY IF NOT EXISTS "Authenticated upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');

-- Storage RLS：允许登录用户更新自己的图片
CREATE POLICY IF NOT EXISTS "Authenticated update own" ON storage.objects
  FOR UPDATE USING (bucket_id = 'images' AND auth.uid() = owner);

-- Storage RLS：允许登录用户删除自己的图片
CREATE POLICY IF NOT EXISTS "Authenticated delete own" ON storage.objects
  FOR DELETE USING (bucket_id = 'images' AND auth.uid() = owner);


-- =============================================================
-- 8. 给测试用户充值金豆（100 金豆，够买西瓜）
-- =============================================================
UPDATE public.profiles
SET balance = 100
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 清除横笼铺的无效 banner_url（旧的本地临时路径）
UPDATE public.stores
SET banner_url = NULL
WHERE banner_url LIKE 'http://tmp/%' OR banner_url LIKE 'wxfile://%';


-- =============================================================
-- 9. RLS 全部关闭（测试阶段）
-- =============================================================
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;


-- =============================================================
-- 10. 性能索引
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user_id ON footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);


-- =============================================================
-- 完成！
-- =============================================================
SELECT '✅ 全部补齐完成！stores + orders + order_items + products + Storage + 金豆充值' as result;
