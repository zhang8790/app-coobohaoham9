-- ============================================================
-- 20260927_add_category_parent.sql
-- 分类体系升级：store_categories 增加自引用 parent_id，支持「场景(一级) → 子类(二级)」
--
-- 背景：
--   首页金刚区「按场景选食养」现有 8 个一级场景（宝宝零食/孕产营养/老年养生/
--   舒心食养/肠胃食养/温润食养/敏感防护/熬夜加班），需要在其下细分二级分类，
--   且用户端小程序与 admin-web 管理后台共用同一数据源（store_categories）。
--
-- 设计：
--   - 一级分类：parent_id IS NULL（即现有 8 个 global 场景）
--   - 二级分类：parent_id = 所属一级分类 id
--   - 商品仍是 products.category_id → store_categories.id，可挂一级或二级；
--     用户端点一级「全部」时按 (一级 id + 其子类 id) IN 查询，兼容现有挂在一级上的商品。
--   - scope 仍是 global/store：二级默认 global（平台统一维护），商家亦可自建店内二级。
--
-- 幂等：可重复执行。加列用 IF NOT EXISTS；种子按 (parent_id, name) 去重。
--
-- 使用方式：
--   方式 A（推荐）：Supabase Dashboard → SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db query --linked --file supabase/migrations/20260927_add_category_parent.sql
-- ============================================================

-- =====================
-- 第1步：加自引用层级列（ON DELETE CASCADE：删一级时其二级一并删除）
-- =====================
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.store_categories(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.store_categories.parent_id IS '父分类 id：NULL=一级分类（场景）；非 NULL=二级分类';

-- =====================
-- 第2步：索引（用户端按 parent_id 拉取子类、后台展开树用）
-- =====================
CREATE INDEX IF NOT EXISTS idx_store_categories_parent_id ON public.store_categories(parent_id);

-- 防御：禁止「二级再挂二级」（只允许两层）——用触发器拦截，避免运营误建三级
CREATE OR REPLACE FUNCTION public.fn_store_categories_depth_guard()
RETURNS trigger AS $$
DECLARE
  p_parent uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_id INTO p_parent FROM public.store_categories WHERE id = NEW.parent_id;
    IF p_parent IS NOT NULL THEN
      RAISE EXCEPTION '分类最多两层：父分类「%」本身已是二级，不能再挂子类', NEW.parent_id;
    END IF;
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION '分类不能以自己为父';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_categories_depth_guard ON public.store_categories;
CREATE TRIGGER trg_store_categories_depth_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.store_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_store_categories_depth_guard();

-- =====================
-- 第3步：预置 8 场景的二级分类（示例内容，后台可随时改/删）
--   命名只用「形态 / 口味 / 场景」维度，不含任何功效或疾病词（合规）。
-- =====================
INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active, parent_id)
SELECT NULL, v.sub_name, v.sub_sort, 'global', true, p.id
FROM (VALUES
  -- 宝宝零食
  ('宝宝零食', '磨牙棒',   10),
  ('宝宝零食', '溶豆',     20),
  ('宝宝零食', '果蔬脆',   30),
  ('宝宝零食', '小饼干',   40),
  -- 孕产营养
  ('孕产营养', '坚果仁',   10),
  ('孕产营养', '果干片',   20),
  ('孕产营养', '营养粉',   30),
  ('孕产营养', '小食礼盒', 40),
  -- 老年养生
  ('老年养生', '五谷粉',   10),
  ('老年养生', '软糯糕',   20),
  ('老年养生', '低糖酥',   30),
  ('老年养生', '易嚼小食', 40),
  -- 舒心食养
  ('舒心食养', '花茶饮',   10),
  ('舒心食养', '温润糖',   20),
  ('舒心食养', '舒心小点', 30),
  ('舒心食养', '睡前小食', 40),
  -- 肠胃食养
  ('肠胃食养', '山药脆',   10),
  ('肠胃食养', '小米酥',   20),
  ('肠胃食养', '温和果干', 30),
  ('肠胃食养', '发酵小食', 40),
  -- 温润食养
  ('温润食养', '黑芝麻丸', 10),
  ('温润食养', '桂圆红枣', 20),
  ('温润食养', '姜糖',     30),
  ('温润食养', '坚果酥',   40),
  -- 敏感防护
  ('敏感防护', '无麸质',   10),
  ('敏感防护', '低敏坚果', 20),
  ('敏感防护', '纯果干',   30),
  ('敏感防护', '无添加系列', 40),
  -- 熬夜加餐（DB 现存名为「熬夜加班」）
  ('熬夜加班', '即食代餐', 10),
  ('熬夜加班', '能量坚果', 20),
  ('熬夜加班', '冻干果',   30),
  ('熬夜加班', '清新饮',   40)
) AS v(parent_name, sub_name, sub_sort)
JOIN public.store_categories p
  ON p.scope = 'global' AND p.name = v.parent_name AND p.parent_id IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_categories c
  WHERE c.parent_id = p.id AND c.name = v.sub_name
);

-- =====================
-- 第4步：校验（应看到 8 个一级 + 各自二级；一级 parent_id 为空）
-- =====================
SELECT p.name AS parent_name,
       c.name AS child_name,
       c.sort_order,
       c.is_active
FROM public.store_categories c
JOIN public.store_categories p ON p.id = c.parent_id
WHERE c.scope = 'global' AND p.scope = 'global'
ORDER BY p.sort_order, c.sort_order;
