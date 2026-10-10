-- 20260720_add_order_item_commissions.sql
-- 商品级分佣结算表：每个 order_item 独立记录让利池、L1/L2/买家积分/平台收益，便于追溯与展示。
-- 与现有 orders（汇总）形成 1:N 关系：orders 的 l1/l2/buyer_points/platform_income = SUM(order_item_commissions.*)。
-- 幂等：同一 order_item 只结算一次（UNIQUE(order_item_id)）。

CREATE TABLE IF NOT EXISTS public.order_item_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  product_id text,                 -- order_items.product_id 为 text，非外键，故存原文
  product_name text,
  price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  item_total numeric NOT NULL DEFAULT 0,            -- price * quantity
  product_discount_rate numeric NOT NULL DEFAULT 0, -- 商品自身让利率（如 0.12）
  effective_rate numeric NOT NULL DEFAULT 0,        -- 实际用于该商品的分佣率（当前=商品自身率；未来可支持活动券叠加）
  discount_amount numeric NOT NULL DEFAULT 0,       -- 该商品让利金额 = item_total * effective_rate
  discount_pool numeric NOT NULL DEFAULT 0,         -- 分佣池 = discount_amount
  commission_pool numeric NOT NULL DEFAULT 0,       -- 可分佣池 = discount_pool * 0.90

  l1_user_id uuid,
  l1_rank text,
  l1_ratio numeric,
  l1_active_mult numeric DEFAULT 1,
  l1_recruit_mult numeric DEFAULT 1,
  l1_gross numeric DEFAULT 0,                      -- 缩放前
  l1_commission numeric DEFAULT 0,                 -- 缩放后 / 实际发放

  l2_user_id uuid,
  l2_rank text,
  l2_ratio numeric,
  l2_active_mult numeric DEFAULT 1,
  l2_recruit_mult numeric DEFAULT 1,
  l2_gross numeric DEFAULT 0,
  l2_commission numeric DEFAULT 0,

  buyer_points numeric DEFAULT 0,                  -- 该商品产生的买家确权积分
  platform_income numeric DEFAULT 0,               -- 该商品的平台保底收益

  commission_distributed boolean DEFAULT false,
  distributed_at timestamptz,
  created_at timestamptz DEFAULT now(),

  UNIQUE(order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_oic_order_id ON public.order_item_commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_oic_order_item_id ON public.order_item_commissions(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oic_commission_distributed ON public.order_item_commissions(commission_distributed);
CREATE INDEX IF NOT EXISTS idx_oic_product_id ON public.order_item_commissions(product_id);
