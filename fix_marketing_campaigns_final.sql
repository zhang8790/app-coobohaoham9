-- ============================================
-- 修复 marketing_campaigns 表结构 (最终版)
-- 问题：表中没有 store_id 列，前端查询报错
-- ============================================

-- 1. 添加 store_id 列（uuid 类型）
ALTER TABLE marketing_campaigns 
ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;

-- 2. 禁用 RLS（测试阶段）
ALTER TABLE marketing_campaigns DISABLE ROW LEVEL SECURITY;

-- 3. 验证修复结果
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;

-- 4. 测试查询（应该成功）
-- SELECT * FROM marketing_campaigns WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d'::uuid;
