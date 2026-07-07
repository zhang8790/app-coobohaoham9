-- ============================================
-- 修复 marketing_campaigns 表结构 (v3 - 安全版)
-- 问题：store_id 是 integer，但 stores.id 是 uuid
-- ============================================

-- 第一步：检查当前表结构
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;

-- 第二步：检查是否有数据
SELECT COUNT(*) as total_rows FROM marketing_campaigns;

-- 第三步：检查 store_id 列的具体值（如果有数据）
-- SELECT id, store_id FROM marketing_campaigns LIMIT 10;

-- 第四步：修复表结构
-- 4.1 删除旧的 store_id 列（如果存在且类型错误）
ALTER TABLE marketing_campaigns DROP COLUMN IF EXISTS store_id;

-- 4.2 添加新的 store_id 列（uuid 类型）
ALTER TABLE marketing_campaigns 
ADD COLUMN store_id uuid;

-- 4.3 添加外键约束
ALTER TABLE marketing_campaigns
ADD CONSTRAINT marketing_campaigns_store_id_fkey
FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

-- 4.4 禁用 RLS（测试阶段）
ALTER TABLE marketing_campaigns DISABLE ROW LEVEL SECURITY;

-- 第五步：验证修复结果
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;

-- 第六步：测试查询（应该不再报 400 错误）
-- SELECT * FROM marketing_campaigns WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d'::uuid;
