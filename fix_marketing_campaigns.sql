-- ============================================================
-- 修复 marketing_campaigns 表结构
-- 问题：store_id 是 integer 类型，但 stores.id 是 UUID (text)
-- 导致查询时报错：invalid input syntax for type integer
-- ============================================================

-- 1. 禁用 RLS（避免权限问题）
ALTER TABLE marketing_campaigns DISABLE ROW LEVEL SECURITY;

-- 2. 删除错误的 store_id 列（integer 类型）
ALTER TABLE marketing_campaigns DROP COLUMN IF EXISTS store_id;

-- 3. 重新添加正确类型的 store_id 列（text = UUID）
ALTER TABLE marketing_campaigns ADD COLUMN store_id text;

-- 4. 可选：添加外键约束
-- ALTER TABLE marketing_campaigns 
-- ADD CONSTRAINT marketing_campaigns_store_id_fkey 
-- FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;

-- 5. 验证修改结果
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'marketing_campaigns' 
ORDER BY ordinal_position;

-- 6. 测试查询（应该不再报错）
-- SELECT * FROM marketing_campaigns WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d';
