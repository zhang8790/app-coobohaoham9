-- ============================================================
-- 00202_create_product_images_bucket.sql
-- 创建 product-images 存储桶（food-scan 拍照配料 OCR 用）
-- 根因：food-scan 拍照调用 uploadToStorage(bucket:'product-images')，
--       但该桶此前从未创建，导致上传报「存储桶不存在」。
-- 本迁移补齐 product-images 桶（公开读取）+ RLS 策略。幂等可重复执行。
-- ============================================================

-- 1. 创建 product-images 桶（公开读取）
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 公开读取策略（所有人可读取配料图片）
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- 3. 允许匿名与登录用户上传（C 端游客也可用拍照识别）
DROP POLICY IF EXISTS "product_images_anon_insert" ON storage.objects;
CREATE POLICY "product_images_anon_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'anon');

DROP POLICY IF EXISTS "product_images_auth_insert" ON storage.objects;
CREATE POLICY "product_images_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- 4. 登录用户可管理自己上传的文件
DROP POLICY IF EXISTS "product_images_auth_update" ON storage.objects;
CREATE POLICY "product_images_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "product_images_auth_delete" ON storage.objects;
CREATE POLICY "product_images_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.uid() = owner);

-- 提示：单张配料图通常 < 10MB，Supabase 默认 50MB 上限足够；
-- 如需调大，在 Supabase 控制台 Storage → product-images → 修改「文件大小上限」。

SELECT '✅ product-images 存储桶已就绪' AS result;
