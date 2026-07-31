-- 00218_cart_items_batch_id.sql
-- 目的：让「购物车结算」路径也能自动套用临期特惠折扣。
-- 背景：createOrderV2 已支持按 batch_id 从 v_near_expiry_products 套用 effective_price（防资损，以 DB auto_discount_rate 为准）；
--       但 cart_items 此前未存 batch_id，购物车结算时 batch_id 为空 → 折扣不生效（仅「立即购买」路径闭环）。
-- 改动：
--   1) cart_items 增加 batch_id 列（nullable，不建外键——stock_batches 会随时间消费/归档，FK 会断）；
--   2) 唯一约束由 (user_id, product_id) 扩展为 (user_id, product_id, batch_id)，
--      允许同一商品在正常价批次与临期批次各占一行（临期价与目录价并存于购物车）；
--   3) 补索引便于按批次回查。

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS batch_id uuid NULL;

-- 允许同一商品以不同批次（正常批次 vs 临期特惠批次）分别入车。
-- 注意：PostgreSQL 唯一约束中 NULL 视为互不相等，故历史 (user_id, product_id) 重复行（batch_id 均为 NULL）不会触发冲突。
ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_user_id_product_id_batch_id_key
  UNIQUE (user_id, product_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_batch_id
  ON public.cart_items (batch_id);

COMMENT ON COLUMN public.cart_items.batch_id IS
  '来源库存批次（stock_batches.id）。为空=正常价批次；非空=临期特惠批次，下单时由 createOrderV2 据此从 v_near_expiry_products 套用 effective_price';
