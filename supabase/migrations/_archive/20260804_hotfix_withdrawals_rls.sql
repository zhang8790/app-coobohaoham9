-- hotfix_withdrawals_rls.sql —— 补 withdrawals 表的 RLS 策略（admin 审核提现 403 修复）
-- 根因：00007 只有 SELECT(user_id=auth.uid) + INSERT(user_id=auth.uid)
--       缺少 UPDATE/DELETE 策略，admin 用户审核时被 RLS 默认 DENY
-- 本脚本幂等：先删同名策略再建

-- 1) 确保 is_admin / get_user_role 函数存在（SECURITY DEFINER）
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $func$
  SELECT role FROM public.profiles WHERE id = uid;
$func$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $func$
  SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false);
$func$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin()            TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid)   TO anon, authenticated, service_role;

-- 2) 清理 withdrawals 表上可能存在的旧策略（含 00007 遗留的）
DROP POLICY IF EXISTS "用户只能查看自己的提现记录"   ON public.withdrawals;
DROP POLICY IF EXISTS "用户只能创建自己的提现申请"   ON public.withdrawals;
DROP POLICY IF EXISTS rls_final_withdrawals_ownerread  ON public.withdrawals;
DROP POLICY IF EXISTS rls_final_withdrawals_admin      ON public.withdrawals;

-- 3) 建立正确的 RLS 策略（与 00095 设计一致）
--    SELECT: 本人可读 + 管理员可读
CREATE POLICY rls_fix_withdrawals_read ON public.withdrawals
  FOR SELECT TO anon, authenticated
  USING (user_id = auth.uid() OR public.is_admin());

--    INSERT: 本人可创建自己的提现申请
CREATE POLICY rls_fix_withdrawals_insert ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

--    UPDATE / DELETE: 仅管理员（审核通过/驳回/打款）
CREATE POLICY rls_fix_withdrawals_admin_write ON public.withdrawals
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4) 自检验证
SELECT tablename, policyname, cmd, roles::text AS applies_to,
       qual AS using_expr,
       with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'withdrawals'
ORDER BY policyname;
