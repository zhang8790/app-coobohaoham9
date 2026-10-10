-- 2026-10-10 清理线上孤儿表
-- 依据：4 个表均为空表（0 行）、零代码引用（src/admin-web/mobile-app/supabase/functions 全仓 grep 0 命中）、
--       零入站外键、零视图/函数依赖（pg_depend deptype='n' 为空）、零触发器。删除零风险。
-- 已在线执行（supabase db query --linked）。本文件仅作历史记录，避免重复执行请确认表已不存在。
DROP TABLE IF EXISTS public.health_reports;
DROP TABLE IF EXISTS public.intake_logs;
DROP TABLE IF EXISTS public.inventories;
DROP TABLE IF EXISTS public.user_mood_preferences;
