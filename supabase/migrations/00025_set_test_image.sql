-- ============================================================
-- 快速验证：给横笼铺写入测试图片 URL
-- 执行完后去店铺首页看是否显示图片
-- ============================================================

UPDATE stores
SET
  banner_url = 'https://picsum.photos/seed/henglongpu-banner/800/400',
  image_url = 'https://picsum.photos/seed/henglongpu-logo/400/400'
WHERE name = '横笼铺'
RETURNING id, name, image_url, banner_url;
