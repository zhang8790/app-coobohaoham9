-- ============================================================
-- 来电有喜 · 商品状态诊断 SQL
-- 运行位置：Supabase Dashboard → SQL Editor → Run
-- 重要说明：
--   SQL Editor 以 service_role（管理员）身份执行，不受 RLS 过滤，
--   所以这里能看到前端小程序"看不到"的商品（如下架/未上架的）。
--   前端 createOrderV2 回查 products 时只认 is_active=true 且有 price 的行，
--   凡是下面查到的"失效商品"，就是小程序下单报 INVALID_PRODUCT 的真相。
-- ============================================================

-- ① 一键列出所有「会让下单失败」的商品
--    createOrderV2 回查 products 仅接受 is_active=true 且 price>0 的行
SELECT
  id,
  name,
  price,
  is_active,
  review_status,
  store_id,
  updated_at
FROM products
WHERE is_active IS NOT TRUE
   OR price IS NULL
   OR price <= 0
ORDER BY updated_at DESC NULLS LAST;

-- ② 如果你从报错日志里拿到了具体 product_id，直接精确查
--    把下面 '在此粘贴product_id' 整段替换成真实 id（多个用逗号分隔）
SELECT id, name, price, is_active, review_status, store_id, updated_at
FROM products
WHERE id IN ('在此粘贴product_id');

-- ③ 查看「当前购物车里」引用了哪些商品，并对照它们是否还有效
--    直接定位用户进入支付页时真正踩到的失效商品
SELECT
  ci.id           AS cart_item_id,
  ci.product_id,
  ci.quantity,
  p.name          AS product_name,
  p.price,
  p.is_active,
  p.review_status
FROM cart_items ci
LEFT JOIN products p ON p.id = ci.product_id
ORDER BY ci.updated_at DESC NULLS LAST;

-- ④ ③ 的「失效版」：只列出购物车里已失效的商品
--    （商品被物理删除 / 下架未上架 / 无价）
SELECT
  ci.id       AS cart_item_id,
  ci.product_id,
  ci.quantity,
  p.name      AS product_name,
  p.is_active,
  p.price
FROM cart_items ci
LEFT JOIN products p ON p.id = ci.product_id
WHERE p.id IS NULL
   OR p.is_active IS NOT TRUE
   OR p.price IS NULL OR p.price <= 0
ORDER BY ci.updated_at DESC NULLS LAST;

-- ============================================================
-- 【可选修复】务必先跑上面 SELECT 核对，确认无误后再执行 UPDATE
-- ============================================================

-- ⑤ 把单个指定商品重新上架 + 补价（id 和价格换成你实际的）
-- UPDATE products
-- SET is_active = true, price = 9.90, updated_at = now()
-- WHERE id = '在此粘贴product_id';

-- ⑥ 批量：仅把「审核已通过、但 is_active 未开」的商品一键上架（谨慎，会改全表）
-- UPDATE products
-- SET is_active = true, updated_at = now()
-- WHERE is_active IS NOT TRUE AND review_status = 'approved';
