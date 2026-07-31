-- 修复 trg_distribute_commission 触发器：给 distribute-commission 的 payload 补传 store_id，
-- 使 distribute-commission 在未收到显式 discount_rate 时能从门店 referral_rate 自取兜底率，
-- 避免低让利率门店（如 3%）的纯健康豆订单被按硬编码 0.09 默认率多发 3 倍佣金。
-- 仅替换函数体；触发器绑定（CREATE TRIGGER trg_distribute_commission）保持不动。

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
  -- === DIAG: 触发器入口 ===
  INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'ENTER');

  IF NEW.commission_distributed = true THEN
    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'SKIP_ALREADY_DONE');
    RETURN NEW;
  END IF;
  IF NEW.payment_method <> 'emotion_beans' THEN
    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'SKIP_NOT_BEANS');
    RETURN NEW;
  END IF;

  INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'PROCEED');

  BEGIN
    SELECT p.referrer_id INTO v_referrer
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'GOT_REFERRER');

    -- 补传 store_id：distribute-commission 未收到显式 discount_rate 时可自取门店 referral_rate，
    -- 避免回落到硬编码 0.09 默认率导致低让利率门店被多发佣金。
    v_payload := jsonb_build_object(
      'order_id',      NEW.id,
      'order_no',      NEW.order_no,
      'payer_id',      NEW.user_id,
      'total_amount',  NEW.total_amount,
      'net_amount',    0,
      'store_id',      NEW.store_id,
      'referrer_id',   v_referrer
    );

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'CALLING_NET');

    PERFORM net.http_post(
      url      := v_func_url,
      body     := v_payload,  -- pg_net 0.20+ 要求 jsonb，禁止 ::text
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      timeout_milliseconds := 30000
    );

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'NET_DONE');
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.trigger_logs (order_no, action, error) VALUES (NEW.order_no, 'NET_FAILED', SQLERRM);
      RAISE WARNING '[trg] order_no=% error=%', NEW.order_no, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
