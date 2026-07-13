-- =====================================================
-- 00075: 测试期放开 points_logs 的 RLS（与 commissions / emotion_* 同口径）
-- -----------------------------------------------------
-- 背景：
--   - 00003 给 points_logs 启用了 RLS，且仅有「本人读自己」的 policy
--     （user_id = auth.uid()）。总后台 admin-web 用 anon key 读取，
--     auth.uid() 为空或不等于流水 owner，导致积分流水永远读不到（0 行）。
--   - 同期的 commissions 已在 00015 被 DISABLE RLS，emotion_tongbao_logs
--     在 00053/00072 被 DISABLE RLS，admin 均能直读。
--   - 为让「资产流水中心」三张表口径一致，这里把 points_logs 也放开。
-- 安全提示（生产环境）：
--   测试期关闭 RLS 是项目既定模式（见 00015/00028/00053/00072）。
--   若上线需收紧，应改为「仅 service_role / admin 角色可读全部」的 policy，
--   而非长期公开读。
-- =====================================================

-- 1) 关闭 RLS
ALTER TABLE public.points_logs DISABLE ROW LEVEL SECURITY;

-- 2) 补齐客户端角色权限（anon=未登录只读；authenticated=已登录；service_role=后台写入）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.points_logs TO anon, authenticated, service_role;
