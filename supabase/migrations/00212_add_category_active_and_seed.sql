-- ============================================================
-- 00212_add_category_active_and_seed.sql
-- 让「自营页类目」可由后台编辑 + 上架/下架
--
-- 背景：
--   自营页（/pages/explore/index）左侧类目原本写死在代码里
--   (CATEGORIES = ['全部','图书','美食','饮品','零食','日用','礼品'])，
--   无法后台编辑，也无法下架。
--   现改为读 store_categories(scope='global')，并按 name 精确匹配
--   products.category 文本（不动商品表，零数据迁移风险）。
--
-- 本迁移做两件事：
--   1) store_categories 加 is_active 列（下架=前端入口隐藏，"全部"始终可见）
--   2) 插入 7 个默认全局类目（图书/美食/饮品/零食/日用/礼品/生鲜），
--      幂等：已存在同名 global 类目则跳过
--
-- 使用方式：
--   方式 A（推荐，本机 Dashboard）：SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db push
-- ⚠️ 注意：本迁移不修改任何商品数据；类目与商品靠 name 文本对齐。
-- ============================================================

-- =====================
-- 第1步：加 is_active 列（默认上架）
-- =====================
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.store_categories.is_active IS
  '是否上架：true=前台（自营页）显示该类目入口；false=下架，前端隐藏（"全部"仍可见所有商品）';

-- 加速「只取上架全局类目」查询
CREATE INDEX IF NOT EXISTS idx_store_categories_global_active
  ON public.store_categories (scope, is_active, sort_order)
  WHERE scope = 'global';

-- =====================
-- 第2步：插入默认全局类目（幂等：同名 global 已存在则跳过）
-- =====================
-- 排序与前端原硬编码顺序保持一致：图书1 / 美食2 / 饮品3 / 零食4 / 日用5 / 礼品6 / 生鲜7
INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '图书', 1, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '图书');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '美食', 2, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '美食');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '饮品', 3, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '饮品');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '零食', 4, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '零食');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '日用', 5, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '日用');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '礼品', 6, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '礼品');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '生鲜', 7, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '生鲜');

-- =====================
-- 校验：应能看到 7 个上架的全局类目
-- =====================
SELECT id, name, sort_order, scope, is_active
FROM public.store_categories
WHERE scope = 'global'
ORDER BY sort_order;
