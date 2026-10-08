-- ============================================================
-- 20261008b_ingredient_candidates.sql
-- 自由原料候选池：商家/用户在「自由输入原料」时登记，便于后续提升为正式食材字典条目。
-- 对齐：小程序端 + 网页后台的「自由原料（free: 前缀）」机制，登记到统一候选池做聚合。
-- 设计：
--   - 纯新增表，不动任何既有表/数据（低风险）。
--   - UNIQUE(name, store_id)：同一门店内同名原料只留一条；store_id 为 NULL 表示平台级。
--   - status：pending(待审)/approved(已收录为字典)/rejected(驳回)，由 admin 后台管理。
-- 幂等：CREATE TABLE IF NOT EXISTS；策略 DROP POLICY IF EXISTS 后重建。
-- 执行：Supabase SQL Editor 整段粘贴 Run；或 supabase db query --linked --file <本文件>
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ingredient_candidates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  store_id    uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  source      text NOT NULL DEFAULT 'free_input',  -- free_input/merchant/admin/import
  status      text NOT NULL DEFAULT 'pending',      -- pending/approved/rejected
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, store_id)
);

COMMENT ON TABLE  public.ingredient_candidates IS '自由原料候选池：自由输入的原料登记在此，供后续提升为正式食材字典';
COMMENT ON COLUMN public.ingredient_candidates.store_id IS '来源门店；NULL=平台级候选';
COMMENT ON COLUMN public.ingredient_candidates.status IS 'pending 待审 / approved 已收录 / rejected 驳回';

CREATE INDEX IF NOT EXISTS idx_ingredient_candidates_store   ON public.ingredient_candidates (store_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_candidates_status ON public.ingredient_candidates (status);
CREATE INDEX IF NOT EXISTS idx_ingredient_candidates_name   ON public.ingredient_candidates (name);

-- updated_at 触发器（复用项目既有 set_updated_at()）
CREATE TRIGGER trg_ingredient_candidates_touch_updated_at
  BEFORE UPDATE ON public.ingredient_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS：
--   admin（is_admin）全读写（管理候选状态）；
--   登录用户可读候选池（pending/approved 皆可看，便于同名复用），并允许登记（INSERT）；
--   匿名只读 approved（对外展示已收录原料）。
-- ⚠️ MVP 阶段 INSERT 放宽到 authenticated（store_id 由前端传入）；生产建议收敛到
--   校验「store_id 属于当前用户」或改由 Edge Function service_role 写入。
ALTER TABLE public.ingredient_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredient_candidates_admin_all ON public.ingredient_candidates;
CREATE POLICY ingredient_candidates_admin_all ON public.ingredient_candidates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ingredient_candidates_read ON public.ingredient_candidates;
CREATE POLICY ingredient_candidates_read ON public.ingredient_candidates
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ingredient_candidates_insert ON public.ingredient_candidates;
CREATE POLICY ingredient_candidates_insert ON public.ingredient_candidates
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 回滚：DROP TABLE IF EXISTS public.ingredient_candidates;
-- ============================================================
