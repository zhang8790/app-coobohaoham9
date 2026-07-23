-- ============================================================================
-- 00127_fix_merchant_applications_rls.sql
-- 修复：用户端「自营门店」提交申请失败（RLS 拦截 INSERT）
--
-- 根因（代码核实 2026-07-19）：
--   • merchant_applications 表实际使用 user_id 列（00001_init_schema.sql:161）。
--   • 00081_production_rls_hardening.sql 与 00095_consolidated_rls_final.sql 的
--     强化循环会先 DROP 该表全部既有策略，再重建；重建时对 merchant_applications
--     按 owner_id 列是否存在做分支判断（00081:213 / 00095:232），但该表没有
--     owner_id 列 → 仅创建了 rls_final_mapp_admin（USING is_admin()），
--     申请人（普通登录用户）本人无任何读写策略。
--   • 结果：普通用户 SELECT / INSERT 自己的自营门店申请都被 RLS 拒绝，
--     页面能打开、填完点提交却报「提交失败」（PostgREST 42501）。
--
-- 修复：补齐基于 user_id 的申请人策略（本人可读写自己的申请 + 管理员全权）。
-- 幂等，可重复执行；仅重建缺失的 owner 策略，不动其他表。
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NOT NULL THEN
    -- 清理 00081/00095 留下的「仅管理员」策略（避免与管理员全权在 USING 上重复/歧义）
    DROP POLICY IF EXISTS rls81_mapp_admin     ON public.merchant_applications;
    DROP POLICY IF EXISTS rls_final_mapp_admin ON public.merchant_applications;
    DROP POLICY IF EXISTS rls_final_mapp_owner ON public.merchant_applications;
    DROP POLICY IF EXISTS user_own_application  ON public.merchant_applications;

    -- 申请人本人：基于 user_id 可读写自己的申请；管理员全权
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'merchant_applications'
        AND policyname = 'rls_mapp_owner'
    ) THEN
      CREATE POLICY rls_mapp_owner ON public.merchant_applications
        FOR ALL TO authenticated
        USING (user_id = auth.uid() OR public.is_admin())
        WITH CHECK (user_id = auth.uid() OR public.is_admin());
    END IF;
  END IF;
END $$;

-- 确保 RLS 处于开启状态（强化迁移已 ENABLE，这里幂等兜底）
ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;
