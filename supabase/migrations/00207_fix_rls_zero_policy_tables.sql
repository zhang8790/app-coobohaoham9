-- 00207 修复「RLS 已开启但零策略」的表
-- 症状：开了 RLS 却不建任何策略 = 除表 owner / SECURITY DEFINER 外全部拒绝。
--       表现为 PostgREST 返回 HTTP 200 + 空数组（不报错！），前端静默读不到数据。
--       实测 anon key 查 cities / withdrawal_accounts / system_flags / trigger_logs 均返回 0 行，
--       而 cities 有 250 行数据 —— 前端 lbs-service.ts 的城市列表必然为空。
--
-- 原则：按数据敏感度分级
--   · 公开参考数据（城市、食养模板）→ anon + authenticated 只读
--   · 用户私有数据（提现账户含身份证/银行卡、食养反馈、情绪偏好）→ 仅本人 + 管理员
--   · 内部运维数据（系统开关、触发器日志）→ 仅管理员读（写入走 service_role，不受 RLS 影响）
--
-- 幂等：先 DROP POLICY IF EXISTS 再 CREATE，可重复执行。

BEGIN;

-- ---------- 1. cities：公开只读（前端城市列表 / 定位）----------
DROP POLICY IF EXISTS rls_cities_public_read ON public.cities;
CREATE POLICY rls_cities_public_read ON public.cities
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------- 2. food_therapy_templates：公开只读（食养文案模板）----------
DROP POLICY IF EXISTS rls_therapy_tpl_public_read ON public.food_therapy_templates;
CREATE POLICY rls_therapy_tpl_public_read ON public.food_therapy_templates
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------- 3. withdrawal_accounts：含身份证号/银行卡号，仅本人 + 管理员 ----------
DROP POLICY IF EXISTS rls_wa_self ON public.withdrawal_accounts;
CREATE POLICY rls_wa_self ON public.withdrawal_accounts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- ---------- 4. food_therapy_feedback：仅本人 + 管理员 ----------
DROP POLICY IF EXISTS rls_tfb_self ON public.food_therapy_feedback;
CREATE POLICY rls_tfb_self ON public.food_therapy_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 5. user_mood_preferences：仅本人 + 管理员 ----------
DROP POLICY IF EXISTS rls_mood_self ON public.user_mood_preferences;
CREATE POLICY rls_mood_self ON public.user_mood_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 6. system_flags：内部开关，仅管理员读 ----------
DROP POLICY IF EXISTS rls_flags_admin ON public.system_flags;
CREATE POLICY rls_flags_admin ON public.system_flags
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------- 7. trigger_logs：运维日志，仅管理员读 ----------
DROP POLICY IF EXISTS rls_tlog_admin ON public.trigger_logs;
CREATE POLICY rls_tlog_admin ON public.trigger_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMIT;
