-- 00049 移除「团队业绩」字段（用户要求：所有字段不能出现团队业绩）
-- 执行时间：2026-07-07
--
-- 变更内容：
-- 1. 删除 profiles.team_performance 列
--    （get_rank_progress 的 JSONB 化已在 00106 收口，本迁移不再重复定义该函数，避免多重定义冗余）

-- 删除列（幂等）
ALTER TABLE profiles DROP COLUMN IF EXISTS team_performance;
