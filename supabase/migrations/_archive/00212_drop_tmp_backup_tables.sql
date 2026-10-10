-- 00212_drop_tmp_backup_tables
-- 删除 force-login 后门遗留的两张临时备份表。
--
-- 背景：
--   _tmp_profile_backup / _tmp_referrer_backup 由 src/scripts/force-login-prep*.sql 创建，
--   是 force-login Edge Function（绕过 GoTrue 直接签发 session 的生产后门）的数据源，
--   曾被 supabase/functions/force-login/index.ts:60/141 读取。
--
-- 前置（已完成，可复核）：
--   1. AuthContext.tsx 中所有硬编码测试号分支与 force-login 调用已移除，
--      手机号密码登录改为查 public.user_login_identities 映射表（迁移 00211）。
--   2. 线上 Edge Function force-login 已删除（supabase functions delete）。
--   3. 本地 supabase/functions/force-login/ 与 src/scripts/force-login-prep*.sql 已删除。
--   至此两张表零引用，可安全丢弃。
--
-- 数据量：_tmp_profile_backup 1 行、_tmp_referrer_backup 1 行，均无主键，非业务表。
-- 幂等：DROP TABLE IF EXISTS。

BEGIN;

DROP TABLE IF EXISTS public."_tmp_profile_backup";
DROP TABLE IF EXISTS public."_tmp_referrer_backup";

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public' AND table_name LIKE '\_tmp%';
-- 预期：0 行
