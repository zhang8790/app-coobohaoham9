-- 修复 orders.payment_method 枚举类型问题
-- 执行方式：在 Supabase Dashboard > SQL Editor 中执行

-- 1. 查看当前 payment_method 的枚举值
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'payment_method';

-- 2. 如果 payment_method 是枚举类型，先删除约束，改为 VARCHAR
-- 先查看枚举类型名称
SELECT pg_type.typname, pg_enum.enumlabel
FROM pg_type
JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname LIKE '%payment%';

-- 3. 安全修复：把 payment_method 改成 VARCHAR(50)
-- 先备份数据（如果有）
-- CREATE TABLE orders_backup AS SELECT * FROM orders;

-- 4. 修改字段类型（如果当前是枚举）
ALTER TABLE orders 
ALTER COLUMN payment_method TYPE VARCHAR(50) 
USING payment_method::VARCHAR(50);

-- 5. 添加检查约束（可选，保证数据完整性）
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders 
ADD CONSTRAINT orders_payment_method_check 
CHECK (payment_method IN ('wxpay', 'pure_gold', 'hybrid', 'gold_beans', 'cod'));

-- 6. 验证修改结果
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'payment_method';

-- 7. 查看现有数据
SELECT DISTINCT payment_method FROM orders;
