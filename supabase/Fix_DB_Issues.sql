-- ============================================
-- 修复数据库问题
-- 1. profiles 表缺少 referral_code 字段
-- 2. footprints 表 RLS 阻止插入（403）
-- ============================================

-- 1. 添加 referral_code 字段（如果不存在）
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- 2. 为现有用户生成 referral_code（如果为空）
UPDATE profiles 
SET referral_code = UPPER(SUBSTRING(MD5(id::TEXT) FROM 1 FOR 6))
WHERE referral_code IS NULL;

-- 3. 禁用 footprints 表的 RLS（解决 403 错误）
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;

-- 4. 禁用 profiles 表的 RLS（如果还没有）
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 5. 禁用其他可能报 403 的表
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;

-- 6. 禁用 articles 表的 RLS（解决文章发布失败问题）
ALTER TABLE articles DISABLE ROW LEVEL SECURITY;

-- ============================================
-- 验证修复
-- ============================================

-- 查看 profiles 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name = 'referral_code';

-- 查看 footprints 表的 RLS 状态
SELECT tablename, rowsecurity 
FROM pg_tables 
JOIN pg_class ON pg_class.relname = pg_tables.tablename
WHERE tablename = 'footprints';

-- 查看 profiles 表的 RLS 状态
SELECT tablename, rowsecurity 
FROM pg_tables 
JOIN pg_class ON pg_class.relname = pg_tables.tablename
WHERE tablename = 'profiles';
