-- 清理 00081 残留的最后一条旧策略（被 rls_fix_withdrawals_read 完全覆盖）
DROP POLICY IF EXISTS rls81_withdrawals_ownerread ON withdrawals;

-- 最终状态验证
SELECT policyname, cmd, roles::text AS applies_to, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'withdrawals'
ORDER BY policyname;
