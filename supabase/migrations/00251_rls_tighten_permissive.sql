-- 00251_rls_tighten_permissive.sql
-- 在线执行：supabase db query --linked < supabase/migrations/00251_rls_tighten_permissive.sql
-- 背景：全表 RLS 真实审计（直接查线上 pg_class / pg_policies，而非 schema.sql 文本）发现 6 张表挂了
--       USING(true) 的宽松策略，使公开 anon key 或任意 authenticated 用户可越权读写敏感/运营数据：
--         · reconcile_discrepancies（高危：微信/本地对账差异，含金额与收付状态）
--         · alert_logs（高危：资损/分佣失败/对账差异告警）
--         · ingredient_ocr_tasks（中：各门店配料 OCR 图，原 SELECT USING(true) 任意登录用户可读全部）
--         · home_ads（中：旧版首页广告位，新版已改读 site_configs.home_ad_slots，零代码引用）
--         · medicinal_food_catalog（中：药食同源目录，读已拒绝但写放开）
--         · error_logs（低-中：技术错误日志）
--       这些表本只经 Edge Function（service_role 绕过 RLS）或后台管理员访问；宽松策略纯属后门。
-- 处理：删宽松策略（默认拒绝 anon）；后台管理改走 is_admin()；客户端直连的 OCR 任务改 owner/本店运营隔离。
-- 幂等：策略先 DROP POLICY IF EXISTS 再 CREATE；触发器 CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS。
-- 注意：标准 PostgreSQL 的 CREATE POLICY 不支持 IF NOT EXISTS，故用 DROP POLICY IF EXISTS 保证可重复执行。

-- 1) reconcile_discrepancies（高危）→ 仅后台管理员可读写
DROP POLICY IF EXISTS service_all_rec ON public.reconcile_discrepancies;
CREATE POLICY admin_rec_all ON public.reconcile_discrepancies
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2) alert_logs（高危）→ 仅后台管理员可读写（客户端经 client-error-log / biz-alert EF 上报，EF 走 service_role 绕过 RLS）
DROP POLICY IF EXISTS service_all_alert ON public.alert_logs;
CREATE POLICY admin_alert_all ON public.alert_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3) error_logs（低-中）→ 仅后台管理员可读写
DROP POLICY IF EXISTS service_all_err ON public.error_logs;
CREATE POLICY admin_err_all ON public.error_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4) medicinal_food_catalog（中）→ 读已拒绝；写仅后台管理员
DROP POLICY IF EXISTS "service only write" ON public.medicinal_food_catalog;
CREATE POLICY mfc_admin_write ON public.medicinal_food_catalog
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5) home_ads（中，旧版/零引用）→ 删 anon 全开放后门，仅留公开读(home_ads_public_read) + 管理员写
DROP POLICY IF EXISTS home_ads_auth_all ON public.home_ads;
CREATE POLICY home_ads_admin_write ON public.home_ads
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6) ingredient_ocr_tasks（中）→ 读收紧为 owner / 本店运营 / 管理员 隔离；并加触发器补 created_by
DROP POLICY IF EXISTS p_sec_ocr_select ON public.ingredient_ocr_tasks;
CREATE POLICY p_sec_ocr_select ON public.ingredient_ocr_tasks
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_store_operator(store_id) OR public.is_admin());

DROP POLICY IF EXISTS p_sec_ocr_write ON public.ingredient_ocr_tasks;
CREATE POLICY p_sec_ocr_write ON public.ingredient_ocr_tasks
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_store_operator(store_id) OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_store_operator(store_id) OR public.is_admin());

-- 触发器：客户端（authenticated）新建 OCR 任务时若未带 created_by，自动补当前用户，
-- 使上面的 owner 隔离生效，无需改客户端/重新上传小程序。
-- service_role（Edge Function，如 ocr-ingredient / ingredient-analyze）插入时 auth.uid() 为空，created_by 保持 NULL，
-- EF 读经 service_role 绕过 RLS，不受影响。
CREATE OR REPLACE FUNCTION public.set_ocr_task_created_by()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ocr_task_created_by ON public.ingredient_ocr_tasks;
CREATE TRIGGER trg_ocr_task_created_by BEFORE INSERT ON public.ingredient_ocr_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_ocr_task_created_by();
