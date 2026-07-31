-- ============================================================
-- 00219: 注册 expiry-engine 每日定时任务（临期预警折扣数据自动产生）
-- ------------------------------------------------------------
-- 背景：00213 建了 v_near_expiry_products 视图 + expiry-engine 函数，但一直没调度，
--       导致 auto_discount_rate / discount_stage 永远是默认(0 / normal)，
--       视图恒为空 → 全端「临期特惠」无任何数据、折扣套不上。本迁移注册 pg_cron 每日触发。
--
-- 调用方式：pg_cron + pg_net 异步 HTTP 调 Edge Function（与 trg_distribute_commission
--       触发器同范式）。函数 expiry-engine 用自身 service_role 改库、不校验调用方 JWT，
--       故 HTTP 头只需带公开 anon key 过网关（anon key 本就随端上包发布，非机密）。
--
-- 幂等：扩展 CREATE EXTENSION IF NOT EXISTS；先 unschedule 同名 job 再建，重复执行无副作用。
-- 手动补跑：部署后任意时刻
--   curl -X POST https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/expiry-engine \
--     -H "Authorization: Bearer <anon>" -H "Content-Type: application/json"
-- 若实例无 pg_cron（仅免费版缺）：改在 Supabase Dashboard → Database → Scheduled Functions
--   建「每日 03:00」调用 expiry-engine（与 auto-complete-orders / season-reminder 同惯例）。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 取消同名旧任务（避免重复注册）
SELECT cron.unschedule('expiry-engine-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expiry-engine-daily');

-- 注册每日 03:00（实例时区，通常为 UTC；如需 Asia/Shanghai 精确请在 Dashboard 调整）
SELECT cron.schedule(
  'expiry-engine-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/expiry-engine'::text,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM',
      'Content-Type', 'application/json'
    ),
    5000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS '每日触发 expiry-engine 自动分级+折扣（临期预警数据来源）';
