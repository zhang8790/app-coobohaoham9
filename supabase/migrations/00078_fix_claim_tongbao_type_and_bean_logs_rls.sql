-- =====================================================================
-- 00078: 修复两项运行时错误（纯服务端 schema，需本机执行）
--   ① emotion_claims.tongbao_amount 22P02
--   ② gold_bean_logs 客户端写入 403
--
-- 粘贴到 Supabase Dashboard → SQL Editor 执行即可（幂等）。
-- 依赖：00052(emotion_claims) / 00076(gold_bean_logs) 已建表。
-- =====================================================================

-- ---------------------------------------------------------------------
-- ① emotion_claims.tongbao_amount：smallint → numeric(12,2)
--   原 00052 把该列定义为 smallint（只能装整数），但业务计算的 tb(通宝/情绪豆)
--   是小数（如 0.02，货币型）。safeInsertClaim 同时写 tb_amount(numeric) 与
--   tongbao_amount(Math.max(tb,0))，小数塞进 smallint 直接抛
--   「invalid input syntax for type smallint: "0.02"」(22P02)，
--   导致确权记录永远写不进 → 订单中心永远显示「去确权」。
--   改为 numeric(12,2) 与 tb_amount 同口径，数据不丢、代码无需改。
-- ---------------------------------------------------------------------
ALTER TABLE emotion_claims
  ALTER COLUMN tongbao_amount TYPE numeric(12,2)
  USING tongbao_amount::numeric;

COMMENT ON COLUMN emotion_claims.tongbao_amount
  IS '历史兼容列（旧版存积分）；V2 起用 tb_amount(numeric)。现同改为 numeric 以容纳小数 tb';

-- ---------------------------------------------------------------------
-- ② gold_bean_logs：重新关闭 RLS + 补齐授权
--   表已存在（否则是 404 而非 403），但 RLS 处于开启且无 anon 策略，
--   客户端 anon key 写入被 403 拦截。00076 虽写了 DISABLE RLS，但若表是
--   Dashboard 手动创建（默认开 RLS）则其 CREATE TABLE IF NOT EXISTS 为 no-op，
--   DISABLE RLS 从未执行。这里强制再关一次并授权。
--   与项目测试期模式一致：emotion_* 在 00053/00072、points_logs 在 00075
--   均关闭 RLS，客户端直插。
-- ---------------------------------------------------------------------
ALTER TABLE public.gold_bean_logs DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gold_bean_logs
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- ⚠️ 还需补跑的迁移（本次未含，单独执行）：
--   00054_emotion_rollback_and_rules.sql
--     → 增补 tb_amount / cv_amount / badge_code / status / rule_version /
--       upline_* 等列 + fn_void_emotion_claim / fn_ban_user_rollback 函数。
--     不跑则全量确权走 42703 → 自动降级为基础列写入（tongbao_amount 已修，可成功），
--     但 badge_code/status/tb_amount 等扩展数据缺失。
-- ---------------------------------------------------------------------
