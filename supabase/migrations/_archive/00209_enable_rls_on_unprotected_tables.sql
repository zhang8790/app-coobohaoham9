-- 00209_enable_rls_on_unprotected_tables
-- 给 7 张「已建表却未启用 RLS」的表补策略并开启行级安全。
--
-- 背景：未开 RLS = 持有 anon key 的任何人可全表读写（PostgREST 直接放行）。
--       实测 anon key 可读到 order_item_commissions 411 行佣金/资金明细。
--
-- 设计原则（关键，避免加固反而打断业务）：
--   1. 先配策略、再开 RLS，顺序不能反——反了后台列表会立刻空白。
--   2. 读路径保持不变（现状谁读得到，加固后仍读得到），
--      主要收紧「写」：把任意人可篡改收口到 管理员 / 本店运营 / service_role。
--   3. service_role 自带 BYPASSRLS，所有 Edge Function 读写不受影响
--      （已逐个核验：refund-order / wechat-refund-callback / distribute-commission /
--        expiry-engine / food-therapy-ai 均用 SUPABASE_SERVICE_ROLE_KEY 建 client）。
--   4. admin-web 走 anon + JWT，角色是 authenticated，靠 is_admin() 判定，
--      因此管理类策略一律写 USING (public.is_admin())。
--
-- 幂等：DROP POLICY IF EXISTS + CREATE POLICY；ENABLE RLS 可重复执行。

BEGIN;

-- =====================================================================
-- 1. site_configs —— 首页热更新配置（当前仅 home_ad_slots 广告位）
--    读：小程序 src/db/api.ts:40 getSiteConfig() 以 anon 身份读取 → 必须公开读，
--        否则首页 Banner 直接空白。
--    写：收口到管理员（admin-web HomeBranding / HomeAds）。
-- =====================================================================
ALTER TABLE public.site_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_site_configs_select_public ON public.site_configs;
CREATE POLICY p_site_configs_select_public ON public.site_configs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_site_configs_write_admin ON public.site_configs;
CREATE POLICY p_site_configs_write_admin ON public.site_configs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =====================================================================
-- 2. stock_batches —— 库存/临期批次
--    读：小程序 food-api.ts / food/tracker 页面按 product_id|store_id 查询
--        （该表无 user_id 列，无法判定"本人"，故读权限维持现状公开）。
--    写：收口到 管理员 + 本店运营（is_store_operator(store_id)）。
--        这是本次最重要的一处收紧：此前任意持有 anon key 者可篡改库存与临期折扣。
-- =====================================================================
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_stock_batches_select_public ON public.stock_batches;
CREATE POLICY p_stock_batches_select_public ON public.stock_batches
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_stock_batches_write_staff ON public.stock_batches;
CREATE POLICY p_stock_batches_write_staff ON public.stock_batches
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_store_operator(store_id))
  WITH CHECK (public.is_admin() OR public.is_store_operator(store_id));

-- =====================================================================
-- 3. expiry_alert_log —— 临期预警日志
--    读：仅管理员（admin-web Expiry.tsx:80）。
--    写：expiry-engine EF（service_role，自动绕过 RLS）。
-- =====================================================================
ALTER TABLE public.expiry_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_expiry_alert_log_select_admin ON public.expiry_alert_log;
CREATE POLICY p_expiry_alert_log_select_admin ON public.expiry_alert_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- =====================================================================
-- 4. symptom_rules —— 食养辨证规则库
--    读：仅管理员（前端不直读，消费方是 food-therapy-ai EF + admin-web SymptomRules）。
--    写：仅管理员（增删改 + 启停）。
-- =====================================================================
ALTER TABLE public.symptom_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_symptom_rules_admin ON public.symptom_rules;
CREATE POLICY p_symptom_rules_admin ON public.symptom_rules
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =====================================================================
-- 5. user_campaign_claims —— 活动领取记录（当前 1 行，前端零引用）
--    读/写：本人 + 管理员。
-- =====================================================================
ALTER TABLE public.user_campaign_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_campaign_claims_self ON public.user_campaign_claims;
CREATE POLICY p_user_campaign_claims_self ON public.user_campaign_claims
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 6. user_store_relation —— 锁客关系（小程序 api.ts:1456/1459 读写）
--    读：本人 + 本店运营 + 管理员。
--    写：本人 + 管理员（门店运营不给写，避免跨店改锁客归属）。
-- =====================================================================
ALTER TABLE public.user_store_relation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_store_relation_select ON public.user_store_relation;
CREATE POLICY p_user_store_relation_select ON public.user_store_relation
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_store_operator(store_id));

DROP POLICY IF EXISTS p_user_store_relation_write ON public.user_store_relation;
CREATE POLICY p_user_store_relation_write ON public.user_store_relation
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 7. order_item_commissions —— 商品级分佣明细（411 行，含佣金/让利/平台收入）
--    本次风险最高的一张：此前 anon key 可直接全表读取资金流水。
--    读：管理员 + 本人（作为 l1/l2 上级可见自己的佣金）。
--    写：不授予任何 authenticated 角色，全部由 service_role 的 EF 完成
--        （distribute-commission / refund-order / wechat-refund-callback）。
-- =====================================================================
ALTER TABLE public.order_item_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_order_item_commissions_select ON public.order_item_commissions;
CREATE POLICY p_order_item_commissions_select ON public.order_item_commissions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR l1_user_id = auth.uid()
    OR l2_user_id = auth.uid()
  );

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT c.relname, c.relrowsecurity AS rls_on,
--        (SELECT count(*) FROM pg_policies p
--          WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
-- FROM pg_class c
-- WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
--   AND c.relname IN ('site_configs','stock_batches','expiry_alert_log',
--                     'symptom_rules','user_campaign_claims',
--                     'user_store_relation','order_item_commissions')
-- ORDER BY 1;
-- 预期：7 行，rls_on = true，policies >= 1
