-- ============================================================
-- 运行时修复脚本（粘贴到 Supabase Dashboard → SQL Editor 执行）
-- 修复两项真机报错：
--   ① 下单 POST /orders 400  → order_status 枚举缺 'pending_pickup'
--   ② 埋点 POST /emotion_funnel_events 403 → RLS 拦截匿名写入
-- 全部幂等，可重复执行；先跑诊断看清现状，再跑修复。
-- ============================================================

-- ---------- 诊断（看清现状，可删）----------
SELECT enumlabel AS order_status_values
FROM pg_enum
WHERE enumtypid = 'public.order_status'::regtype
ORDER BY enumlabel;

SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'emotion_funnel_events';

-- ---------- 修复 ----------
-- ① 补枚举值（注意：PG 的 ALTER TYPE ADD VALUE 不支持 IF NOT EXISTS 语法，
--    用 DO 块包裹 + EXCEPTION 吞掉 duplicate_object，保证幂等可重复执行）
DO $$
BEGIN
  ALTER TYPE public.order_status ADD VALUE 'pending_pickup';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ② 关闭漏斗埋点表 RLS，允许匿名 key 直写
ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;
