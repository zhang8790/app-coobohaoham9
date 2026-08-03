-- 清理 00081 残留的旧 withdrawals 策略（已被 hotfix 的三条新策略覆盖）
-- 旧策略 rls81_withdrawals_admin 是 ALL + is_admin()，与新 rls_fix_withdrawals_admin_write 功能重复

-- 1) 删除旧策略
DROP POLICY IF EXISTS rls81_withdrawals_admin ON withdrawals;

-- 2) 验证最终状态
SELECT policyname, cmd, roles::text AS applies_to, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'withdrawals'
ORDER BY policyname;
