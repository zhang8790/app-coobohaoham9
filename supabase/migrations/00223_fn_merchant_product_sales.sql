-- 00223 商家商品收益聚合 RPC
-- 背景：商品管理页（小程序商家端 merchant-products）原本一次性拉取最多 1 万条 order_items
--       到客户端，用 forEach 聚合每款商品的销量与营收——这是自营管理中心最大的卡顿源。
-- 做法：直接在数据库内按 store_id 聚合，返回极小结果集（每款在售商品一行），
--       前端只需一次轻量 RPC 调用即可拿到收益面板数据。
-- 口径：销量/营收仅计入已支付订单（pending_ship/pending_receive/pending_pickup/pending_review/completed），
--       与商家端 REVENUE_STATUSES、数据分析页、商品销量触发器(00221/00222)保持一致。
-- 注意：order_items.store_id 实际为 text 类型，函数入参仍保持 uuid（与 stores.id / orders.store_id 一致），
--       查询时显式 cast 避免 42883 类型不匹配错误。

CREATE OR REPLACE FUNCTION public.fn_merchant_product_sales(p_store_id uuid)
RETURNS TABLE (product_id uuid, sales bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id::uuid                                                 AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint                                  AS sales,
         COALESCE(SUM(oi.price * oi.quantity), 0)                              AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    -- 安全护栏：仅允许聚合当前登录商家自己拥有的门店，防止越权读取他人销售数据
    AND oi.store_id::uuid IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_id::uuid
$$;

COMMENT ON FUNCTION public.fn_merchant_product_sales(uuid)
  IS '按门店聚合每款商品的销量(sales)与营收(revenue)，已支付口径；供商家商品管理页收益面板，替代万级 order_items 客户端聚合';
