-- 00211: 为 articles 补齐 images 列
-- 背景：导入文章链接时后端会返回图片 URL 数组，前端的 createArticle/updateArticle
--       已尝试写入 images，但原 articles 表(00001)仅有 is_published，00210 仅补了
--       status/cover_image/video_url，缺 images 列 → 图片始终落不了库（代码已优雅降级忽略）。
--       补上该列后，导入图片 / 正文内联图片即可持久化并在详情页展示。

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

COMMENT ON COLUMN public.articles.images IS '图片 URL 数组（导入或正文内联图片）';

-- 同步更新 RLS：articles 既有策略(pub00034 等)已用 USING/ WITH CHECK 作用于整表，
-- 新增列自动纳入既有策略，无需单独补策略。
