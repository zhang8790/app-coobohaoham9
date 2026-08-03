-- ============================================================
-- 00226 · user_health_profile 增加 pref_tags（用户自选食疗标签库）
-- 执行：supabase db query --linked --file supabase/migrations/00226_user_pref_tags.sql
-- ============================================================
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS pref_tags text[] not null default '{}';
