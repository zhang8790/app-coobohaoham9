-- =============================================================
--  00035_add_commission_distributed_to_orders.sql
--  2026-07-05
--
--  功能：给 orders 表添加 commission_distributed 字段
--        用于幂等性保护，防止重复分佣
-- =============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_distributed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_points integer DEFAULT 0;

-- 索引（用于快速查询未分佣订单）
CREATE INDEX IF NOT EXISTS idx_orders_commission_distributed 
  ON public.orders(commission_distributed) 
  WHERE commission_distributed = false;

-- 注释
COMMENT ON COLUMN public.orders.commission_distributed IS '是否已分佣（防止重复分佣）';
COMMENT ON COLUMN public.orders.buyer_points IS '买家获得的积分';

-- RLS（测试阶段关闭）
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
