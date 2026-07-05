-- 00034_articles_add_view_share_count.sql
-- 为 articles 表添加浏览量和分享数统计字段

ALTER TABLE articles ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

-- 关闭 RLS（测试阶段）
ALTER TABLE articles DISABLE ROW LEVEL SECURITY;
