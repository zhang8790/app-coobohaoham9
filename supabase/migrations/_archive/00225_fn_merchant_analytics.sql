-- 00225 商家后台数据分析聚合 RPC
-- 背景：admin-web 商家「数据分析」页（getMerchantAnalytics）原本一次性把全量 orders + 全量
--       order_items 拉到前端，用 JS 聚合今日/本月营收、销量趋势、商品排行——门店累计订单多时
--       每次进页面要传上万行，是自营管理中心最大卡顿源之一。
-- 做法：在数据库内按 store_id 一次性聚合，返回一行 jsonb（已支付口径），
--       前端只需一次轻量 RPC 调用即可拿到全部指标。
-- 口径：
--   营收/销量：仅计入已支付订单（pending_ship/pending_receive/pending_pickup/pending_review/completed）
--   累积客户：全部订单去重 user_id（与商家端原实现一致）
--   安全护栏：仅允许查询当前登录商家自己拥有的门店（owner_id = auth.uid()），防止越权读他人数据。

CREATE OR REPLACE FUNCTION public.fn_merchant_analytics(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH auth_store AS (
  SELECT id FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
),
paid_orders AS (
  SELECT o.id, o.total_amount, o.created_at, o.user_id
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND EXISTS (SELECT 1 FROM auth_store)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
),
today_bound AS (SELECT date_trunc('day', now()) AS t),
month_bound AS (SELECT date_trunc('month', now()) AS m),
revenue AS (
  SELECT
    COALESCE(SUM(CASE WHEN o.created_at >= (SELECT t FROM today_bound) THEN o.total_amount ELSE 0 END), 0) AS rev_today,
    COALESCE(SUM(CASE WHEN o.created_at >= (SELECT m FROM month_bound) THEN o.total_amount ELSE 0 END), 0) AS rev_month,
    COUNT(CASE WHEN o.created_at >= (SELECT t FROM today_bound) THEN 1 END) AS ord_today
  FROM paid_orders o
),
cust AS (
  SELECT COUNT(DISTINCT o.user_id) AS total_customers
  FROM public.orders o
  WHERE o.store_id = p_store_id AND EXISTS (SELECT 1 FROM auth_store)
),
trend AS (
  SELECT jsonb_agg(jsonb_build_object('date', lbl, 'amount', amt)) AS sales_trend
  FROM (
    SELECT
      (EXTRACT(month FROM d)::int::text || '/' || EXTRACT(day FROM d)::int::text) AS lbl,
      COALESCE(SUM(o.total_amount), 0)::int AS amt
    FROM generate_series(6, 0, -1) AS g(offs)
    CROSS JOIN LATERAL (SELECT (now() - ((g.offs)::text || ' days')::interval)::date AS d) dl
    LEFT JOIN paid_orders o ON o.created_at::date = dl.d
    GROUP BY dl.d
    ORDER BY dl.d
  ) t
),
top_agg AS (
  SELECT
    oi.product_name,
    COALESCE(SUM(oi.price * oi.quantity), 0)::int AS sales
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    AND EXISTS (SELECT 1 FROM auth_store)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_name
  ORDER BY SUM(oi.price * oi.quantity) DESC
  LIMIT 5
),
top AS (
  SELECT jsonb_agg(jsonb_build_object('name', product_name, 'sales', sales, 'trend', 'up')) AS top_products
  FROM top_agg
)
SELECT jsonb_build_object(
  'revenueToday',   (SELECT rev_today::int  FROM revenue),
  'revenueMonth',   (SELECT rev_month::int  FROM revenue),
  'ordersToday',    (SELECT ord_today::int  FROM revenue),
  'totalCustomers', (SELECT total_customers::int FROM cust),
  'salesTrend',     COALESCE((SELECT sales_trend FROM trend), '[]'::jsonb),
  'topProducts',    COALESCE((SELECT top_products FROM top),   '[]'::jsonb)
)
$$;

COMMENT ON FUNCTION public.fn_merchant_analytics(uuid)
  IS '商家后台数据分析聚合：今日/本月营收、今日订单、累积客户、近7日趋势、TOP5商品；服务端聚合替代前端万级拉取';
