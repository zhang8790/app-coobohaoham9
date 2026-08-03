-- ============================================================
-- 20260802 自营门店统一管理 RBAC 地基
-- 目标：在现有「owner_id + profiles.role='merchant'」商家模型之上，
--       叠加 store_staff 细粒度运营身份，实现「单品牌多自营门店连锁」、
--       总后台建店建登陆、三端（总后台/网页中心/小程序）数据互通。
-- 原则：纯加法，不破坏现有 owner_id 商家模型；fn_my_store_ids 同时覆盖
--       两种身份，所有既有 RLS 策略自动对新身份生效。
-- 部署：supabase db query --linked --file <this-file>
-- ============================================================

-- 1) stores 加 store_type / created_by（加法，可为空，向后兼容）
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_type text CHECK (store_type IN ('hub', 'transfer', 'truck', 'branch')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.stores.store_type IS '门店类型：hub=总仓/中心仓, transfer=中转仓, truck=流动车, branch=普通门店';
COMMENT ON COLUMN public.stores.created_by IS '建店人（总后台 admin 的 profiles.id）';

-- 2) store_staff.role 增加 'manager'（先安全删除旧 CHECK 再建新，避免名称不确定）
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.store_staff'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.store_staff DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE public.store_staff
  ADD CONSTRAINT store_staff_role_check CHECK (role IN ('owner', 'manager', 'staff', 'cashier'));

-- 3) 历史门店 owner 自动成为 store_staff(role=owner)，统一身份来源
INSERT INTO public.store_staff (store_id, user_id, role, is_active)
SELECT s.id, s.owner_id, 'owner', true
FROM public.stores s
WHERE s.owner_id IS NOT NULL
ON CONFLICT (store_id, user_id) DO NOTHING;

-- 4) 扩展 fn_my_store_ids：同时返回「owner 门店」与「store_staff 活跃成员门店」
--    UNION 避免数组拼接去重/类型问题；SECURITY DEFINER 已绕过 RLS，无递归。
--    用 CREATE OR REPLACE（不 DROP），保持 OID 稳定，既有 RLS 策略依赖不受影响。
CREATE OR REPLACE FUNCTION public.fn_my_store_ids(p_uid uuid)
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM (
    SELECT id FROM public.stores WHERE owner_id = p_uid
    UNION
    SELECT store_id FROM public.store_staff WHERE user_id = p_uid AND is_active
  ) t
$$;
GRANT EXECUTE ON FUNCTION public.fn_my_store_ids(uuid) TO authenticated;

-- 5) 运营身份辅助函数
CREATE OR REPLACE FUNCTION public.is_store_operator(p_store_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM public.store_staff WHERE store_id = p_store_id AND user_id = auth.uid() AND is_active
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_store_operator(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_operator_store_ids()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.fn_my_store_ids(auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.get_operator_store_ids() TO authenticated;

-- 6) 启用 store_staff RLS 并加策略（store_staff 当前 RLS DISABLED）
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;

-- 6a) 读：本人看自己成员行 / admin 全量 / 本店 owner 看本店全员
DROP POLICY IF EXISTS rls_store_staff_select ON public.store_staff;
CREATE POLICY rls_store_staff_select ON public.store_staff
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

-- 6b) 写：仅 admin 或本店 owner（store_staff 成员由本店 owner/admin 管理）
DROP POLICY IF EXISTS rls_store_staff_write ON public.store_staff;
CREATE POLICY rls_store_staff_write ON public.store_staff
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

SELECT '20260802 自营门店统一管理 RBAC 地基 已完成' AS result;
