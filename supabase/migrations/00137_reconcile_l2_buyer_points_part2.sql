-- 00137_part2: 回写 orders 字段 + 补 buyer_points 积分日志
-- 前置：已执行 00137_part1 并重新调用 distribute-commission v5 EF 完成分佣

BEGIN;

-- 1) 从 commissions 聚合回写订单字段
--    platform_income = 让利池 - L1 - L2 - 买家确权积分（与 v5 算法一致）
WITH agg AS (
  SELECT
    order_id,
    SUM(CASE WHEN level = 1 THEN commission_amount ELSE 0 END) AS l1,
    SUM(CASE WHEN level = 2 THEN commission_amount ELSE 0 END) AS l2,
    MAX(pool_amount) AS pool
  FROM public.commissions
  WHERE order_id IN (
    '322d436a-a1c7-4919-8e08-1f5424e95043',
    '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
  )
  GROUP BY order_id
)
UPDATE public.orders o
SET
  l1_commission = agg.l1,
  l2_commission = agg.l2,
  buyer_points = 1,
  platform_income = ROUND((agg.pool - agg.l1 - agg.l2 - 1)::numeric, 2)
FROM agg
WHERE o.id = agg.order_id;

-- 2) 补买家确权积分日志（points_logs 实际列：user_id, amount, type, source, related_order_id）
INSERT INTO public.points_logs (user_id, amount, type, source, related_order_id, created_at)
VALUES
  ('99f02c72-b238-4f76-8817-73b2848d8d65', 1, 'purchase_earn', 'order_commission', '322d436a-a1c7-4919-8e08-1f5424e95043', now()),
  ('99f02c72-b238-4f76-8817-73b2848d8d65', 1, 'purchase_earn', 'order_commission', '2eefcdee-919b-4eb0-95ce-1a4cf72dc141', now());

-- 3) 买家积分加 2
UPDATE public.profiles
SET points = points + 2
WHERE id = '99f02c72-b238-4f76-8817-73b2848d8d65';

COMMIT;
