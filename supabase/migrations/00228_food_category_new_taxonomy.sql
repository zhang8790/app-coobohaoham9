-- 00228 商品分类 taxonomy 升级：旧[粉面/炖汤/热饮/小菜] → 新7分类（药食同源食疗零食体系）
-- 旧分类按做法命名，与首页「人群/品类」筛选体系不匹配；整体替换为：
--   长辈关怀零食 / 四季时令零食 / 药食同源烘焙 / 低糖轻食零食 /
--   温和养护零食 / 轻盈舒眠零食 / 温润养护零食
-- 语义对应：粉面→长辈关怀零食；其余旧值线上无数据，直接停用。

-- 1) 先卸掉旧 CHECK 约束（不校验现有行）
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_food_category;

-- 2) 历史数据迁移：粉面 → 长辈关怀零食
UPDATE products SET food_category = '长辈关怀零食' WHERE food_category = '粉面';

-- 3) 加上新 7 分类 CHECK 约束（此时已无旧值，校验通过）
ALTER TABLE products
  ADD CONSTRAINT chk_products_food_category
  CHECK (food_category IS NULL OR food_category = ANY (ARRAY[
    '长辈关怀零食', '四季时令零食', '药食同源烘焙', '低糖轻食零食',
    '温和养护零食', '轻盈舒眠零食', '温润养护零食'
  ]));
