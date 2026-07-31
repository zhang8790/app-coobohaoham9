-- 00221 商品销量字段：统一三端销量展示数据源
-- 口径对齐商家端 REVENUE_STATUSES：已支付（pending_ship/pending_receive/pending_pickup/pending_review/completed）
-- 销量 = 已支付订单 order_items.quantity 之和（累计售出，退款不回扣，符合主流电商「已售」语义）

-- 1) 新增销量列
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.products.sales_count IS '商品累计销量（件），已支付订单累加，退款不回扣';

-- 2) 原子累加 RPC（供 Edge Function 在「已支付」时机调用，避免并发竞态）
CREATE OR REPLACE FUNCTION public.fn_add_sales(p_id text, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;
  UPDATE public.products
     SET sales_count = sales_count + p_qty
   WHERE id::text = p_id;
END;
$$;
COMMENT ON FUNCTION public.fn_add_sales(text, integer) IS '原子累加商品销量，供支付成功/纯金豆下单时调用';

-- 3) 历史回填：已支付订单的 order_items 聚合写入 sales_count
--    （未出现在有效订单中的商品保持默认 0，无需处理）
UPDATE public.products p
   SET sales_count = COALESCE(agg.s, 0)
  FROM (
        SELECT oi.product_id, SUM(oi.quantity) AS s
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
         WHERE o.status IN ('pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed')
         GROUP BY oi.product_id
       ) agg
 WHERE p.id::text = agg.product_id;
