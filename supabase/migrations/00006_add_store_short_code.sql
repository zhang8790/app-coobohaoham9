
-- 给 stores 表添加 short_code (8位唯一短码，用于二维码 scene 参数)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS short_code text;

-- 为现有门店生成短码
CREATE OR REPLACE FUNCTION generate_store_short_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- 检查唯一性
    IF NOT EXISTS (SELECT 1 FROM stores WHERE short_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 100 THEN RAISE EXCEPTION 'Failed to generate unique short_code'; END IF;
  END LOOP;
END;
$$;

-- 为现有门店批量填充短码
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM stores WHERE short_code IS NULL LOOP
    UPDATE stores SET short_code = generate_store_short_code() WHERE id = r.id;
  END LOOP;
END;
$$;

-- 添加非空约束和唯一索引（用默认值兜底）
ALTER TABLE stores ALTER COLUMN short_code SET DEFAULT generate_store_short_code();
ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);

-- Storage bucket for qrcodes (if not exists - idempotent via DO block)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('qrcodes', 'qrcodes', true)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- RLS: 所有人可读 qrcodes bucket
DROP POLICY IF EXISTS "qrcodes_public_select" ON storage.objects;
CREATE POLICY "qrcodes_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'qrcodes');

DROP POLICY IF EXISTS "qrcodes_service_insert" ON storage.objects;
CREATE POLICY "qrcodes_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'qrcodes');
