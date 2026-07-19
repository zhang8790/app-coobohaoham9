-- ============================================================================
-- 00095_consolidated_rls_final.sql   —— 最终 RLS 基线（修正 00081 的回退坑）
-- ============================================================================
-- 背景（为什么会「老是出现」保存/下单失败）：
--   00081_production_rls_hardening 第 1 节会对目标表「清空全部既有策略」再重建，
--   且把所有写策略收口为 admin-only。若在其后跑 00093(商家写商品)/00094(买家写订单)，
--   再跑 00081，00093/00094 的属主写策略会被 00081 删掉 → products/orders 重新变
--   成「仅管理员可写」→ 商家上架失败、买家下单失败。
--
-- 本迁移把「安全加固 + 商家写商品 + 买家写订单」合并为**一份顺序无关、幂等的最终态**：
--   无论之前跑过 00081/00093/00094 的什么顺序，只要最后跑本迁移，结果一定正确。
--
-- 策略命名统一用 rls_final_* 前缀，避免与 rls81_* 混淆；同时本迁移也会清空所有
-- 旧前缀(rls81_*/rls81_products_merchant_write 等)的残留策略。
--
-- 安全边界（保持 00081 的初衷，不削弱安全性）：
--   • 目录表(articles/announcements/emotion_* 等)：公开只读，仅管理员可写。
--   • products：公开只读；管理员 或 门店 owner（stores.owner_id = auth.uid()）可写自己门店。
--   • stores：公开只读；管理员 或 owner_id = auth.uid() 可写。
--   • orders / gold_bean_logs：本人(user_id)全权 CRUD + 管理员全权（买家可下单/查单/记金豆）。
--   • order_items：经 order_id 关联 orders.user_id 判定归属，本人或管理员可写。
--   • 其余流水表(commissions/withdrawals/...)：本人只读，仅管理员/ service_role 可写。
--   • cart_items/favorites/.../coupons：本人(user_id)全权 CRUD。
--   • profiles：本人读/改自己，管理员全权。
-- ============================================================================

-- ---------- 0) 管理员判定辅助函数（SECURITY DEFINER，避免递归 RLS） ----------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('user', 'admin');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false);
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin()            TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid)   TO anon, authenticated, service_role;

-- ---------- 1) 启用 RLS + 清空目标表全部既有策略（统一到干净基线） ----------
DO $$
DECLARE
  t   text;
  pol record;
  all_tables text[] := ARRAY[
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs','coupons',
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals',
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences',
    'profiles','merchant_applications'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ---------- 2) 目录类：公开可读；写策略按表区分 ----------
DO $$
DECLARE
  t         text;
  catalog   text[] := ARRAY[
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs'
  ];
  has_owner boolean;
BEGIN
  FOREACH t IN ARRAY catalog LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    -- 公开读
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);',
                   'rls_final_'||t||'_read', t);

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='owner_id'
    ) INTO has_owner;

    IF has_owner THEN
      -- stores 等有 owner_id 列：管理员 或 归属者 可写
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (owner_id = auth.uid() OR public.is_admin())
                        WITH CHECK (owner_id = auth.uid() OR public.is_admin());$f$,
                     'rls_final_'||t||'_write', t);
    ELSIF t = 'products' THEN
      -- products 无 owner_id 列，但归属到 store：管理员 或 门店 owner 可写自己门店
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin() OR EXISTS (
                                 SELECT 1 FROM stores s
                                 WHERE s.id = products.store_id AND s.owner_id = auth.uid()))
                        WITH CHECK (public.is_admin() OR EXISTS (
                                 SELECT 1 FROM stores s
                                 WHERE s.id = products.store_id AND s.owner_id = auth.uid()));$f$,
                     'rls_final_products_write', t);
    ELSE
      -- 其余目录表：仅管理员可写（与 00081 初衷一致）
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 3) 订单 / 流水类：本人可读写（买家下单）；管理员全权 ----------
DO $$
DECLARE
  t        text;
  fin      text[] := ARRAY[
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals'
  ];
  has_uid  boolean;
BEGIN
  FOREACH t IN ARRAY fin LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;

    IF has_uid THEN
      IF t IN ('orders','gold_bean_logs') THEN
        -- 买家本人可全权 CRUD（下单 / 查单 / 记金豆），管理员全权
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (user_id = auth.uid() OR public.is_admin())
                          WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                       'rls_final_'||t||'_owner', t);
      ELSE
        -- 其他有 user_id 的流水表：本人只读，管理员全权（写入走 service_role）
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                          USING (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls_final_'||t||'_ownerread', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
      END IF;
    ELSE
      IF t = 'order_items' THEN
        -- 无 user_id 列：经 order_id 关联 orders.user_id 判定归属
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (public.is_admin() OR EXISTS (
                                   SELECT 1 FROM orders o
                                   WHERE o.id = order_items.order_id AND o.user_id = auth.uid()))
                          WITH CHECK (public.is_admin() OR EXISTS (
                                   SELECT 1 FROM orders o
                                   WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));$f$,
                     'rls_final_order_items_owner', t);
      ELSE
        -- 其余无 user_id 的流水表：本人只读（管理员），写仅 service_role / 管理员
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                          USING (public.is_admin());$f$,
                     'rls_final_'||t||'_adminread', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------- 4) 属主 CRUD 类：本人(user_id)全权 ----------
DO $$
DECLARE
  t         text;
  owner_crud text[] := ARRAY[
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences','coupons'
  ];
  has_uid  boolean;
BEGIN
  FOREACH t IN ARRAY owner_crud LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;
    IF has_uid THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin())
                        WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls_final_'||t||'_owner', t);
    ELSE
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 5) 特殊表：profiles / merchant_applications ----------
CREATE POLICY rls_final_profiles_self_read    ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY rls_final_profiles_self_update  ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY rls_final_profiles_admin        ON public.profiles FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='merchant_applications' AND column_name='owner_id'
    ) THEN
      CREATE POLICY rls_final_mapp_owner ON public.merchant_applications FOR ALL TO authenticated
        USING (owner_id = auth.uid() OR public.is_admin())
        WITH CHECK (owner_id = auth.uid() OR public.is_admin());
    ELSE
      CREATE POLICY rls_final_mapp_admin ON public.merchant_applications FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;
  END IF;
END $$;

-- ---------- 6) 自检结果 ----------
SELECT
  tablename,
  policyname,
  cmd,
  roles::text AS applies_to
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('products','stores','orders','order_items','gold_bean_logs')
ORDER BY tablename, policyname;
