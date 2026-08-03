-- ============================================================
-- 00222: 注册运营对账/重试 每日定时任务
-- ------------------------------------------------------------
-- 与 00219(expiry-engine) 同范式：pg_cron + pg_net 异步 HTTP 调 Edge Function。
-- 函数自身用 service_role 改库、不校验调用方 JWT，HTTP 头仅带公开 anon key 过网关。
-- 幂等：先 unschedule 同名 job 再建，重复执行无副作用。
--
--   pay-reconcile-daily   每日 04:00  扫近 7 天订单/退款，与微信侧比对，差异落表 + 告警
--   commission-retry-daily 每日 04:30 扫「待补跑」订单重跑分佣（最多3次）
--
-- 若实例无 pg_cron（仅免费版缺）：在 Supabase Dashboard → Database → Scheduled Functions
-- 建两个「每日」任务分别调 /functions/v1/pay-reconcile 与 /functions/v1/commission-retry。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 取消同名旧任务
SELECT cron.unschedule('pay-reconcile-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pay-reconcile-daily');
SELECT cron.unschedule('commission-retry-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'commission-retry-daily');

-- 支付/退款对账：每日 04:00（实例时区；如需 Asia/Shanghai 精确请在 Dashboard 调整）
SELECT cron.schedule(
  'pay-reconcile-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/pay-reconcile'::text,
    '{"days":7}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM',
      'Content-Type', 'application/json'
    ),
    5000
  );
  $$
);

-- 分佣自动补跑：每日 04:30
SELECT cron.schedule(
  'commission-retry-daily',
  '30 4 * * *',
  $$
  SELECT net.http_post(
    'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/commission-retry'::text,
    '{"limit":50}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM',
      'Content-Type', 'application/json'
    ),
    5000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS '每日触发 pay-reconcile(对账) 与 commission-retry(分佣补跑)';
