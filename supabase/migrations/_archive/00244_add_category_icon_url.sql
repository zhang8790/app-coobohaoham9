-- 2026-10-10 分类图标支持图片上传（大厂级分类体系）
-- 新增 icon_url（图片 URL）列；保留 icon（emoji 文本）作为回退。
-- 已在线执行（supabase db query --linked）。本文件仅作历史记录。
ALTER TABLE public.store_categories ADD COLUMN IF NOT EXISTS icon_url text;
COMMENT ON COLUMN public.store_categories.icon_url IS '分类图标图片 URL（用户上传），为空时回退 icon(emoji) 或品牌 SVG';
