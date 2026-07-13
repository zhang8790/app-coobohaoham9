-- ============================================================================
-- 00072: 修复情绪子系统(emotion_*)客户端写入被 RLS 拦截（403 / 42501）
-- ============================================================================
-- 现象：小程序真机运行 emotion-claim 时，客户端(anon key)向
--       emotion_claims / emotion_badge_grants 执行 INSERT 返回 403，
--       PostgREST 报错 "new row violates row-level security policy"（code 42501）。
--       导致情绪确权整条链路瘫痪（确权记录写不进、徽章发不出）。
--
-- 根因：原 00052/00053 已显式 `DISABLE ROW LEVEL SECURITY`，但线上这两张表的
--       RLS 实际处于【开启态且无任何可用 policy】。最常见诱因是：
--       ① 在 Supabase Dashboard 点了某张表的「Enable RLS」安全开关/建议横幅；
--       ② 表曾经由 Dashboard 表编辑器新建（Dashboard 默认开启 RLS）。
--       RLS 一旦开启，anon key 直插即被拦——而本项目情绪表按设计本就由客户端直插。
--
-- 修复：幂等地重新 DISABLE RLS（与原设计意图一致），并显式补齐
--       anon / authenticated / service_role 的读写权限（RLS 关闭后仍需表级 privilege）。
--       覆盖全部 5 张 emotion_* 表，防止其余表在 Dashboard 被同方式误开后再次 403。
--
-- 【生产级加固备选（如需，可改用，不必现在做）】
--   本项目 profiles.id 直接 REFERENCES auth.users(id)，即 profile.id === auth.uid()；
--   客户端写入的 user_id 即为登录用户本身。因此可改为安全写法：
--     ALTER TABLE emotion_claims ENABLE ROW LEVEL SECURITY;
--     CREATE POLICY "own_claims" ON emotion_claims
--       FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--   徽章/资产/流水同理。注意：ENABLE 后必须配套 policy，否则仍会 403。
--   当前阶段按原设计保持 DISABLE，先解封功能。
-- ============================================================================

-- 1) 重新关闭行级安全（幂等，IF EXISTS 防止表名漂移报错）
ALTER TABLE IF EXISTS public.emotion_claims       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_assets        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_tongbao_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_badge_defs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_badge_grants  DISABLE ROW LEVEL SECURITY;

-- 2) 补齐客户端角色权限（anon=未登录只读/直插；authenticated=已登录；service_role=后台）
--    RLS 关闭后，PostgREST 仍要求角色具备表级 privilege，否则会变 permission denied。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_claims       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_assets        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_tongbao_logs  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_defs    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_grants  TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_claims       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_assets        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_tongbao_logs  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_defs    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_grants  TO service_role;

-- 3) 备注：确保 schema 使用权限也在（一般 init 已给，这里兜底）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 完成：emotion_* 全表恢复「客户端可直插/可读」的测试期设计状态。
