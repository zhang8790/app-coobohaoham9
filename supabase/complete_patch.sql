-- ============================================================
-- 来店有喜 · 完整数据库补丁（00018 + 00019 合并）
-- 执行方式：复制到 Supabase SQL Editor 全选执行
-- ============================================================

-- ========== 1. products 表补 mood_tags 字段 ==========
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS mood_tags TEXT[] DEFAULT '{}';

-- ========== 2. stores 表补店铺设置相关字段 ==========
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_radius INTEGER DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,2) DEFAULT 5.00;

-- ========== 3. orders 表补分佣字段 ==========
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT;

-- ========== 4. cart_items 表补 user_id 字段 ==========
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

-- ========== 5. 创建 favorites 表（收藏） ==========
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- ========== 6. 创建 footprints 表（浏览足迹） ==========
CREATE TABLE IF NOT EXISTS footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- ========== 7. 关闭 RLS（测试阶段） ==========
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- ========== 8. 索引 ==========
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user_id ON footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_products_mood_tags ON products USING GIN(mood_tags);
CREATE INDEX IF NOT EXISTS idx_orders_promoter_id ON orders(promoter_id);
CREATE INDEX IF NOT EXISTS idx_orders_staff_id ON orders(staff_id);

-- ========== 9. 给现有商品自动打 mood_tags ==========
-- 食品/水果
UPDATE products SET mood_tags = ARRAY['满足','幸福','用餐时光']
WHERE (name LIKE '%西瓜%' OR name LIKE '%水果%' OR name LIKE '%食品%' OR name LIKE '%蛋糕%' OR name LIKE '%奶茶%' OR name LIKE '%巧克力%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 甜品/甜蜜
UPDATE products SET mood_tags = ARRAY['甜蜜','幸福','治愈']
WHERE (name LIKE '%甜%' OR name LIKE '%蜜%' OR name LIKE '%糖%' OR category LIKE '%甜%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 文创/书籍/学习
UPDATE products SET mood_tags = ARRAY['专注','安静','学习空间','治愈']
WHERE (name LIKE '%书%' OR name LIKE '%文%' OR name LIKE '%笔%' OR category LIKE '%文创%' OR category LIKE '%学习%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 礼品/饰品
UPDATE products SET mood_tags = ARRAY['送礼','品质','仪式感','分享']
WHERE (name LIKE '%礼%' OR name LIKE '%饰%' OR name LIKE '%品%' OR category LIKE '%礼品%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 家居/日用
UPDATE products SET mood_tags = ARRAY['治愈','品质','实用','放松']
WHERE (name LIKE '%家居%' OR name LIKE '%日用%' OR name LIKE '%杯%' OR name LIKE '%枕%' OR category LIKE '%家居%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 美妆/护肤
UPDATE products SET mood_tags = ARRAY['精致','仪式感','治愈','品质']
WHERE (name LIKE '%妆%' OR name LIKE '%肤%' OR name LIKE '%美%' OR category LIKE '%美妆%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 养生/健康
UPDATE products SET mood_tags = ARRAY['治愈','放松','安静','品质']
WHERE (name LIKE '%养生%' OR name LIKE '%健康%' OR name LIKE '%茶%' OR name LIKE '%SPA%' OR name LIKE '%按摩%')
  AND (mood_tags IS NULL OR mood_tags = '{}');

-- 剩余未打标签的商品，给默认标签
UPDATE products SET mood_tags = ARRAY['愉悦','快乐','品质']
WHERE mood_tags IS NULL OR mood_tags = '{}';

-- ============================================================
-- 完成提示
-- ============================================================
SELECT '数据库补丁执行完成！' AS result;
SELECT COUNT(*) AS products_with_mood_tags FROM products WHERE mood_tags IS NOT NULL AND mood_tags != '{}';
SELECT COUNT(*) AS total_products FROM products;
