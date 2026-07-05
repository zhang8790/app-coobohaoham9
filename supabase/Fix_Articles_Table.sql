-- ============================================
-- 修复 articles 表结构：添加缺失字段
-- ============================================

-- 1️⃣ 先查看当前 articles 表有哪些字段
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'articles'
ORDER BY ordinal_position;

-- 2️⃣ 添加缺失的字段（IF NOT EXISTS 避免重复）

ALTER TABLE articles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;

-- 3️⃣ 刷新 PostgREST schema cache（关键！）
NOTIFY pgrst, 'reload schema';

-- 4️⃣ 再次验证，确认字段都存在
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'articles'
ORDER BY ordinal_position;
