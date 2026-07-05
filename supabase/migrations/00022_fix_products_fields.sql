-- ============================================================
-- 00022: products 表补全缺失字段（解决商品保存 400 错误）
-- 根因：迁移 00010 未推到云端，缺少 barcode 字段
-- 执行方式：Supabase SQL Editor → Run
-- ============================================================

-- 1. 补 00010 迁移的字段（成本价/让利/图片/视频）
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD COLUMN IF NOT EXISTS main_image TEXT,
  ADD COLUMN IF NOT EXISTS sub_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. 补 barcode 字段（扫码上架用）
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;

-- 3. RLS 关闭（测试阶段）
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);

SELECT '✅ 00022 执行完成：products 表所有缺失字段已补全' as result;
