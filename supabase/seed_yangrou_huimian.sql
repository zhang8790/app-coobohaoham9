-- ============================================================
-- 羊肉烩面 商品 seed 脚本（来电有喜 app-coobohaoham9）
-- 执行位置：Supabase 控制台 → SQL Editor → Run
-- 依赖迁移（本地均已存在）：
--   00009  products.review_status + trg_product_pending 触发器
--   00090  products.ingredients text[]
--   00100  products.overall_nature text / health_tag text[]
--   00104  products.food_category + 其余食养字段 + chk_products_food_category 约束
-- ============================================================

-- ①（可选）先确认目标门店 id，二选一：
--   SELECT id, name FROM stores;
--   然后把下面 INSERT 的 store_id 子查询替换为具体 UUID，例如：
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
-- 若直接运行，则自动取库中第一个门店（ORDER BY created_at LIMIT 1）。

INSERT INTO products (
  store_id,
  name,
  price,
  original_price,
  description,
  image_url,
  ingredients,
  overall_nature,
  health_tag,
  food_category,
  positive_effect,
  risk_warning,
  scenes,
  rec_crowds,
  cautious_crowds,
  forbidden_crowds
) VALUES (
  (SELECT id FROM stores ORDER BY created_at LIMIT 1),  -- 需指定门店请替换此子查询
  '羊肉烩面',
  28.00,
  32.00,
  '手工扯面，羊骨慢熬汤底，暖身暖胃的西北风味主食',
  NULL,
  ARRAY['yangrou','miantiao','haidai','doufu'],          -- 对齐 shiyang-dictionary 的食材 key
  '温',
  ARRAY['温补','驱寒','补气血'],
  '粉面',                                                  -- 必须 ∈ ('粉面','炖汤','热饮','小菜')
  '温中暖下、补益气血；富含优质蛋白与铁，适合体虚怕冷、经期后调养',
  '羊肉性温，阴虚火旺/实热体质/痛风急性期者宜少食；汤偏油，高血脂人群建议去浮油',
  ARRAY['秋冬御寒','经期前后','体虚怕冷','单人简餐'],
  ARRAY['体虚怕冷','宫寒量少','经期量大','易疲劳','脾胃虚寒'],
  ARRAY['阴虚火旺','易上火','痛风急性期'],
  ARRAY['痛风急性期','严重湿热体质']
);

-- ② 关键：触发器 trg_product_pending 会在 BEFORE INSERT 时强制
--    review_status='pending' 且 is_active=false（即使你写 approved 也会被改回 pending）。
--    因此必须再 UPDATE 成 approved，前端才能看见；
--    配套的 sync_is_active_on_review_status 触发器会同步把 is_active 置 true。
UPDATE products
SET review_status = 'approved'
WHERE name = '羊肉烩面'
  AND review_status = 'pending'
  AND id = (
    SELECT id FROM products
    WHERE name = '羊肉烩面'
    ORDER BY created_at DESC LIMIT 1
  );

-- ③ 校验：应看到 review_status='approved'、is_active=true
SELECT id, name, food_category, review_status, is_active
FROM products WHERE name = '羊肉烩面' ORDER BY created_at DESC LIMIT 1;

-- ⚠️ 本脚本非幂等（重复执行会再插一行同名商品）。请只 Run 一次；
--   若需重跑，先：DELETE FROM products WHERE name = '羊肉烩面';
