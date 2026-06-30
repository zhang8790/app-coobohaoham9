
-- 1. 补充 orders 表字段（支持金豆混合支付和分销关联）
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gold_beans_used numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS commission_distributed boolean NOT NULL DEFAULT false;

-- 2. 佣金记录表
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_no text NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES auth.users(id),
  payer_id uuid NOT NULL REFERENCES auth.users(id),
  level int NOT NULL CHECK (level IN (1, 2)),           -- 1=直推,2=间推
  rank_at_time text NOT NULL,                            -- 结算时段位快照
  ratio numeric(6,4) NOT NULL,                          -- 分佣比例快照
  pool_amount numeric(12,4) NOT NULL,                   -- 让利池金额
  commission_amount numeric(12,4) NOT NULL,             -- 实际佣金
  b_coef numeric(6,4) NOT NULL DEFAULT 1.0,             -- B系数（消费者活跃度）
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','settled','refunded')),
  settle_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. 积分流水表
CREATE TABLE IF NOT EXISTS public.points_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  order_id uuid REFERENCES public.orders(id),
  type text NOT NULL
    CHECK (type IN ('purchase_earn','invite_earn','checkin_earn','ugc_earn','redeem_spend','pay_spend','lottery_spend','refund_deduct')),
  delta int NOT NULL,             -- 正=增加，负=减少
  balance_after int NOT NULL,     -- 变动后余额（冗余，方便对账）
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RLS
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_logs ENABLE ROW LEVEL SECURITY;

-- commissions：本人可查自己收到的
CREATE POLICY "beneficiary_read_own_commissions" ON public.commissions
  FOR SELECT TO authenticated
  USING (beneficiary_id = auth.uid());

-- points_logs：本人可查自己的流水
CREATE POLICY "user_read_own_points_logs" ON public.points_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 仅 service_role 可写（Edge Function 操作）
CREATE POLICY "service_insert_commissions" ON public.commissions
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_update_commissions" ON public.commissions
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "service_insert_points_logs" ON public.points_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary ON public.commissions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order ON public.commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_points_logs_user ON public.points_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_points_logs_order ON public.points_logs(order_id);
