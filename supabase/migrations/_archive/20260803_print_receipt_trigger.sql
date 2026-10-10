-- 支付即打印触发器（2026-08-03，修订版）
-- ------------------------------------------------------------
-- 目标：订单支付成功时，自动推送小票到门店打印机。
-- 关键修正：原方案只监听 pending_ship，但实测杭州礼品店真实订单支付后落在
--   pending_review（或经 pending_pay → pending_review），并不经过 pending_ship，
--   导致真机支付不出单。
--
-- 支付完成的唯一可靠锚点 = 「订单离开未支付状态 pending_pay」。
--   - 健康豆纯付：create-order 直接 INSERT 为已付态(pending_ship / pending_review)
--   - 微信/混合：create-order INSERT 为 pending_pay，支付成功后跃迁为 pending_review / pending_ship
-- 因此只要状态「离开 pending_pay」（INSERT 时即非 pending_pay，或 UPDATE 时由 pending_pay 变为其他态），
-- 即视为支付完成，触发打印，且每单仅触发一次（订单不会回到 pending_pay）。
--
-- 设计要点（沿用 trg_distribute_commission / 20260801c 已验证范式）：
--   - AFTER INSERT OR UPDATE，仅在「离开 pending_pay」时触发（幂等，单订单仅打一次）
--   - 通过 pg_net 异步 HTTP 调 print-receipt（verify_jwt=false，用 anon key 过网关）
--   - 无启用打印机的门店：print-receipt 返回 need_config，无害
--   - EXCEPTION 仅 RAISE WARNING，绝不阻断订单主流程
--   - 带 trigger_logs 诊断，便于排查
--
-- 部署：supabase db query --linked --file <本文件>

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fn_trigger_print_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM';
  v_func_url   text := 'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/print-receipt';
  v_payload    jsonb;
BEGIN
  -- 仅「离开未支付状态 pending_pay」时触发（支付完成的唯一锚点）
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_pay' THEN
      RETURN NEW; -- 刚创建且未支付，不打印
    END IF;
  ELSE -- UPDATE
    IF OLD.status <> 'pending_pay' OR NEW.status = 'pending_pay' THEN
      RETURN NEW; -- 仅在「从未支付 → 已支付」跃迁时触发
    END IF;
  END IF;

  INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'PRINT_ENTER');

  BEGIN
    v_payload := jsonb_build_object('order_id', NEW.id);

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

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'PRINT_NET_DONE');
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.trigger_logs (order_no, action, error) VALUES (NEW.order_no, 'PRINT_NET_FAILED', SQLERRM);
      RAISE WARNING '[trg_print] order_no=% error=%', NEW.order_no, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_print_receipt ON public.orders;

CREATE TRIGGER trg_print_receipt
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trigger_print_receipt();
