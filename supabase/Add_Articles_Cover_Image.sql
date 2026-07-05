-- ============================================
-- 为 articles 表添加 cover_image 字段
-- ============================================

-- 1. 添加 cover_image 字段（如果不存在）
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS cover_image TEXT;

-- 2. 验证字段是否添加成功
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'articles' 
  AND column_name = 'cover_image';

-- 3. 刷新 Supabase schema cache（重要！）
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 如果上面 NOTIFY 不生效，请在 Supabase Dashboard 中手动操作：
-- 1. 进入 Database → Extensions
-- 2. 找到 "pg_net" 扩展，禁用再启用
-- 或者：
-- 在 SQL Editor 中执行：SELECT pg_notify('pgrst', 'reload schema');
-- ============================================

-- 验证：查看 articles 表所有字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'articles' 
ORDER BY ordinal_position;
