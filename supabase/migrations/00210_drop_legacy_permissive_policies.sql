-- 00210_drop_legacy_permissive_policies
-- 修复「RLS 已开却被一条遗留全开策略架空」的隐性安全问题。
--
-- 病症：全库 16 张表存在 cmd=ALL / roles={public} / qual=true 的策略
--       （faa_all / fa_all / ocr_all / intake_all / inv_all / pc_all / sb_all …）。
--       Postgres 的多条策略是 OR 关系，只要这条存在，
--       任何持有 anon key 的人都能对这些表任意增删改查——RLS 形同虚设。
--       此前 00209 只加了新策略，正是被 stock_batches.sb_all 架空，故补本迁移。
--
-- 处理：先 DROP 遗留全开策略，再按敏感度补分级策略，最后确保 RLS 开启。
-- 原则（避免加固打断业务）：
--   · 读路径尽量保持不变（现状谁读得到，加固后仍读得到）
--   · 收紧重点放在「写」与「含密钥/隐私的表」
--   · service_role 自带 BYPASSRLS，Edge Function 不受影响
--     （已核验 ocr-ingredient / food-match / food-backfill / ingredient-analyze /
--       print-receipt / expiry-engine 均用 SUPABASE_SERVICE_ROLE_KEY）
--   · admin-web 走 anon+JWT（角色 authenticated），靠 is_admin() 放行
--
-- 幂等：DROP POLICY IF EXISTS + CREATE POLICY；ENABLE RLS 可重复执行。

BEGIN;

-- =====================================================================
-- 组 A：基础字典 / 运营配置 —— C 端只读，后台维护
--   food_additive_aliases / food_additives / food_allergens /
--   food_crowd_tips / food_crowd_triggers / food_ingredients /
--   food_tag_rules / product_food_additives / product_subjects
--   读：小程序 food-safety.ts（过敏原库、人群文案）、api.ts:488（专题）需公开读
--   写：admin-web FoodSafetyLibs 等后台维护，收口到管理员
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'food_additive_aliases','food_additives','food_allergens',
    'food_crowd_tips','food_crowd_triggers','food_ingredients',
    'food_tag_rules','product_food_additives','product_subjects'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS faa_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fa_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fct_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fctip_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fi_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ftr_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS food_additives_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS pfa_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ps_all ON public.%I', t);

    EXECUTE format($f$
      DROP POLICY IF EXISTS p_sec_%1$s_select ON public.%1$I;
      CREATE POLICY p_sec_%1$s_select ON public.%1$I
        FOR SELECT TO anon, authenticated USING (true);

      DROP POLICY IF EXISTS p_sec_%1$s_write ON public.%1$I;
      CREATE POLICY p_sec_%1$s_write ON public.%1$I
        FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    $f$, t);
  END LOOP;
END $$;

-- =====================================================================
-- 组 B：个人数据 —— 本人 + 管理员
--   intake_logs(user_id)        健康摄入记录
--   health_reports(user_id)     周期性健康报告
--   food_analysis_reports(created_by)  配料安全标准报告（小程序 food-safety.ts）
--   inventories(owner_id)       库存归属
-- =====================================================================

-- intake_logs
ALTER TABLE public.intake_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intake_all ON public.intake_logs;
DROP POLICY IF EXISTS p_sec_intake_logs_self ON public.intake_logs;
CREATE POLICY p_sec_intake_logs_self ON public.intake_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- health_reports
ALTER TABLE public.health_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_all ON public.health_reports;
DROP POLICY IF EXISTS p_sec_health_reports_self ON public.health_reports;
CREATE POLICY p_sec_health_reports_self ON public.health_reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- food_analysis_reports
ALTER TABLE public.food_analysis_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS far_all ON public.food_analysis_reports;
DROP POLICY IF EXISTS p_sec_far_self ON public.food_analysis_reports;
CREATE POLICY p_sec_far_self ON public.food_analysis_reports
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

-- inventories
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_all ON public.inventories;
DROP POLICY IF EXISTS p_sec_inventories_self ON public.inventories;
CREATE POLICY p_sec_inventories_self ON public.inventories
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 组 C：OCR 任务 —— 本人 / 本店运营 / 管理员
--   ingredient_ocr_tasks：小程序 food-api.ts 创建（created_by 可为空），
--   商家按 store_id 管理，EF（service_role）读写。
--   读：已登录用户（覆盖 C 端自建自查看场景）
--   写：本人（含 created_by 为空的新建）+ 本店运营 + 管理员
-- =====================================================================
ALTER TABLE public.ingredient_ocr_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ocr_all ON public.ingredient_ocr_tasks;
DROP POLICY IF EXISTS p_sec_ocr_select ON public.ingredient_ocr_tasks;
CREATE POLICY p_sec_ocr_select ON public.ingredient_ocr_tasks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS p_sec_ocr_write ON public.ingredient_ocr_tasks;
CREATE POLICY p_sec_ocr_write ON public.ingredient_ocr_tasks
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid() OR created_by IS NULL
    OR public.is_store_operator(store_id) OR public.is_admin()
  )
  WITH CHECK (
    created_by = auth.uid() OR created_by IS NULL
    OR public.is_store_operator(store_id) OR public.is_admin()
  );

-- =====================================================================
-- 组 D：高敏感运营配置 —— 本店运营 + 管理员（读写全收口）
--   printer_configs：含 api_key / printer_key 明文密钥！
--   此前 pc_all(public/true) 意味着任何人可读走打印机密钥、可篡改打印配置。
--   消费方：小程序商家端(api.ts:4079+ 按 store_id)、admin-web printer.ts、
--           print-receipt EF(service_role)
-- =====================================================================
ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pc_all ON public.printer_configs;
DROP POLICY IF EXISTS p_sec_printer_configs_staff ON public.printer_configs;
CREATE POLICY p_sec_printer_configs_staff ON public.printer_configs
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_store_operator(store_id))
  WITH CHECK (public.is_admin() OR public.is_store_operator(store_id));

-- =====================================================================
-- 组 E：stock_batches —— 仅删除遗留全开策略
--   读/写策略已由 00209 建立（公开读 + 管理员/本店运营写），
--   这里只补删 sb_all，否则 00209 的写策略被架空。
-- =====================================================================
DROP POLICY IF EXISTS sb_all ON public.stock_batches;

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies WHERE schemaname='public'
--   AND cmd='ALL' AND roles='{public}' AND (qual='true' OR qual IS NULL);
-- 预期：0 行（全库再无任何 public 全开策略）
