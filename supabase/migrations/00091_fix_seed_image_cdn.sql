-- 00091: 清理历史种子数据中的平台图床域名
-- 将已播种（00002）的 stores / products 图片从 miaoda-site-img.cdn.bcebos.com
-- 替换为中性图床 picsum.photos（按原 UUID 固定 seed，保证每个商品图稳定且不重复）。
-- 幂等：仅匹配旧域名行，重复执行无副作用。
-- 注意：沙箱无 supabase CLI，请在本地执行 `supabase db push` 或于 Dashboard SQL Editor 粘贴本文件。

UPDATE public.stores
SET image_url = regexp_replace(
  image_url,
  'https://miaoda-site-img\.cdn\.bcebos\.com/images/baidu_image_search_([0-9a-f-]+)\.jpg',
  'https://picsum.photos/seed/ldyx-\1/600/600'
)
WHERE image_url LIKE 'https://miaoda-site-img.cdn.bcebos.com/%';

UPDATE public.products
SET image_url = regexp_replace(
  image_url,
  'https://miaoda-site-img\.cdn\.bcebos\.com/images/baidu_image_search_([0-9a-f-]+)\.jpg',
  'https://picsum.photos/seed/ldyx-\1/600/600'
)
WHERE image_url LIKE 'https://miaoda-site-img.cdn.bcebos.com/%';
