-- 给现有商品自动补充 mood_tags（根据商品名称/分类/描述推断）
-- 执行时间：2026-07-04
-- 说明：根据商品名称和分类关键词，自动填充 mood_tags 字段

-- 先查看有多少商品没有 mood_tags
-- SELECT COUNT(*) FROM products WHERE mood_tags IS NULL OR array_length(mood_tags, 1) = 0;

-- 分批更新（用 CASE WHEN 根据商品名称关键词匹配）

-- 1. 食品类 → 满足、幸福、用餐时光
UPDATE products
SET mood_tags = ARRAY['满足', '幸福', '用餐时光']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%吃%' OR name ILIKE '%食%' OR name ILIKE '%餐%' OR name ILIKE '%饭%'
    OR name ILIKE '%面%' OR name ILIKE '%粉%' OR name ILIKE '%糕%' OR name ILIKE '%饼%'
    OR name ILIKE '%果%' OR name ILIKE '%水%' OR name ILIKE '%茶%' OR name ILIKE '%奶%'
    OR name ILIKE '%肉%' OR name ILIKE '%鸡%' OR name ILIKE '%鱼%' OR name ILIKE '%虾%'
  );

-- 2. 甜品/奶茶/蛋糕 → 甜蜜、幸福、治愈
UPDATE products
SET mood_tags = ARRAY['甜蜜', '幸福', '治愈']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%甜%' OR name ILIKE '%糖%' OR name ILIKE '%蜜%' OR name ILIKE '%蛋糕%'
    OR name ILIKE '%奶茶%' OR name ILIKE '%巧克力%' OR name ILIKE '%布丁%' OR name ILIKE '%冰淇淋%'
    OR name ILIKE '%雪糕%' OR name ILIKE '%糖果%' OR name ILIKE '%饼干%'
  );

-- 3. 文创/书籍/文具 → 专注、安静、学习空间
UPDATE products
SET mood_tags = ARRAY['专注', '安静', '学习空间']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%书%' OR name ILIKE '%笔%' OR name ILIKE '%纸%' OR name ILIKE '%本%'
    OR name ILIKE '%文具%' OR name ILIKE '%文创%' OR name ILIKE '%笔记本%' OR name ILIKE '%手账%'
    OR name ILIKE '%日历%' OR name ILIKE '%贴纸%' OR name ILIKE '%便签%'
  );

-- 4. 礼品/饰品 → 送礼、品质、仪式感
UPDATE products
SET mood_tags = ARRAY['送礼', '品质', '仪式感']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%礼%' OR name ILIKE '%饰%' OR name ILIKE '%项链%' OR name ILIKE '%手链%'
    OR name ILIKE '%戒指%' OR name ILIKE '%耳环%' OR name ILIKE '%手镯%' OR name ILIKE '%胸针%'
    OR name ILIKE '%摆件%' OR name ILIKE '%装饰%' OR name ILIKE '%贺卡%'
  );

-- 5. 家居/日用 → 治愈、品质、实用
UPDATE products
SET mood_tags = ARRAY['治愈', '品质', '实用']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%家居%' OR name ILIKE '%日用%' OR name ILIKE '%毛巾%' OR name ILIKE '%杯%'
    OR name ILIKE '%碗%' OR name ILIKE '%盘%' OR name ILIKE '%锅%' OR name ILIKE '%壶%'
    OR name ILIKE '%灯%' OR name ILIKE '%香薰%' OR name ILIKE '%蜡烛%' OR name ILIKE '%靠垫%'
  );

-- 6. 美妆/护肤 → 精致、仪式感、治愈
UPDATE products
SET mood_tags = ARRAY['精致', '仪式感', '治愈']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%妆%' OR name ILIKE '%护肤%' OR name ILIKE '%面膜%' OR name ILIKE '%精华%'
    OR name ILIKE '%口红%' OR name ILIKE '%唇膏%' OR name ILIKE '%防晒%' OR name ILIKE '%洗面%'
    OR name ILIKE '%乳液%' OR name ILIKE '%面霜%'
  );

-- 7. 养生/健康 → 治愈、放松、安静
UPDATE products
SET mood_tags = ARRAY['治愈', '放松', '安静']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%养生%' OR name ILIKE '%枸杞%' OR name ILIKE '%红枣%' OR name ILIKE '%茶%'
    OR name ILIKE '%保健%' OR name ILIKE '%按摩%' OR name ILIKE '%足浴%' OR name ILIKE '%泡脚%'
  );

-- 8. 剩余未打标签的商品 → 随机给一个通用标签
UPDATE products
SET mood_tags = ARRAY['愉悦', '品质']
WHERE mood_tags IS NULL OR array_length(mood_tags, 1) = 0;

-- 查看结果
-- SELECT id, name, mood_tags FROM products LIMIT 20;
