-- 00139_add_partner_brand_to_nearby.sql
-- 目的：让 get_nearby_products 直接返回 partner_brand，前端无需二次查询即可识别并排除合作品牌门店。
-- 背景：is_platform 仅表示「审核通过/活跃商家」，合作品牌门店（巫山烤鱼、张林的水果店等）
--       其 is_platform 同样为 true，导致它们被误判为自营、漏进自营区。
--       正确的自营口径应为：is_platform 为真 且 partner_brand 为空。
-- 改动：保持函数签名不变（CREATE OR REPLACE 不允许改签名），仅扩展 RETURNS TABLE + SELECT 带出 partner_brand。

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
  is_platform boolean,
  partner_brand text
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
    COALESCE(s.is_platform, false) AS is_platform,
    COALESCE(s.partner_brand, ''::text) AS partner_brand
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
