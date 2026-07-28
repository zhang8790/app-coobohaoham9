-- 20260726: store_categories 支持「全局分类」(平台建) + 「店内分类」(商家建)
-- 背景：原 store_categories.store_id 为 NOT NULL，分类只能挂在具体门店下，
--       无法满足「平台建全局公共分类、商家在自己店内自建分类」的双重需求。
-- 改动：store_id 改可空 + 新增 scope 列 + 补充索引 + 新增 admin 管全局的 RLS。

-- 1) store_id 改为可空（全局分类 store_id = NULL）
ALTER TABLE public.store_categories ALTER COLUMN store_id DROP NOT NULL;

-- 2) 新增 scope 区分 global(平台公共) / store(某商家店内)
ALTER TABLE public.store_categories ADD COLUMN scope text NOT NULL DEFAULT 'store'
  CHECK (scope IN ('global', 'store'));

-- 3) 排序索引（全局按 scope+sort_order；店内按 store_id+sort_order）
CREATE INDEX IF NOT EXISTS idx_store_categories_scope ON public.store_categories (scope, sort_order);
CREATE INDEX IF NOT EXISTS idx_store_categories_store  ON public.store_categories (store_id, sort_order);

-- 4) RLS：平台 admin 可管理全局分类（store_id IS NULL 且 scope='global'）
DROP POLICY IF EXISTS "admin_manage_global_cats" ON public.store_categories;
CREATE POLICY "admin_manage_global_cats" ON public.store_categories
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role)
  WITH CHECK (store_categories.store_id IS NULL AND store_categories.scope = 'global');

-- 5) 店内分类：保留原 owner_manage_cats，限定 scope='store'（防止商家越权改全局）
DROP POLICY IF EXISTS "owner_manage_cats" ON public.store_categories;
CREATE POLICY "owner_manage_cats" ON public.store_categories
  FOR ALL TO authenticated
  USING (
    scope = 'store'
    AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    scope = 'store'
    AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
  );

COMMENT ON COLUMN public.store_categories.scope IS 'global=平台建的公共分类；store=某商家自建的店内分类';
COMMENT ON COLUMN public.store_categories.store_id IS '店内分类时指向所属门店；全局分类时为 NULL';
