-- ============================================
-- 红包现金发放记录表（来店有喜）
-- 执行日期：2026-07-07
-- 用途：领取 redpacket 类活动后，将"真实现金发放到微信零钱"
--       的全过程记录下来，便于审计、对账与失败重试。
-- 发放通道：微信支付 v3「商家转账到零钱」
--         （transfer-to-balance，复用现有 MERCHANT_ID 等 v3 密钥）
-- 状态机：
--   pending_manual → 框架待启用（未开启真发钱，仅记录）
--   processing     → 已提交微信，受理中
--   success        → 微信已受理（异步到账）
--   failed         → 调用失败（记录 error_msg，可人工/批量重试）
-- ============================================

CREATE TABLE IF NOT EXISTS public.redpacket_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id integer NOT NULL,
  claim_id uuid,                       -- 关联 user_campaign_claims.id（若有）
  openid text,                         -- 发放目标 openid（profiles.openid）
  amount_fen integer NOT NULL,         -- 发放金额，单位：分
  status text NOT NULL DEFAULT 'pending_manual'
    CHECK (status IN ('pending_manual','processing','success','failed')),
  wx_out_bill_no text,                 -- 商户侧唯一单号
  wx_transfer_bill_no text,            -- 微信侧单号
  error_msg text,                      -- 失败原因
  paid_at timestamptz,                 -- 实际受理/到账时间
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rp_user ON public.redpacket_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_rp_campaign ON public.redpacket_payouts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rp_status ON public.redpacket_payouts(status);

-- 测试期关闭 RLS（与项目其余表一致）
ALTER TABLE public.redpacket_payouts DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.redpacket_payouts IS '红包现金发放记录（微信转账到零钱）';
COMMENT ON COLUMN public.redpacket_payouts.amount_fen IS '发放金额，单位分（gift_value元 × 100）';
COMMENT ON COLUMN public.redpacket_payouts.status IS 'pending_manual=待启用/processing=受理中/success=已受理/failed=失败';
