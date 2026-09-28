-- 2026-09-28 数据库清理：删除已废弃的 user_staff_bindings 表
-- 依据：supabase/functions/cleanup/01_add_table_comments_and_check_redundant.sql
--       标注其「已被 store_staff 替代，未使用」。线上已执行 DROP（0 行 / 0 外键 / 0 对象依赖 / 0 触发器 / 0 RLS）。
-- 补此迁移保持本地迁移链与线上库一致（否则 db reset / 新环境会按历史迁移重建该表）。
-- 幂等：IF EXISTS 避免重复执行报错。
DROP TABLE IF EXISTS user_staff_bindings;
