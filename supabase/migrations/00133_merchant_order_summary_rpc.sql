-- =====================================================================
-- 00133 · 修复商家端「订单汇总（让利后）」四指标被截断 / 重复累加
-- 问题：merchant-orders 页用 getMerchantOrders(默认 limit=20, 且查 order_items 表→每个商品一行)
--       的返回在前端聚合：
--         · 订单数 = 商品行数（截断到 20，并非真实订单数）
--         · 销售/让利/实收 因 order_items 多行重复累加 total_amount + 截断 双重失真
-- 修复：新增 SECURITY DEFINER RPC，在数据库内基于 orders + merchant_settlements 一次性聚合，
--       仅「门店拥有者」(auth.uid() = stores.owner_id) 可查自己门店，避免 RLS 拦卖家 + 暴露他店。
--       前端 getMerchantOrderSummary 调用它，汇总卡片直接取真实数字。
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_get_store_order_summary(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_total_orders   int;
  v_total_sales    numeric;
  v_total_discount numeric;
  v_total_settle   numeric;
BEGIN
  -- 仅门店拥有者可查，杜绝跨店读取
  SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 订单数 + 销售总额（全部订单，不限状态）
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO v_total_orders, v_total_sales
    FROM public.orders
   WHERE store_id = p_store_id;

  -- 让利总额 + 实收总额（merchant_settlements 每订单一行）
  SELECT COALESCE(SUM(discount_pool), 0), COALESCE(SUM(settle_amount), 0)
    INTO v_total_discount, v_total_settle
    FROM public.merchant_settlements
   WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'total_orders',    v_total_orders,
    'total_sales',     v_total_sales,
    'total_discount',  v_total_discount,
    'total_settle',    v_total_settle
  );
END;
$$;

-- 诊断输出
DO $$
BEGIN
  RAISE NOTICE '[00133] 已创建 fn_get_store_order_summary：门店拥有者可读自己门店的真实 订单数/销售总额/让利总额/实收（替代被截断的 order_items 前端聚合）。';
END $$;
