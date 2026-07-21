-- 20260720_order_item_commissions_refund.sql
-- 退款按商品回退分佣（#48）：在 order_item_commissions 上记录累计退款比例，
-- 使「Σ 各行净留存 = (1 - refund_ratio) × 原佣金」，与 commissions 表余额回冲（按订单 ratio）口径一致。
-- 退款不修改原始 l1_commission/l2_commission/buyer_points（保留审计），仅在展示层按 refund_ratio 折净。
ALTER TABLE public.order_item_commissions
  ADD COLUMN IF NOT EXISTS refund_ratio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

COMMENT ON COLUMN public.order_item_commissions.refund_ratio
  IS '累计退款比例(0~1)，按订单退款比例累加，封顶 1；展示净留存 = 原佣金 × (1 - refund_ratio)';
COMMENT ON COLUMN public.order_item_commissions.refunded_at
  IS '最近一次退款回冲时间（无退款则为 NULL）';

-- 便于按退款状态筛选（refund_ratio > 0 即发生过回冲）
CREATE INDEX IF NOT EXISTS idx_oic_refund_ratio
  ON public.order_item_commissions (order_id, refund_ratio);
