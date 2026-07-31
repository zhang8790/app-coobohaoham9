-- =============================================================
-- 00136 推广佣金 50/50 拆分（一半可提现佣金 + 一半健康豆）+ 现金账户流水 ledger
-- =============================================================
-- 背景（2026-07-29 业务决策「一半佣金，一半健康豆」）：
--   推广收益净额 50% 发放至【可提现佣金账户 commission_balance】（推广服务费，依法代扣个税），
--   50% 发放至【健康豆账户 tb_balance】（仅本平台消费抵扣、不可提现）。
--   此前 2026-07-19 决策为 100% 进 tb_balance，现回拨一半为可提现现金。
--
-- 必要性：
--   ① commissions 需记录每笔佣金的 cash/bean 拆分，使退款能按比例双账户回滚、避免资损；
--   ② 可提现现金账户(commission_balance)必须有独立流水 ledger（与 tb_balance 的 tongbao_logs 对等），
--      否则现金账说不清、合规审计无法通过。
--
-- 执行方式：Supabase → SQL Editor 粘贴 → Run（纯 SQL，幂等）。
-- 配套代码：supabase/functions/distribute-commission（发放）、refund-order（回滚）、提现流程。
-- =============================================================

BEGIN;

-- 1. commissions 记录每笔佣金的现金/健康豆拆分
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS cash_portion numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bean_portion numeric(12,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commissions.cash_portion IS '本笔佣金净额中发放至可提现佣金账户(commission_balance)的部分';
COMMENT ON COLUMN public.commissions.bean_portion IS '本笔佣金净额中发放至健康豆账户(tb_balance)的部分';

-- 2. 可提现佣金账户流水（现金账户必须有账，合规/防资损）
CREATE TABLE IF NOT EXISTS public.commission_balance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid,
  commission_id uuid,
  type text NOT NULL,
  delta numeric(12,4) NOT NULL,
  balance_after numeric(12,4) NOT NULL,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cbl_user ON public.commission_balance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cbl_order ON public.commission_balance_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_cbl_commission ON public.commission_balance_logs(commission_id);

ALTER TABLE public.commission_balance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_balance_logs_owner_read" ON public.commission_balance_logs;
CREATE POLICY "commission_balance_logs_owner_read" ON public.commission_balance_logs
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;
