-- ============================================================
-- 20261008a_food_categories.sql
-- 食疗导购分类「food_category」由代码硬编码枚举 → 数据库驱动（后台可扩展，无需发版）
-- 背景：products.food_category 原先被 CHECK 锁死在 4 个值（粉面/炖汤/热饮/小菜），
--       新增分类（如 糕点/饮品）必须改代码+发版。本迁移把它改成「参考表驱动」：
--         - 放松 CHECK（旧 4 值仍合法，向后兼容，已有数据零影响）
--         - 新建 food_categories 参考表（admin 可增/改/停用）
--         - 前端下拉从此表读取（FOOD_CATEGORIES 常量仅作离线兜底）
-- 幂等：可重复执行。DROP CONSTRAINT IF EXISTS / CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING。
-- 执行：Supabase SQL Editor 整段粘贴 Run；或 supabase db query --linked --file <本文件>
-- ============================================================

-- 第1步：放松 products.food_category 的硬编码 CHECK（旧值仍合法，纯放宽）
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_food_category;

-- 第2步：食疗导购分类参考表
CREATE TABLE IF NOT EXISTS public.food_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  scope       text NOT NULL DEFAULT 'global',   -- global=平台统一维护；merchant=店内自建
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.food_categories IS '食疗导购分类参考表：替代 products.food_category 的硬编码 CHECK，后台可扩展';
COMMENT ON COLUMN public.food_categories.name IS '分类名（粉面/炖汤/热饮/小菜…，与旧 CHECK 值一致）';
COMMENT ON COLUMN public.food_categories.is_active IS '是否启用（停用的分类前端下拉不再出现，但历史商品仍保留该值）';

CREATE INDEX IF NOT EXISTS idx_food_categories_active ON public.food_categories (is_active, sort_order);

-- 第3步：种子——与旧 CHECK 完全一致，确保既有数据/前端不崩
INSERT INTO public.food_categories (name, sort_order) VALUES
  ('粉面', 1),
  ('炖汤', 2),
  ('热饮', 3),
  ('小菜', 4)
ON CONFLICT (name) DO NOTHING;

-- 第4步：updated_at 触发器（复用项目既有 set_updated_at()；此处兜底确保自包含）
CREATE TRIGGER trg_food_categories_touch_updated_at
  BEFORE UPDATE ON public.food_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 第5步：RLS
--   规则：admin（is_admin）全读写；登录用户 + 匿名 只读 is_active=true 的分类。
ALTER TABLE public.food_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS food_categories_admin_all ON public.food_categories;
CREATE POLICY food_categories_admin_all ON public.food_categories
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS food_categories_read ON public.food_categories;
CREATE POLICY food_categories_read ON public.food_categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ============================================================
-- 回滚（如需恢复硬编码约束，手动执行以下两段）：
--   ALTER TABLE public.products
--     ADD CONSTRAINT chk_products_food_category
--     CHECK (food_category IS NULL OR food_category IN ('粉面','炖汤','热饮','小菜'));
--   DROP TABLE IF EXISTS public.food_categories;
-- ============================================================
