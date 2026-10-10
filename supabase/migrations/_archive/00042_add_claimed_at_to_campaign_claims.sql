-- ============================================
-- 补齐 user_campaign_claims.claimed_at 列
-- 执行日期：2026-07-07
-- 背景：claim_campaign 函数与前端类型 UserCampaignClaim 均使用
--       claimed_at 字段，但云端建表时误落成 created_at，
--       导致函数 INSERT 报 "column claimed_at does not exist"。
--       此处幂等补齐，确保函数/前端/表结构一致。
-- ============================================

ALTER TABLE public.user_campaign_claims
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.user_campaign_claims.claimed_at
  IS '领取时间（与 created_at 并存，函数与前端均读此列）';

-- 验证列已存在
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_campaign_claims'
  AND column_name = 'claimed_at';
