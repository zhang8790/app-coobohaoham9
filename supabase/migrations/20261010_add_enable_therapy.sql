-- 迁移 20261010：商品级「是否启用食养系统」开关
-- 背景：部分商品（如简单零食、非食品类）不需要食养系统，C 端不应展示食养/关怀层/适合我徽章。
-- 设计：与 product_kind 双闸门——食养系统仅在「食品类 且 enable_therapy 开启」时展示；
--       非食品类（gift/craft/care）由 product_kind 闸门彻底不展示；本列仅用于「食品类里再关掉」。
-- 兼容性：默认 true，保证存量食品商品继续展示；非食品存量行回填 false（仅语义清洁，product_kind 已拦截）。

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS enable_therapy boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.enable_therapy IS
  '商品级食养系统开关：true=展示食养/关怀层（仅当 product_kind=food 时生效）；false=彻底不展示。非食品类由 product_kind 闸门拦截，本列对其无意义。';

-- 存量回填：非食品类置 false（幂等，重复执行无害）
UPDATE products
  SET enable_therapy = false
  WHERE product_kind IS NOT NULL
    AND product_kind <> 'food'
    AND product_kind <> '';
