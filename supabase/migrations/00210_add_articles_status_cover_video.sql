-- 00210: 为 articles 补齐 status / cover_image / video_url 列
-- 背景：前端 Article 类型与创作页(createArticle/updateArticle/getMyArticles)均依赖这三个字段，
--       但初始建表(00001)仅有 is_published，00034 仅补了 view_count/share_count。
--       代码(api.ts)已做兼容：扩展列缺失时(错误码 42703 / "does not exist")自动降级为仅 is_published，
--       因此本迁移部署前后保存功能均可用；部署后封面图/视频可正常持久化。
--       幂等：全部使用 IF NOT EXISTS。

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published')),
  ADD COLUMN IF NOT EXISTS cover_image text,
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN public.articles.status IS '草稿/已发布，与 is_published 同步';
COMMENT ON COLUMN public.articles.cover_image IS '封面图 URL（可选）';
COMMENT ON COLUMN public.articles.video_url IS '视频地址（可选）';

-- 历史数据：依据 is_published 回填 status，使草稿/发布语义与既有数据一致
UPDATE public.articles
SET status = CASE WHEN is_published THEN 'published' ELSE 'draft' END;
