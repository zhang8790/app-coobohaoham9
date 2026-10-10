-- 00056 增强存量商品情绪标签维度（让"说心情"匹配率更高）
-- 在 00019 基础上，补充 孤独 / 陪伴 / 治愈 / 想念 / 放松 等用户常见心情词维度。
-- 用 array_cat + DISTINCT 追加，不覆盖 00019 已打的标签。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（纯 SQL，非 Edge Function）。

-- 图书 / 文创 / 文具 → 孤独、安静、治愈、陪伴、学习空间、想念
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['孤独','安静','治愈','陪伴','学习空间','想念'])))
)
WHERE name ILIKE ANY(ARRAY['%书%','%笔%','%本%','%文具%','%文创%','%手账%','%笔记本%','%纸%','%日历%','%贴纸%']);

-- 家居 / 日用 → 治愈、安静、陪伴、放松
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','安静','陪伴','放松'])))
)
WHERE name ILIKE ANY(ARRAY['%家居%','%日用%','%杯%','%碗%','%盘%','%锅%','%壶%','%灯%','%香薰%','%蜡烛%','%靠垫%','%毛巾%']);

-- 饮品 / 咖啡 / 茶 → 治愈、放松、安静、独处
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','安静','独处'])))
)
WHERE name ILIKE ANY(ARRAY['%饮%','%咖啡%','%茶%','%奶茶%','%果汁%','%水%']);

-- 零食 / 甜品 → 治愈、满足、陪伴、甜蜜
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','满足','陪伴','甜蜜'])))
)
WHERE name ILIKE ANY(ARRAY['%零%','%糖%','%甜%','%饼%','%果%','%巧%','%布丁%','%冰淇淋%']);

-- 礼品 / 饰品 → 想念、分享、仪式感、治愈
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['想念','分享','仪式感','治愈'])))
)
WHERE name ILIKE ANY(ARRAY['%礼%','%饰%','%项链%','%手链%','%戒指%','%耳环%','%手镯%','%摆件%','%装饰%','%贺卡%']);

-- 美妆 / 护肤 → 治愈、放松、仪式感、精致
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','仪式感','精致'])))
)
WHERE name ILIKE ANY(ARRAY['%妆%','%护肤%','%面膜%','%精华%','%口红%','%防晒%','%洗面%','%乳液%','%面霜%']);

-- 养生 / 健康 → 治愈、放松、安静、陪伴
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','安静','陪伴'])))
)
WHERE name ILIKE ANY(ARRAY['%养生%','%枸杞%','%红枣%','%保健%','%按摩%','%足浴%','%泡脚%']);

-- 查看结果
-- SELECT id, name, mood_tags FROM products ORDER BY id LIMIT 20;
