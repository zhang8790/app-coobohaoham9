-- ============================================
-- 步骤5：禁用 RLS（测试阶段）
-- ============================================

ALTER TABLE public.cities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_operated_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_campaign_claims DISABLE ROW LEVEL SECURITY;

-- 验证表是否创建成功
SELECT 'cities表：' AS table_name, COUNT(*) AS row_count FROM public.cities
UNION ALL
SELECT 'self_operated_stores表：', COUNT(*) FROM public.self_operated_stores
UNION ALL
SELECT 'marketing_campaigns表：', COUNT(*) FROM public.marketing_campaigns;

SELECT '步骤5完成：RLS已禁用，所有表创建成功！' AS result;
