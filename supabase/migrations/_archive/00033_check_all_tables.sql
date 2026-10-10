-- ============================================================
-- 检查所有需要的表是否存在，以及字段是否完整
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 查看所有已存在的表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. 查看 refunds 表结构（确认是否存在）
SELECT 
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'refunds' 
ORDER BY ordinal_position;

-- 3. 查看 orders 表结构
SELECT 
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- 4. 查看 commissions 表结构
SELECT 
  column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'commissions' 
ORDER BY ordinal_position;

-- 5. 查看 points_logs 表结构
SELECT 
  column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'points_logs' 
ORDER BY ordinal_position;
