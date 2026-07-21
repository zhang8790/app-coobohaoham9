-- 00138_fix_get_nearby_products_is_platform.sql
-- 目的：让「已定位用户」的探索页也能按门店 is_platform 过滤。
-- 现状：get_nearby_products 返回集未含 is_platform，前端只能靠硬编码 store_id/name 兜底，
--       导致审核通过（is_platform=true）的入驻商家在已定位时进不了探索。
-- 改动：保持函数签名不变（CREATE OR REPLACE 不允许改签名），仅扩展 RETURNS TABLE + SELECT 带出 is_platform。

DROP FUNCTION IF EXISTS public.get_nearby_products(double precision, double precision, integer, text);

CREATE FUNCTION public.get_nearby_products(
  p_lat double precision,
  p_lng double precision,
  p_limit integer DEFAULT 20,
  p_category text DEFAULT NULL::text
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  product_price numeric,
  product_image_url text,
  product_mood_tags text[],
  store_id uuid,
  store_name text,
  store_address text,
  store_lat double precision,
  store_lng double precision,
  distance_km double precision,
  is_platform boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.price AS product_price,
    p.image_url AS product_image_url,
    p.mood_tags AS product_mood_tags,
    s.id AS store_id,
    s.name AS store_name,
    s.address AS store_address,
    s.lat AS store_lat,
    s.lng AS store_lng,
    -- 计算距离（半正矢公式，单位：公里）
    (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(s.lat)) *
        cos(radians(s.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(s.lat))
      )
    ) AS distance_km,
    COALESCE(s.is_platform, false) AS is_platform
  FROM products p
  JOIN stores s ON p.store_id = s.id
  WHERE p.is_active = true
    AND s.is_active = true
    AND s.lat IS NOT NULL
    AND s.lng IS NOT NULL
    AND (p_category IS NULL OR p.category_id = p_category)
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$;
