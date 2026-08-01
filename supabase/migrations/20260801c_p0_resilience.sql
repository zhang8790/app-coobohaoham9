-- =====================================================================
-- P0 运营保命加固：分佣触发器诊断日志收敛 + 保留策略 + 关键索引
-- 目标：① 停止 trigger_logs 无限膨胀（运营期最会拖垮下单链路的隐患）
--       ② 补齐热点查询索引，扛 1万会员并发有余量
-- 全部幂等：CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT DO NOTHING
-- =====================================================================

-- 1) 诊断总开关表（默认关闭 trace 全量记录）
CREATE TABLE IF NOT EXISTS public.system_flags (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT 'false',
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.system_flags (key, value, note)
VALUES ('trigger_logs_enabled', 'false', '分佣触发器 trace 日志总开关；true=全量记录, false=仅记录异常')
ON CONFLICT (key) DO NOTHING;

-- 2) 诊断日志收敛函数：开关关闭时只记 error，避免运营期无限膨胀
--    error 永远落库（排查必需），trace 仅当开关开启
CREATE OR REPLACE FUNCTION public.fn_diag_log(
  p_order_no text,
  p_action   text,
  p_error    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $f$
DECLARE
  v_on boolean := false;
BEGIN
  IF p_error IS NOT NULL THEN
    INSERT INTO public.trigger_logs (order_no, action, error)
    VALUES (p_order_no, p_action, p_error);
    RETURN;
  END IF;
  SELECT (value = 'true') INTO v_on
  FROM public.system_flags
  WHERE key = 'trigger_logs_enabled';
  IF v_on IS DISTINCT FROM true THEN
    RETURN;
  END IF;
  INSERT INTO public.trigger_logs (order_no, action)
  VALUES (p_order_no, p_action);
END;
$f$;

-- 3) 重写分佣触发器：所有内联 INSERT 改为 fn_diag_log（开关关 -> 仅异常落库）
CREATE OR REPLACE FUNCTION public.fn_trigger_distribute_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqaWl0YnN0d3RoYm4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MjU2MDc3MywiZXhwIjoyMDU4MTM2NzczfQ.MHdJx4XjIMhSU_OJte0WjG1H2-jYO_0seFGMH0HRHc4';
  v_func_url   text := 'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/distribute-commission';
  v_payload    jsonb;
  v_referrer   uuid;
BEGIN
  PERFORM public.fn_diag_log(NEW.order_no, 'ENTER');

  IF NEW.commission_distributed = true THEN
    PERFORM public.fn_diag_log(NEW.order_no, 'SKIP_ALREADY_DONE');
    RETURN NEW;
  END IF;
  IF NEW.payment_method <> 'emotion_beans' THEN
    PERFORM public.fn_diag_log(NEW.order_no, 'SKIP_NOT_BEANS');
    RETURN NEW;
  END IF;

  PERFORM public.fn_diag_log(NEW.order_no, 'PROCEED');

  BEGIN
    SELECT p.referrer_id INTO v_referrer
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    PERFORM public.fn_diag_log(NEW.order_no, 'GOT_REFERRER');

    v_payload := jsonb_build_object(
      'order_id',      NEW.id,
      'order_no',      NEW.order_no,
      'payer_id',      NEW.user_id,
      'total_amount',  NEW.total_amount,
      'net_amount',    0,
      'store_id',      NEW.store_id,
      'referrer_id',   v_referrer
    );

    PERFORM public.fn_diag_log(NEW.order_no, 'CALLING_NET');

    PERFORM net.http_post(
      url      := v_func_url,
      body     := v_payload,
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      timeout_milliseconds := 30000
    );

    PERFORM public.fn_diag_log(NEW.order_no, 'NET_DONE');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.fn_diag_log(NEW.order_no, 'NET_FAILED', SQLERRM);
      RAISE WARNING '[trg] order_no=% error=%', NEW.order_no, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- 4) 热点查询索引（IF NOT EXISTS 幂等）
--    首页门店隔离：getProducts({storeId}) 走 store_id 过滤 + is_active + created_at 排序
CREATE INDEX IF NOT EXISTS idx_products_store_active_created
  ON public.products (store_id, is_active, created_at DESC);
--    订单按门店/状态/时间查询（后台、对账、补跑）
CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON public.orders (store_id, status, created_at DESC);
--    用户订单列表（C 端我的订单）
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
  ON public.orders (user_id, status, created_at DESC);
--    分佣补跑：按是否已分发扫表
CREATE INDEX IF NOT EXISTS idx_orders_commission_distributed
  ON public.orders (commission_distributed, created_at DESC)
  WHERE commission_distributed = false;
--    两级分销：按上级反查下级（分佣、团队统计）
CREATE INDEX IF NOT EXISTS idx_profiles_referrer
  ON public.profiles (referrer_id);

-- 5) trigger_logs 兜底补 created_at（供清理策略使用）
ALTER TABLE public.trigger_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created
  ON public.trigger_logs (created_at DESC);

-- 6) 清理函数：保留最近 N 天，返回删除行数
CREATE OR REPLACE FUNCTION public.fn_cleanup_trigger_logs(p_retention_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $f$
DECLARE
  v_deleted int := 0;
  v_has_ts  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trigger_logs'
      AND column_name  = 'created_at'
  ) INTO v_has_ts;
  IF NOT v_has_ts THEN
    RETURN 0;
  END IF;
  EXECUTE format(
    'DELETE FROM public.trigger_logs WHERE created_at < now() - ($1 || '' days'')::interval'
  ) USING p_retention_days;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$f$;

-- 7) 每日凌晨 03:17 自动清理（pg_cron 已在 00219/00222 启用）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_trigger_logs') THEN
    PERFORM cron.unschedule('cleanup_trigger_logs');
  END IF;
END $$;
SELECT cron.schedule(
  'cleanup_trigger_logs',
  '17 3 * * *',
  $$ SELECT public.fn_cleanup_trigger_logs(30); $$
);
