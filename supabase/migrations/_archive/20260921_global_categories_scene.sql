-- ============================================================
-- 20260921_global_categories_scene.sql
-- 好物（自营页）分类改为「场景 / 人群」风格（对齐首页 HOME_FOOD_TAGS）
--
-- 背景：
--   自营页 /pages/explore/index 左侧分类读 store_categories(scope='global', is_active=true)
--   （见 src/pages/explore/index.tsx:25/188）。原本规划按"九种体质"划分，但用户反馈
--   偏中医辨证、像"卖药"，不符合食品电商调性。改为首页同款「场景/人群」标签：
--   宝宝零食 / 孕产营养 / 老年养生 / 舒心食养 / 肠胃食养 / 温润食养 / 敏感防护 / 熬夜加班。
--   这些均为生活场景/人群词，已逐条比对 src/utils/compliance/shield.ts 的 FORBIDDEN_WORDS，
--   不含治疗/调理/滋补/健脾等违禁词，合规。
--
-- 类目仍写入 store_categories(scope='global')，因此后台 Categories.tsx 原生支持
-- 增 / 改名（级联同步商品归类）/ 上架下架 / 排序 / 删除 —— "管理后台可修改分类" 不变。
-- 商品在「商品编辑 → 分类」按 category_id 归类即可出现在对应类目下（本迁移不做任何猜测性归类）。
--
-- 本迁移做三件事（幂等，可重复执行）：
--   1) 防御：确保 store_categories.store_id 可空（global 行必须为 NULL）
--   2) 插入/校正 8 条场景类目（已存在同名则只校正排序与上架态，不覆盖 id）
--   3) 下架旧的物理品类「日用」「礼品」与（若残留）九体质类目（不删除：可逆，后台可一键重新上架）
--
-- 使用方式：
--   方式 A（推荐）：Supabase Dashboard → SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db query --linked --file supabase/migrations/20260921_global_categories_scene.sql
--
-- ⚠️ 不修改任何商品数据。类目与商品的关联仍是 products.category_id，
--    需由商家/管理员在「商品编辑 → 分类」里归类（本迁移不做任何猜测性归类）。
-- ============================================================

-- =====================
-- 第1步：防御性放开 store_id（全局类目的 store_id 必须为 NULL）
-- =====================
ALTER TABLE public.store_categories ALTER COLUMN store_id DROP NOT NULL;

-- =====================
-- 第2步：插入缺失的场景类目（幂等：同名 global 已存在则跳过）
-- =====================
-- 排序 10~80，与首页 HOME_FOOD_TAGS 顺序一致：
--   宝宝零食 → 孕产营养 → 老年养生 → 舒心食养 → 肠胃食养 → 温润食养 → 敏感防护 → 熬夜加班
INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, v.name, v.sort_order, 'global', true
FROM (VALUES
  ('宝宝零食', 10),
  ('孕产营养', 20),
  ('老年养生', 30),
  ('舒心食养', 40),
  ('肠胃食养', 50),
  ('温润食养', 60),
  ('敏感防护', 70),
  ('熬夜加班', 80)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_categories c
  WHERE c.scope = 'global' AND c.name = v.name
);

-- =====================
-- 第3步：校正这 8 条的排序与上架态（幂等；不覆盖 id，避免打断既有商品挂靠）
-- =====================
UPDATE public.store_categories c
SET sort_order = v.sort_order,
    is_active  = true,
    scope      = 'global',
    store_id   = NULL
FROM (VALUES
  ('宝宝零食', 10),
  ('孕产营养', 20),
  ('老年养生', 30),
  ('舒心食养', 40),
  ('肠胃食养', 50),
  ('温润食养', 60),
  ('敏感防护', 70),
  ('熬夜加班', 80)
) AS v(name, sort_order)
WHERE c.name = v.name
  AND c.scope = 'global';

-- =====================
-- 第4步：下架旧物理品类与（若残留）九体质类目（不删除，后台可重新上架；仅动 global 且无商品挂靠的）
-- =====================
UPDATE public.store_categories c
SET is_active = false
WHERE c.scope = 'global'
  AND c.name IN (
    '日用', '礼品', '图书', '美食', '饮品', '零食', '生鲜',
    '平和质', '气虚质', '阳虚质', '阴虚质', '痰湿质', '湿热质', '血瘀质', '气郁质', '特禀质'
  )
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id);

-- =====================
-- 校验：应看到 8 条 is_active=true 的场景类目（sort_order 10~80）
-- =====================
SELECT c.name,
       c.sort_order,
       c.is_active,
       (SELECT count(*) FROM public.products p WHERE p.category_id = c.id) AS product_count
FROM public.store_categories c
WHERE c.scope = 'global'
ORDER BY c.is_active DESC, c.sort_order;
