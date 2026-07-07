-- 00049  创建 videos 存储桶 + 访问策略（修复商品视频上传失败）
-- ------------------------------------------------------------
-- 根因：src/utils/upload.ts 的 uploadVideo() 默认写入 'videos' 桶，
--       但此前迁移只建了 'images' 桶，'videos' 桶从未创建，
--       导致视频上传直接报「存储桶不存在」。
--
-- 本迁移补齐 videos 桶（公开读取），并预建 RLS 策略（测试期 RLS 已关闭，
-- 上线开启 RLS 后策略自动生效）。幂等可重复执行。

-- 1. 创建 videos 桶（公开读取）
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 公开读取策略
DROP POLICY IF EXISTS "videos_public_read" ON storage.objects;
CREATE POLICY "videos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

-- 3. 登录用户可写（与 images 桶策略保持一致）
DROP POLICY IF EXISTS "videos_auth_insert" ON storage.objects;
CREATE POLICY "videos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "videos_auth_update" ON storage.objects;
CREATE POLICY "videos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'videos' AND auth.uid() = owner);

DROP POLICY IF EXISTS "videos_auth_delete" ON storage.objects;
CREATE POLICY "videos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'videos' AND auth.uid() = owner);

-- 提示：视频单文件可能超过 Supabase 默认 50MB 上限，
-- 请在 Supabase 控制台 Storage → videos 桶 → 修改「文件大小上限」为 200MB（或按需调整）。

SELECT '✅ videos 存储桶已就绪' AS result;
