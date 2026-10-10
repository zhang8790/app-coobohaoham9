-- ============================================================
-- 00217: 智能换季提醒 · notifications.type 扩展 + 注册说明
-- ------------------------------------------------------------
-- 功能：节气切换前 3 天，向用户推一条站内通知（一键跳今日食养推荐）。
-- 实现：新增 Edge Function season-reminder（照 expiry-engine 范式，写 notifications 表）。
-- 调度：沿用项目惯例——Dashboard → Database → Scheduled Functions 挂「每日 08:00」，
--       不在本迁移硬编码 service_role key（安全：避免密钥落 SQL）。详见文末。
--
-- 执行方式：Supabase SQL Editor 全量粘贴运行；或 supabase db push。
-- 幂等：仅改注释 + 文档，重复执行无副作用。
-- ============================================================

-- ---------- 1. notifications.type 注释纳入 season_reminder ----------
-- type 为 text 无枚举，直接可用；此处仅更新注释保持文档同步
COMMENT ON COLUMN public.notifications.type IS
  'order_paid | commission_arrived | withdraw_progress | refund_result | announcement | expiry_alert | season_reminder';

COMMENT ON COLUMN public.notifications.payload IS
  '扩展字段：金额/订单号/跳转路径；season_reminder 时含 { term_key, term_name, nature, days_to_term, jump_page }';

-- ---------- 2. 去重索引（按 type + term_key + 时间，加速 season-reminder 幂等判断）----------
-- 已存在 idx_notifications_user_created；这里补一个「按 type + 时间」的轻量索引，便于查重扫表
CREATE INDEX IF NOT EXISTS idx_notifications_type_created
  ON public.notifications (type, created_at DESC);

-- ============================================================
-- 3. 定时任务注册（手动，二选一）
-- ============================================================
-- 方式 A（推荐，与 expiry-engine / auto-complete-orders 完全一致）：
--   Supabase Dashboard → Database → Scheduled Functions
--   → New scheduled function → 名称 season-reminder-daily
--   → 调度 cron `0 8 * * *`（每日 08:00）
--   → Function season-reminder → Create
--   Edge Function 已用 service_role 自管权限，无需额外密钥。
--
-- 方式 B（本机 cron，无 CLI 时）：
--   0 8 * * * curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/season-reminder \
--     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json"
--
-- 联调：?dryRun=1 预览不落库；?termKey=daxue 强制指定节气（如当前不在前3天窗口也能验证）。
-- 达峰保护：函数内按 (user_id, term_key) 7 天去重，每个节气每人至多 1 条；全量用户广播。
-- ============================================================
