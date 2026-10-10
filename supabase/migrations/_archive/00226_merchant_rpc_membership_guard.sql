-- 00226 商家聚合 RPC：账号口径护栏修正 + 趋势窗口参数化
--
-- 背景（两个真实缺陷）：
--   ① 护栏口径错误：00223/00225 的越权护栏写死 `owner_id = auth.uid()`。但总后台
--      「建店 + 建登陆」会把运营账号写成 store_staff(role='owner')，其 id 不等于
--      stores.owner_id。这类账号（RLS 认定其可管理该店，门店切换器也能看到）调用
--      本函数时恒返回全 0 —— 表现就是数据分析页/店铺概况「有店但数据全空」。
--      修正为与 stores 表 RLS 完全同口径：owner ∪ 活跃 staff（fn_my_store_ids），
--      并额外放行平台管理员 is_admin()。这是收紧到「同一套成员判定」，不放宽边界。
--   ② 页面「近30日」按钮点了没反应：趋势窗口在 SQL 里硬编码 7 天。新增 p_days 参数。
--
-- 签名变更说明：fn_merchant_analytics 由 (uuid) 变为 (uuid, int DEFAULT 7)。
--   必须先 DROP 旧签名再 CREATE —— 若用 CREATE OR REPLACE 且不 DROP，会保留旧重载，
--   PostgREST 可能报 "Could not choose the best candidate function"。
--   DROP 会丢失 GRANT，下方按线上原 ACL 逐条还原（PUBLIC/anon/authenticated/service_role）。
--   fn_merchant_product_sales 签名不变，用 CREATE OR REPLACE 原地替换（ACL 自动保留）。

BEGIN;

-- ── 1) fn_merchant_analytics：口径修正 + 窗口参数化 ────────────────────────
DROP FUNCTION IF EXISTS public.fn_merchant_analytics(uuid);

CREATE FUNCTION public.fn_merchant_analytics(p_store_id uuid, p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH authorized AS (
  SELECT 1
  WHERE p_store_id = ANY(public.fn_my_store_ids(auth.uid()))
     OR public.is_admin()
),
paid_orders AS (
  SELECT o.id, o.total_amount, o.created_at, o.user_id
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND EXISTS (SELECT 1 FROM authorized)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
),
days_n AS (SELECT GREATEST(COALESCE(p_days, 7), 1) AS n),
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
  WHERE o.store_id = p_store_id AND EXISTS (SELECT 1 FROM authorized)
),
trend AS (
  SELECT jsonb_agg(jsonb_build_object('date', lbl, 'amount', amt)) AS sales_trend
  FROM (
    SELECT
      (EXTRACT(month FROM dl.d)::int::text || '/' || EXTRACT(day FROM dl.d)::int::text) AS lbl,
      COALESCE(SUM(o.total_amount), 0)::int AS amt
    FROM generate_series(1, (SELECT n FROM days_n)) AS g(i)
    CROSS JOIN LATERAL (
      SELECT (now() - (((SELECT n FROM days_n) - g.i) || ' days')::interval)::date AS d
    ) dl
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
    AND EXISTS (SELECT 1 FROM authorized)
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

-- 还原 DROP 丢失的授权（与线上原 ACL 一致）
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO service_role;

COMMENT ON FUNCTION public.fn_merchant_analytics(uuid, int)
  IS '商家后台数据分析聚合：今日/本月营收、今日订单、累积客户、近 p_days 日趋势、TOP5商品；护栏口径 = fn_my_store_ids(auth.uid()) ∪ is_admin()';

-- ── 2) fn_merchant_product_sales：仅修正口径（签名不变，原地替换）──────────
CREATE OR REPLACE FUNCTION public.fn_merchant_product_sales(p_store_id uuid)
RETURNS TABLE (product_id uuid, sales bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id::uuid                                                AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint                              AS sales,
         COALESCE(SUM(oi.price * oi.quantity), 0)                           AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    -- 护栏口径与 fn_merchant_analytics / stores 表 RLS 保持一致：owner ∪ 活跃 staff ∪ admin
    AND (p_store_id = ANY(public.fn_my_store_ids(auth.uid())) OR public.is_admin())
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_id::uuid
$$;

GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_merchant_product_sales(uuid)
  IS '按门店聚合每款商品的销量(sales)与营收(revenue)，已支付口径；护栏口径 = fn_my_store_ids(auth.uid()) ∪ is_admin()';

COMMIT;
