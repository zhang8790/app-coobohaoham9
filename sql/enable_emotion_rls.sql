-- ⛔ 纯 SQL：仅粘贴到 Supabase SQL Editor（Dashboard → SQL）执行。不要当 TS/JS 粘贴。
-- ============================================================================
-- 目的：在数据库层把「确权数据」收紧，商家端 / 其他用户读不到别人的确权记录；
--       仅本人可读写自己的确权数据，总后台管理员(role='admin')可读全部。
-- 依据：supabase/migrations/00053 第 7 行原注「正式上线需按 user_id 收紧」。
-- 影响评估（已核对 src/db/api.ts）：
--   · C 端对 emotion_claims / emotion_assets / emotion_tongbao_logs /
--     emotion_badge_grants 的全部读写均为 user_id = 当前登录用户，开启 RLS 后无感。
--   · 成长占比 total_cv 当前走 api.ts 占位常量（get_platform_metrics RPC 未部署），
--     不依赖直读他人行，故不受本 RLS 影响。
--   · emotion_badge_defs 是前端公共徽章字典（仅 SELECT is_active），保持可读。
-- 幂等：先 DROP 同名策略再 CREATE，可重复执行。
-- ============================================================================

-- ========== 1) emotion_claims（确权记录） ==========
ALTER TABLE public.emotion_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_select_own" ON public.emotion_claims;
CREATE POLICY "claims_select_own" ON public.emotion_claims
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "claims_insert_own" ON public.emotion_claims;
CREATE POLICY "claims_insert_own" ON public.emotion_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "claims_update_own" ON public.emotion_claims;
CREATE POLICY "claims_update_own" ON public.emotion_claims
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "claims_admin_read_all" ON public.emotion_claims;
CREATE POLICY "claims_admin_read_all" ON public.emotion_claims
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ========== 2) emotion_assets（通宝余额，一行一用户） ==========
ALTER TABLE public.emotion_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_select_own" ON public.emotion_assets;
CREATE POLICY "assets_select_own" ON public.emotion_assets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "assets_insert_own" ON public.emotion_assets;
CREATE POLICY "assets_insert_own" ON public.emotion_assets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "assets_update_own" ON public.emotion_assets;
CREATE POLICY "assets_update_own" ON public.emotion_assets
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "assets_admin_read_all" ON public.emotion_assets;
CREATE POLICY "assets_admin_read_all" ON public.emotion_assets
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ========== 3) emotion_tongbao_logs（通宝流水） ==========
ALTER TABLE public.emotion_tongbao_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_select_own" ON public.emotion_tongbao_logs;
CREATE POLICY "logs_select_own" ON public.emotion_tongbao_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "logs_insert_own" ON public.emotion_tongbao_logs;
CREATE POLICY "logs_insert_own" ON public.emotion_tongbao_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "logs_admin_read_all" ON public.emotion_tongbao_logs;
CREATE POLICY "logs_admin_read_all" ON public.emotion_tongbao_logs
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ========== 4) emotion_badge_grants（徽章发放，一行一获得） ==========
ALTER TABLE public.emotion_badge_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grants_select_own" ON public.emotion_badge_grants;
CREATE POLICY "grants_select_own" ON public.emotion_badge_grants
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "grants_insert_own" ON public.emotion_badge_grants;
CREATE POLICY "grants_insert_own" ON public.emotion_badge_grants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "grants_admin_read_all" ON public.emotion_badge_grants;
CREATE POLICY "grants_admin_read_all" ON public.emotion_badge_grants
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ========== 5) emotion_badge_defs（徽章定义字典，前端公共目录） ==========
-- 保持可读：前端冷启动拉全部徽章定义渲染。仅开放 SELECT，不限制写入（写入只在迁移/运营后台）。
ALTER TABLE public.emotion_badge_defs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badge_defs_public_read" ON public.emotion_badge_defs;
CREATE POLICY "badge_defs_public_read" ON public.emotion_badge_defs
  FOR SELECT USING (true);

-- ========== 验证 ==========
SELECT tablename,
       rowsecurity,
       CASE WHEN rowsecurity THEN '✅ RLS 已开启' ELSE '❌ 仍关闭' END AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'emotion_claims','emotion_assets','emotion_tongbao_logs',
    'emotion_badge_grants','emotion_badge_defs'
  )
ORDER BY tablename;
