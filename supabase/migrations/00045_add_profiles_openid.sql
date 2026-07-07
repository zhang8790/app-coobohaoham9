-- 00045_add_profiles_openid.sql
-- 云端 profiles 表缺失 openid 列（本地 00001 有，但推云端时未建出）。
-- 微信支付 / 真发现金红包依赖 profiles.openid 读取与写入。
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴 Run（DDL，anon key 无权，须控制台执行）。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS openid text;

COMMENT ON COLUMN public.profiles.openid IS '微信 openid，用于微信支付 JSAPI / 商家转账到零钱发放';

-- 若此前 RLS 被统一关闭，这里保持关闭（与项目测试期一致）。
-- 如后续重新开启 RLS，需为 profiles 配置允许 anon/service 读取 openid 的策略。
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
