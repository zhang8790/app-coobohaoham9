-- 20260916_add_address_coords.sql
-- 地址表补充 GCJ-02 经纬度，供结算页「配送半径硬校验」使用。
-- 坐标系须与门店 stores.lat/lng 一致（GCJ-02 / 微信 chooseLocation 返回），方可直接算 haversine 距离。
-- 部署：在 Supabase SQL Editor 手动执行（沙箱 CLI 未 link，无法自动部署）。

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

COMMENT ON COLUMN public.user_addresses.lat IS '收货地址纬度（GCJ-02，与门店同坐标系）';
COMMENT ON COLUMN public.user_addresses.lng IS '收货地址经度（GCJ-02，与门店同坐标系）';

-- 校验（执行后应各返回一行）：
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'user_addresses' AND column_name IN ('lat','lng');
