-- ============================================================================
-- 00081_production_rls_hardening.sql   —— 生产安全收口（可执行版 v2）
-- ============================================================================
-- 目的（对应架构自查 SEC P0）：把测试期「RLS 全关 + 高危 RPC 授权 anon」的裸奔
-- 状态收口为生产安全基线：
--   ① 为敏感表启用 RLS，并按「属主 / 管理员」重建一套干净、幂等的策略；
--   ② 目录类表保持公开可读、仅管理员可写；
--   ③ 资金/流水类表：本人只读、写入仅 service_role（Edge Function）；
--   ④ 收回 00054 授予 anon/authenticated 的高危管理 RPC 执行权。
--
-- 前置事实（已在代码核实，2026-07-13）：
--   • 客户端使用 Supabase 真实 Auth（signInWithPassword/signUp/OTP），登录后
--     auth.uid() 可正确解析 —— 因此本脚本对已登录用户安全，不会误拦自有数据。
--   • service_role（Edge Functions）具备 BYPASSRLS，本脚本不影响其读写。
--   • 表结构自 00001 起即用 user_id DEFAULT auth.uid()，本脚本与原设计一致。
--
-- 幂等性：可重复执行。对每张目标表先「清空既有策略」再「重建标准策略」，
--          并对不存在的表 / 不存在的列做动态跳过（不会报错）。
--
-- 执行方式：
--   supabase db push            （已 link 生产项目后）
--   或在 SQL Editor 直接整段运行。
-- 建议：先在预发/影子库跑一次，用小程序 + 后台各点一遍读写路径验证不被误拦。
-- ============================================================================

-- ---------- 0) 管理员判定辅助函数（SECURITY DEFINER，避免递归 RLS） ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(get_user_role(auth.uid()) = 'admin'::user_role, false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ============================================================================
-- 1) 启用 RLS + 清空既有策略（统一到干净基线）
-- ============================================================================
DO $$
DECLARE
  t   text;
  pol record;
  all_tables text[] := ARRAY[
    -- 目录 / 公开可读
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs','coupons',
    -- 属主可读写（用户自有内容）
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences',
    -- 属主只读（写入仅 service_role）
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals',
    -- 特殊处理
    'profiles','merchant_applications'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      CONTINUE;  -- 表不存在则跳过
    END IF;
    -- 启用 RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- 清空该表现有全部策略，避免旧的宽松策略残留（permissive 会 OR 叠加）
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 2) 目录类：anon + authenticated 可读，仅管理员可写
-- ============================================================================
DO $$
DECLARE
  t text;
  catalog_tables text[] := ARRAY[
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs'
  ];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);$f$,
                   'rls81_'||t||'_read', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                   'rls81_'||t||'_admin', t);
  END LOOP;
END $$;

-- ============================================================================
-- 3) 属主可读写类：user_id = auth.uid() 全权 CRUD；管理员全权
-- ============================================================================
DO $$
DECLARE
  t text;
  owner_crud_tables text[] := ARRAY[
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences','coupons'
  ];
  has_uid boolean;
BEGIN
  FOREACH t IN ARRAY owner_crud_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;

    IF has_uid THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin())
                        WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls81_'||t||'_owner', t);
    ELSE
      -- 无 user_id 列：退化为仅管理员可访问，避免误开
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls81_'||t||'_adminonly', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 4) 属主只读类：本人 SELECT；写入仅 service_role（不建 authenticated 写策略）；管理员全权
-- ============================================================================
DO $$
DECLARE
  t text;
  owner_read_tables text[] := ARRAY[
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals'
  ];
  has_uid boolean;
BEGIN
  FOREACH t IN ARRAY owner_read_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;

    IF has_uid THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls81_'||t||'_ownerread', t);
    ELSE
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                        USING (public.is_admin());$f$,
                     'rls81_'||t||'_adminread', t);
    END IF;
    -- 管理员全权（含写）；普通用户写入一律走 service_role Edge Function
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                   'rls81_'||t||'_admin', t);
  END LOOP;
END $$;

-- ============================================================================
-- 5) 特殊表：profiles（本人读写自己） / merchant_applications（申请人 + 管理员）
-- ============================================================================
-- profiles：主键 id = auth.uid()
CREATE POLICY rls81_profiles_self_read   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY rls81_profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY rls81_profiles_admin       ON public.profiles FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- merchant_applications：申请人（owner_id）可读写自己的申请；管理员全权
DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='merchant_applications' AND column_name='owner_id') THEN
      CREATE POLICY rls81_mapp_owner ON public.merchant_applications FOR ALL TO authenticated
        USING (owner_id = auth.uid() OR public.is_admin())
        WITH CHECK (owner_id = auth.uid() OR public.is_admin());
    ELSE
      CREATE POLICY rls81_mapp_admin ON public.merchant_applications FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;
  END IF;
END $$;

-- stores：店主（owner_id）可管理自己的店；管理员全权（读已由 catalog 公开策略覆盖）
DO $$
BEGIN
  IF to_regclass('public.stores') IS NOT NULL THEN
    CREATE POLICY rls81_stores_owner ON public.stores FOR ALL TO authenticated
      USING (owner_id = auth.uid() OR public.is_admin())
      WITH CHECK (owner_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- ============================================================================
-- 6) 收回 00054 授予 anon/authenticated 的高危管理 RPC 执行权（仅 service_role 可调）
-- ============================================================================
DO $$
DECLARE
  fn text;
  -- 00054 中以 GRANT ... TO anon, authenticated 暴露的高危函数（按实际签名收回）
  danger_fns text[] := ARRAY[
    'fn_ban_user_rollback(uuid, text)',
    'fn_void_emotion_claim(uuid, text, numeric)'
  ];
BEGIN
  FOREACH fn IN ARRAY danger_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated;', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE '跳过（函数不存在）: %', fn;
    END;
  END LOOP;
END $$;
-- 说明：fn_total_cv() 为只读统计，可保留 anon 执行权；如需收紧一并 REVOKE。
-- emotion_rule_versions 的 anon SELECT 已由第 2 节目录读策略覆盖，无需额外授予。

-- ============================================================================
-- 7) 自检：列出仍未启用 RLS 的 public 表（应为空或仅剩明确无需 RLS 的表）
-- ============================================================================
-- 运行后可执行以下查询核对：
--   SELECT tablename FROM pg_tables t
--   WHERE schemaname='public'
--     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--                     WHERE c.relname=t.tablename AND n.nspname='public' AND c.relrowsecurity)
--   ORDER BY 1;
-- ============================================================================
