-- ============================================================
-- 00026_add_is_platform.sql — 自营门店标识 + 创建自营门店
-- 探索页只看自营商品，犒赏铺只看商家门店
-- ⚠️ 必须在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- =====================
-- 第1步：给 stores 表加 is_platform 字段
-- =====================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_platform boolean DEFAULT false;

-- =====================
-- 第2步：标记现有商家门店（横笼铺）为非自营
-- =====================
UPDATE stores SET is_platform = false WHERE name = '横笼铺';

-- =====================
-- 第3步：创建自营门店（来店有喜官方自营店）
-- =====================
INSERT INTO stores (
  id, owner_id, name, description, address, phone, category,
  image_url, banner_url, rating, is_active, is_platform,
  is_open, open_time, close_time, referral_rate, short_code
) VALUES (
  'store-platform-001',
  'd6b38349-dded-4879-9eac-3165a646436a',
  '来店有喜自营店',
  '来店有喜官方自营商品，品质保障，江湖好货直供',
  '侠客总部 1 号',
  '400-888-8888',
  '日用',
  'https://picsum.photos/seed/platform-store/400/400',
  'https://picsum.photos/seed/platform-banner/800/400',
  5.0,
  true,
  true,  -- ⭐ is_platform = true，标识自营门店
  true,
  '08:00',
  '22:00',
  0.20,
  'LDYX01'
) ON CONFLICT (id) DO UPDATE SET is_platform = true;

-- =====================
-- 第4步：把西瓜从横笼铺移到自营门店（可选）
-- 或者让西瓜继续属于横笼铺（犒赏铺商品）
-- 当前：西瓜在横笼铺，属于商家商品，不会出现在探索页
-- =====================
-- 如果想让西瓜同时在自营店也上架：
-- UPDATE products SET store_id = 'store-platform-001' WHERE name = '西瓜' AND store_id = (SELECT id FROM stores WHERE name = '横笼铺');

-- =====================
-- 第5步：给自营门店创建一些默认商品
-- =====================
INSERT INTO products (
  id, store_id, name, description, price, original_price,
  image_url, main_image, category, is_active, mood_tags, scene_tags
) VALUES
  ('prod-platform-001', 'store-platform-001', '来店有喜·侠客茶杯',
   '精选陶瓷茶杯，侠客风范，品茗必备', 29.90, 59.90,
   'https://picsum.photos/seed/teacup/400/400', 'https://picsum.photos/seed/teacup/400/400',
   '日用', true,
   ARRAY['温暖', '放松', '慢生活'], ARRAY['堂食', '自取']),
  ('prod-platform-002', 'store-platform-001', '江湖秘籍·读书灯',
   '护眼LED读书灯，文武双全的照明神器', 49.90, 99.90,
   'https://picsum.photos/seed/readlight/400/400', 'https://picsum.photos/seed/readlight/400/400',
   '日用', true,
   ARRAY['专注', '学习', '宁静'], ARRAY['堂食', '外卖']),
  ('prod-platform-003', 'store-platform-001', '侠客行·牛肉干',
   '精选风干牛肉，行走江湖的能量补给', 35.00, 68.00,
   'https://picsum.photos/seed/beefjerky/400/400', 'https://picsum.photos/seed/beefjerky/400/400',
   '零食', true,
   ARRAY['活力', '满足', '探索'], ARRAY['堂食', '自取', '外卖']),
  ('prod-platform-004', 'store-platform-001', '掌门手作·陈皮普洱',
   '五年陈皮搭配普洱，掌门级品味', 89.00, 158.00,
   'https://picsum.photos/seed/chenpi/400/400', 'https://picsum.photos/seed/chenpi/400/400',
   '饮品', true,
   ARRAY['优雅', '品味', '养生'], ARRAY['堂食', '自取'])
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 第6步：验证结果
-- =====================
SELECT id, name, is_platform, is_active FROM stores ORDER BY is_platform DESC, name;
SELECT id, name, store_id FROM products WHERE store_id = 'store-platform-001';
