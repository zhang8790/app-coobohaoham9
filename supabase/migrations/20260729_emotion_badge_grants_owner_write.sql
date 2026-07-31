-- 修复：emotion_badge_grants 客户端写被 RLS 拦截（控制台 42501）
-- 根因：00095_consolidated_rls_final.sql 将该表归入“有 user_id 的流水表”，
--       套用 owner-只读 + admin-全权 策略；而 grantEmotionBadge 走普通
--       authenticated 客户端 upsert，INSERT 被 WITH CHECK(is_admin()) 拒绝。
-- 本迁移补充“本人可写自己 user_id 行”的策略（SELECT 仍沿用 00095 的 ownerread），
-- 让徽章颁发在客户端即可完成，同时保留管理员全权与行级隔离。
-- 幂等：先 DROP 同名策略再建，可重复执行。

DROP POLICY IF EXISTS rls_final_emotion_badge_grants_ownerwrite ON public.emotion_badge_grants;
CREATE POLICY rls_final_emotion_badge_grants_ownerwrite ON public.emotion_badge_grants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS rls_final_emotion_badge_grants_ownerupdate ON public.emotion_badge_grants;
CREATE POLICY rls_final_emotion_badge_grants_ownerupdate ON public.emotion_badge_grants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- 注释：badge_code 由客户端逻辑决定、行按 (user_id,badge_code) 唯一约束自隔离，
--       用户仅能写入自己名下的徽章行，无法篡改他人数据，风险可控。
