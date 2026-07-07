-- ============================================
-- 00047 加固 redpacket_payouts：受理中间态 + 防重复唯一约束
-- 执行日期：2026-07-07
-- 目的：
--   1) 新增 accepted 中间态：微信「商家转账到零钱」返回 200 = 受理成功（异步到账），
--      不能立刻标 success，需先置 accepted，待对账/回调确认后再翻 success（防资损）。
--   2) 新增 UNIQUE(user_id, campaign_id)：兜底并发重复发放（函数内已做 SELECT 预查，
--      该约束是最后一道防线，确保绝不会因网络重试/连点产生两条发放记录）。
-- ============================================

-- 1. 扩展 status 校验，纳入 accepted
ALTER TABLE public.redpacket_payouts
  DROP CONSTRAINT IF EXISTS redpacket_payouts_status_check;
ALTER TABLE public.redpacket_payouts
  ADD CONSTRAINT redpacket_payouts_status_check
  CHECK (status IN ('pending_manual', 'processing', 'accepted', 'success', 'failed'));

-- 2. 防重复唯一约束（同一用户+同一活动仅一条发放记录）
ALTER TABLE public.redpacket_payouts
  DROP CONSTRAINT IF EXISTS redpacket_payouts_user_campaign_uniq;
ALTER TABLE public.redpacket_payouts
  ADD CONSTRAINT redpacket_payouts_user_campaign_uniq UNIQUE (user_id, campaign_id);

COMMENT ON COLUMN public.redpacket_payouts.status IS
  'pending_manual=待启用/processing=受理中/accepted=微信已受理(异步到账)/success=已确认到账/failed=失败';

SELECT 'redpacket_payouts 已加固（accepted 中间态 + 唯一约束）' AS result;
