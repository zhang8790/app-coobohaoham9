-- 给 articles 表添加 video_url 字段（用于存储视频链接）
-- 执行方式：在 Supabase Dashboard → SQL Editor 中运行此文件

ALTER TABLE public.articles
ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT NULL;

-- 添加注释
COMMENT ON COLUMN public.articles.video_url IS '视频链接（支持 mp4 直链或 B站/抖音等平台外链）';

-- 验证
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'articles' AND column_name = 'video_url';
