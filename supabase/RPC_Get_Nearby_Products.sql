-- ============================================
-- 附近商品推荐 RPC 函数
-- 功能：根据用户输入经纬度，推荐附近门店的商品，并返回距离
-- 使用：SELECT * FROM get_nearby_products(lat, lng, limit_count)
-- ============================================

CREATE OR REPLACE FUNCTION get_nearby_products(
  p_lat FLOAT,           -- 用户纬度
  p_lng FLOAT,           -- 用户经度
  p_limit INT = 20,      -- 返回数量
  p_category TEXT = NULL  -- 分类过滤（可选）
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  product_price NUMERIC,
  product_image_url TEXT,
  product_mood_tags TEXT[],
  store_id UUID,
  store_name TEXT,
  store_address TEXT,
  store_lat FLOAT,
  store_lng FLOAT,
  distance_km FLOAT     -- 距离（公里）
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    ) AS distance_km
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

-- 授予权限
GRANT EXECUTE ON FUNCTION get_nearby_products(FLOAT, FLOAT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_nearby_products(FLOAT, FLOAT, INT, TEXT) TO anon;

-- 测试查询（示例）
-- SELECT * FROM get_nearby_products(31.2304, 121.4737, 10, NULL);
