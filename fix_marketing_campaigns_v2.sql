-- ============================================
-- 修复 marketing_campaigns 表结构 (v2)
-- 问题：store_id 是 integer，但 stores.id 是 uuid
-- ============================================

-- 1. 先查看当前表结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;

-- 2. 删除错误的 store_id 列（integer 类型）
ALTER TABLE marketing_campaigns DROP COLUMN IF EXISTS store_id;

-- 3. 添加正确类型的 store_id (uuid)
ALTER TABLE marketing_campaigns
ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;

-- 4. 禁用 RLS（测试阶段）
ALTER TABLE marketing_campaigns DISABLE ROW LEVEL SECURITY;

-- 5. 验证修复结果
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;

-- 6. 测试查询（应该不再报 400 错误）
-- SELECT * FROM marketing_campaigns WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d';
