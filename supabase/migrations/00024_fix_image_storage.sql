-- ============================================================
-- 00024_fix_image_storage.sql — 图片存储桶 + 诊断查询
-- ⚠️ 必须在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- =====================
-- 第1步：创建/确认 images 存储桶（公开读取）
-- =====================
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 验证存储桶
SELECT id, name, public, created_at FROM storage.buckets WHERE name = 'images';


-- =====================
-- 第2步：Storage RLS 策略（DROP + CREATE）
-- 注意：PostgreSQL 不支持 CREATE POLICY IF NOT EXISTS，必须先 DROP
-- =====================

-- 公开读取（所有人都能看到图片）
DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
CREATE POLICY "images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

-- 登录用户可以上传
DROP POLICY IF EXISTS "images_auth_upload" ON storage.objects;
CREATE POLICY "images_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');

-- 登录用户可以更新自己的文件
DROP POLICY IF EXISTS "images_auth_update_own" ON storage.objects;
CREATE POLICY "images_auth_update_own" ON storage.objects
  FOR UPDATE USING (bucket_id = 'images' AND auth.uid() = owner);

-- 登录用户可以删除自己的文件
DROP POLICY IF EXISTS "images_auth_delete_own" ON storage.objects;
CREATE POLICY "images_auth_delete_own" ON storage.objects
  FOR DELETE USING (bucket_id = 'images' AND auth.uid() = owner);


-- =====================
-- 第3步：🔍 诊断查询 — 查看当前店铺图片数据
-- =====================
SELECT
  id,
  name,
  image_url,
  banner_url,
  CASE WHEN image_url IS NULL OR image_url = '' THEN '❌ image_url 为空'
       WHEN image_url LIKE '%wxfile://%' THEN '❌ 本地路径(无效)'
       WHEN image_url LIKE '%http://tmp%' THEN '❌ 临时路径(无效)'
       WHEN image_url LIKE '%data:%' THEN '❌ Base64(微信不支持)'
       ELSE '✅ 看起来正常' END AS image_status,
  CASE WHEN banner_url IS NULL OR banner_url = '' THEN '❌ banner_url 为空'
       WHEN banner_url LIKE '%wxfile://%' THEN '❌ 本地路径(无效)'
       WHEN banner_url LIKE '%http://tmp%' THEN '❌ 临时路径(无效)'
       WHEN banner_url LIKE '%data:%' THEN '❌ Base64(微信不支持)'
       ELSE '✅ 看起来正常' END AS banner_status,
  length(image_url) as img_len,
  length(banner_url) as ban_len
FROM stores
WHERE name = '横笼铺';


-- =====================
-- 第4步：查看 Storage 里已有的图片文件（如果有）
-- =====================
-- SELECT id, bucket_id, name, created_at, owner
-- FROM storage.objects
-- WHERE bucket_id = 'images'
-- ORDER BY created_at DESC
-- LIMIT 10;


-- =====================
-- 第5步：（可选）给测试店铺设置一张默认图
-- 取消注释下面这行即可用随机占位图测试
-- =====================
-- UPDATE stores
-- SET banner_url = 'https://picsum.photos/seed/henglongpu-banner/800/400',
--     image_url = 'https://picsum.photos/seed/henglongpu-logo/400/400'
-- WHERE name = '横笼铺'
-- RETURNING id, name, image_url, banner_url;
