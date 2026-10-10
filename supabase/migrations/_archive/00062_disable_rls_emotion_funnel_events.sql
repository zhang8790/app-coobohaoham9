-- 强制关闭 emotion_funnel_events 行级安全：埋点由匿名 key 直写，无需登录态
-- 原 00051 已含 DISABLE RLS，但线上仍报 403(RLS 拦截匿名写入)，
-- 疑似该表在迁移前已手动建好并默认开启 RLS，导致 CREATE TABLE IF NOT EXISTS 跳过、
-- 而 ALTER 未生效。此处幂等再确保一次。
ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;
