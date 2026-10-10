-- 00222 销量累加触发器（替代 Edge Function 内的 fn_add_sales RPC 调用）
-- 背景：EF 内 rpc 调用被 try/catch 静默吞掉，导致「已支付订单不累加销量」(sales_count 卡在回填值)。
--       改为在数据库层用触发器累加，与 trg_distribute_commission 同思路，DB 级保证不被跳过。
--
-- 口径对齐商家端 REVENUE_STATUSES：已支付 = pending_ship/pending_receive/pending_pickup/pending_review/completed
-- 销量 = 已支付订单 order_items.quantity 之和（累计售出，退款不回扣）。
--
-- 设计（两条互斥、幂等的路径）：
--   路径① order_items AFTER INSERT：插入商品行时，若【父订单已处于已支付态】则累加当前行数量。
--         → 覆盖 纯金豆/全豆混合 下单：create-order 先插 order(pending_ship) 再插 order_items，此时父订单已支付。
--   路径② orders AFTER UPDATE OF status：状态【翻转为已支付态】(OLD 不在已支付态) 时整单累加一次。
--         → 覆盖 微信支付：pending_pay→pending_ship 由 wechat-payment-callback 翻转。
--   互斥性：纯金豆走①不走②(无状态UPDATE)；微信走②不走①(插items时父订单仍 pending_pay 未支付)。
--   幂等：仅 NEW 进入已支付态且 OLD 不在已支付态时累加；已支付态间流转/退款不重复计、不回扣。

CREATE OR REPLACE FUNCTION public.trg_order_items_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := ARRAY['pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed'];
  v_status text;
BEGIN
  SELECT o.status::text INTO v_status FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_status = ANY(v_paid) THEN
    UPDATE public.products p
       SET sales_count = p.sales_count + NEW.quantity
     WHERE p.id::text = NEW.product_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_sales ON public.order_items;
CREATE TRIGGER trg_order_items_sales
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_items_sales();

CREATE OR REPLACE FUNCTION public.trg_orders_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := ARRAY['pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed'];
BEGIN
  IF NEW.status::text = ANY(v_paid) AND (OLD.status IS NULL OR OLD.status::text <> ALL(v_paid)) THEN
    UPDATE public.products p
       SET sales_count = p.sales_count + agg.s
      FROM (
        SELECT oi.product_id, SUM(oi.quantity) AS s
          FROM public.order_items oi
         WHERE oi.order_id = NEW.id
         GROUP BY oi.product_id
      ) agg
     WHERE p.id::text = agg.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sales ON public.orders;
CREATE TRIGGER trg_orders_sales
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_sales();
