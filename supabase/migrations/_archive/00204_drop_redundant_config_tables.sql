-- 2026-09-28 数据库清理：删除三张已废弃/冗余的表
-- 依据：
--   1. supabase/functions/cleanup/01_add_table_comments_and_check_redundant.sql 标注
--      rank_configs / platform_configs / self_operated_stores 为「未使用 / 被替代 / 硬编码」。
--   2. migrations/00037_cleanup_unused_tables.sql 已计划 DROP（CASCADE）但未在本库执行。
--   3. 运行期代码（前端 + Edge Functions）零引用；生产 RLS 脚本 00081 / 00095 使用
--      FOREACH + to_regclass 存在性检查循环，删表后自动 CONTINUE，不影响迁移可重放性。
--   4. self_operated_stores 是早期 INT 主键废弃设计，00046 已断开指向它的错误外键。
-- 幂等 + CASCADE：连带清理其 RLS 策略（rls81_*）与任何残留依赖。
DROP TABLE IF EXISTS rank_configs CASCADE;
DROP TABLE IF EXISTS platform_configs CASCADE;
DROP TABLE IF EXISTS self_operated_stores CASCADE;
