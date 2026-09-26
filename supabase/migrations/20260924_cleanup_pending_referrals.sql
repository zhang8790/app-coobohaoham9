-- 清理 pending_referrals 冗余数据（B1-d）
-- 2026-09-24
--
-- 背景：扫码锁客记录（pending_referrals）仅在「注册」路径会经 RPC
--       convert_pending_referral 转化；纯登录不注册的用户会留下永久
--       pending 行，且仅有 30 天 expires_at 标记、无任务删除，长期堆积。
-- 本迁移一次性清理历史冗余，逻辑幂等（可重复执行，无副作用）。
--
-- 执行方式：在 Supabase 后台 SQL Editor 运行本文件；或下次 supabase db push
--           随迁移自动执行。删除 converted/expired 行安全，因其关系已落到
--           user_store_relation / commissions，pending 表仅作过渡。

-- 1. 把已过期仍未转化的 pending 标记为 expired（保留可追溯）
UPDATE pending_referrals
SET status = 'expired', updated_at = now()
WHERE status = 'pending'
  AND expires_at < now();

-- 2. 删除已转化 / 已过期记录（过渡数据，无需长期保留）
DELETE FROM pending_referrals
WHERE status IN ('converted', 'expired');

-- 3. 同设备去重：同一 device_id 有多条 pending 时仅保留最新一条（created_at 最大）
DELETE FROM pending_referrals a
USING pending_referrals b
WHERE a.device_id = b.device_id
  AND a.device_id IS NOT NULL
  AND a.status = 'pending'
  AND b.status = 'pending'
  AND a.created_at < b.created_at;

-- 4. 兜底：device_id 为空的孤立 pending（无设备归属，无法转化）一并清理
DELETE FROM pending_referrals
WHERE status = 'pending'
  AND device_id IS NULL;

-- 注：如需常态化自动清理，建议 Supabase 后台启用 pg_cron 扩展并定时执行
--     上述 UPDATE + DELETE（例如每 7 天一次），避免未来再次堆积。
