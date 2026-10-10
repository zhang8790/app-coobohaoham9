
-- 退款状态枚举
DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('pending_review','processing','completed','closed','abnormal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 退款记录表
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_no text UNIQUE,                                  -- 退款单号（审核通过后生成）
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_no text NOT NULL,
  item_index int NOT NULL DEFAULT 0,                      -- 退款商品 items 数组索引（0=整单）
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  initiated_by text NOT NULL DEFAULT 'user'
    CHECK (initiated_by IN ('user','admin')),
  status refund_status NOT NULL DEFAULT 'pending_review',
  refund_quantity int NOT NULL DEFAULT 1,
  refund_amount numeric(12,4) NOT NULL,
  reason text,
  description text,
  wechat_refund_id text,
  version int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_insert_own_refund" ON public.refunds
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_read_own_refunds" ON public.refunds
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "service_all_refunds" ON public.refunds
  FOR ALL TO service_role USING (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON public.refunds(user_id);

-- RPC：获取订单某商品可退金额
CREATE OR REPLACE FUNCTION get_refundable_amount(p_order_id uuid, p_item_index int)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_subtotal numeric;
  v_refunded numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- p_item_index = -1 表示整单
  IF p_item_index < 0 THEN
    v_subtotal := v_order.total_amount;
    v_refunded := COALESCE(v_order.refunded_amount, 0);
  ELSE
    v_item := (v_order.items->p_item_index);
    v_subtotal := COALESCE((v_item->>'subtotal')::numeric, 0);
    v_refunded := COALESCE((v_item->>'refunded_amount')::numeric, 0);
  END IF;

  RETURN GREATEST(v_subtotal - v_refunded, 0);
END;
$$;

-- RPC：更新订单已退金额（由 service_role 调用）
CREATE OR REPLACE FUNCTION update_order_refunded_amount(p_order_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.orders
  SET refunded_amount = COALESCE(refunded_amount, 0) + p_amount,
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;
