-- 00224 确保二维码 Storage bucket 存在（幂等兜底）
-- 背景：generate-qrcode 函数历史上把门店/推广二维码上传到 bucket `二维码`，
--       但迁移 00006 实际创建的是 `qrcodes`，导致上传失败 → 函数报错 → 前端退化成死链 URL 码
--       （表现为「门店二维码不能扫码识别」）。
-- 此处同时兜底两个 bucket，确保无论函数最终使用哪个名字都不会因 bucket 缺失而失败。
-- 注意：本套代码 generate-qrcode 现已统一使用 `qrcodes`；`二维码` 仅作兼容保留。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'qrcodes') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('qrcodes', 'qrcodes', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = '二维码') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('二维码', '二维码', true);
  END IF;
END $$;

-- RLS：二维码 bucket 公开可读（service role 上传本身绕过 RLS，此处为小程序端读取图片兜底）
DROP POLICY IF EXISTS "qr_public_select" ON storage.objects;
CREATE POLICY "qr_public_select" ON storage.objects
  FOR SELECT USING (bucket_id IN ('qrcodes', '二维码'));

DROP POLICY IF EXISTS "qr_service_insert" ON storage.objects;
CREATE POLICY "qr_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('qrcodes', '二维码'));
