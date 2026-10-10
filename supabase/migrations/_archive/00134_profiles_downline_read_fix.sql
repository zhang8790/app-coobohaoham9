-- 修复 00133 的 RLS 自引用递归（ERROR 42P17 infinite recursion in policy）
-- 原策略 USING 内对 profiles 自身做子查询，触发 RLS 递归。
-- 修法：把 L1 查找包进 SECURITY DEFINER 函数（所有者绕过 RLS，断掉递归链）。

-- 1) 删除有递归缺陷的旧策略
DROP POLICY IF EXISTS rls81_profiles_downline_read ON public.profiles;

-- 2) SECURITY DEFINER 函数：返回「我直接推荐的人」的 id 数组
--    以函数所有者（postgres，BYPASSRLS）身份执行，内部查询 profiles 不再套用本表 RLS，
--    从而杜绝递归。p_uid 由策略侧传入 auth.uid()，避免 SECURITY DEFINER 内 auth.uid() 的权限歧义。
CREATE OR REPLACE FUNCTION public.fn_my_l1_referral_ids(p_uid uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM public.profiles
  WHERE referrer_id = p_uid;
$$;

-- 3) 重建策略：L1（直接下级）或 L2（下级的下级）
CREATE POLICY rls81_profiles_downline_read ON public.profiles
FOR SELECT TO authenticated
USING (
  referrer_id = auth.uid()
  OR referrer_id = ANY(public.fn_my_l1_referral_ids(auth.uid()))
);

COMMENT ON POLICY rls81_profiles_downline_read ON public.profiles
IS '放行 authenticated 用户读取自己的一级/二级推荐下级（修复 00133 递归缺陷）';
