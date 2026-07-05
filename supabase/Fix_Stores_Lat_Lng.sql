-- ============================================
-- 修复 stores 表：添加 lat/lng 字段（LBS 定位必需）
-- 执行方式：在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 添加经纬度字段
ALTER TABLE stores 
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10,6);

-- 2. 为现有测试门店填入默认经纬度（上海坐标）
-- 你需要根据实际位置修改这些坐标
UPDATE stores 
SET lat = 31.2304, lng = 121.4737 
WHERE lat IS NULL OR lng IS NULL;

-- 3. 添加 short_code 字段（扫码上架需要）
ALTER TABLE stores 
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- 4. 为现有门店生成 short_code
UPDATE stores 
SET short_code = 'SHOP' || LPAD((ROW_NUMBER() OVER (ORDER BY created_at))::text, 4, '0')
WHERE short_code IS NULL;

-- 5. 刷新 schema cache
NOTIFY pgrest, 'reload schema';

-- 6. 验证修复结果
SELECT id, name, lat, lng, short_code 
FROM stores 
LIMIT 10;
