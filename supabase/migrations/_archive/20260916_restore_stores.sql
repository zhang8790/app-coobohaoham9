-- ============================================================
-- 20260916_restore_stores.sql
-- 恢复 3 家被误删的真实实体门店（巫山烤鱼 / 横笼铺 / 杭州礼品店）
-- 及其商品（商品为「占位条目」，真实名称/价格需后台或 PITR 补回）。
--
-- 背景：用户先确认删除（见 20260916_delete_test_stores.sql，现已作废），
--       随后纠正「这 3 家是真实门店，需恢复」。删除为 CASCADE，故 10 个
--       商品一并丢失，仓库内无种子/备份可还原，故商品以明确标注的占位行回填。
--
-- 使用方式：Supabase Dashboard → SQL Editor 整段粘贴 → Run。
-- 说明：anon key 无写权限，必须在此处用有权限的 key 执行。
-- ============================================================

-- ===================== 1) 恢复 3 家门店 =====================
-- 字段以官方店（ffffffff）为模板；lat/lng 暂置 NULL（需补真实坐标，否则配送半径校验无法计算）。
INSERT INTO stores (
  id, owner_id, name, description, address, phone, category,
  image_url, banner_url, rating, is_active, referral_rate,
  is_open, open_time, close_time,
  delivery_enabled, pickup_enabled, delivery_radius,
  delivery_fee, free_delivery_threshold, min_order_amount,
  announcement, scene_tags, is_platform, fulfillment_type, lat, lng
) VALUES
(
  '0617836f-0b6f-4611-870b-c7ce8da03c84',  -- 巫山烤鱼
  NULL,
  '巫山烤鱼',
  '巫山风味烤鱼，鲜活现做',
  '待补充',
  '400-000-0000',
  '美食',
  'https://picsum.photos/seed/wushan/400/400',
  'https://picsum.photos/seed/wushan-banner/800/400',
  NULL,            -- 不造假评分
  true,
  0.10,
  true, '08:00', '20:00',
  true, true, 3.0,
  0.0, 30.0, 0.0,
  '', '{}', false, 'both', NULL, NULL
),
(
  '853a98ae-ffca-4586-9c44-21047a94fbb2',  -- 横笼铺
  NULL,
  '横笼铺',
  '传统手工点心，现蒸现卖',
  '待补充',
  '400-000-0000',
  '美食',
  'https://picsum.photos/seed/henglong/400/400',
  'https://picsum.photos/seed/henglong-banner/800/400',
  NULL,
  false,           -- 注意：删除前该店 is_active=false（停用状态），保留原状
  0.10,
  true, '08:00', '20:00',
  true, true, 3.0,
  0.0, 30.0, 0.0,
  '', '{}', false, 'both', NULL, NULL
),
(
  '70778d6b-d819-41fc-87a3-8766a78eb60d',  -- 杭州礼品店
  NULL,
  '杭州礼品店',
  '杭州特色伴手礼与精选礼品',
  '待补充',
  '400-000-0000',
  '礼品',
  'https://picsum.photos/seed/hangzhou/400/400',
  'https://picsum.photos/seed/hangzhou-banner/800/400',
  NULL,
  true,
  0.10,
  true, '08:00', '20:00',
  true, true, 3.0,
  0.0, 30.0, 0.0,
  '', '{}', false, 'both', NULL, NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  is_platform = false;   -- 双保险：实体店非平台店

-- ===================== 2) 恢复商品（占位条目） =====================
-- ⚠️ 真实名称/价格/图片已随 CASCADE 删除且仓库无备份，此处以【待录入】占位，
--    请通过商家后台商品管理或 Supabase PITR 还原真实数据后删除占位行。
-- 分布：巫山烤鱼=1、横笼铺=3、杭州礼品店=6（与原分布一致）。
INSERT INTO products (store_id, name, description, price, is_active, review_status, product_kind, image_url)
VALUES
  ('0617836f-0b6f-4611-870b-c7ce8da03c84', '【待录入】巫山烤鱼商品1', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/ws1/400/400'),
  ('853a98ae-ffca-4586-9c44-21047a94fbb2', '【待录入】横笼铺商品1', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/hl1/400/400'),
  ('853a98ae-ffca-4586-9c44-21047a94fbb2', '【待录入】横笼铺商品2', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/hl2/400/400'),
  ('853a98ae-ffca-4586-9c44-21047a94fbb2', '【待录入】横笼铺商品3', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/hl3/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品1', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz1/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品2', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz2/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品3', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz3/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品4', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz4/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品5', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz5/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品6', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz6/400/400');

-- ===================== 3) 验证 =====================
-- 应看到 4 行：官方店 + 3 家恢复的实体店
SELECT id, name, is_platform, is_active FROM stores ORDER BY is_platform DESC, name;

-- 恢复的商品占位行数（应为 10）
SELECT store_id, count(*) AS placeholder_products
FROM products
WHERE name LIKE '【待录入】%'
GROUP BY store_id ORDER BY store_id;
