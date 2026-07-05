-- 数据库诊断 SQL：在 Supabase SQL Editor 中执行
-- 执行后把结果截图或复制给我

-- 1. 查看 orders.payment_method 枚举值
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (
  SELECT oid FROM pg_type 
  WHERE typname = 'payment_method' 
  AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
);

-- 2. 查看 profiles 表所有字段
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 3. 查看 points_logs 表是否存在
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'points_logs'
);

-- 4. 查看 order_items 表结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'order_items' 
ORDER BY ordinal_position;

-- 5. 查看 footprints 表结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'footprints' 
ORDER BY ordinal_position;

-- 6. 查看 orders 表完整结构
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;
