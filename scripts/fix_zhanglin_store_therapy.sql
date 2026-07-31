-- ============================================================
-- 修复：张林水果店（store id = 70778d6b-d819-41fc-87a3-8766a78eb60d）商品卡片「食养」缺失
-- 根因：
--   1) food_ingredients 字典仅 2 条（番茄/鸡蛋），覆盖面极低；
--   2) 该店 8 个商品 ingredients 存的是【拼音 key】(xia/niurou/pingguo/fanqie/jidan…)，
--      而门店卡片 & 详情页匹配逻辑按字典【中文名】建索引 → 全部 miss → 食养不展示。
-- 本脚本：
--   ① 补全常用食材字典（food_ingredients）
--   ② 把张林水果店这 8 个商品的 ingredients 从拼音 key 改回【中文名】
-- 执行：Supabase SQL Editor 全量粘贴运行（service_role 权限，绕过 RLS）。
--       执行后【无需重建小程序】，真机重进门店 / 下拉刷新即可见食养（注意 getProducts 有 30s 缓存）。
-- 幂等：字典用 ON CONFLICT(name) DO NOTHING；UPDATE 按具体 product id，可重复执行。
-- 合规：仅食养参考口径，不含治疗/降血压/降血糖等医疗宣称。
-- ============================================================

-- ========== 1) 补全食材字典（food_ingredients） ==========
INSERT INTO public.food_ingredients
  (name, nature, base_effect, fit_scenes, caution_crowds, allergens, chronic_tags, neutralize, sort_order)
VALUES
  ('虾',  '温', '补充优质蛋白、低脂高蛋白营养补给',       '日常营养补给、健身增肌',     '海鲜过敏者、痛风及高尿酸人群慎食',     ARRAY['海鲜'],        ARRAY['痛风/高尿酸慎食'],     '', 10),
  ('牛肉','温', '补气血、强筋健骨、优质蛋白来源',         '日常营养补给、体虚调养',     '高胆固醇、痛风人群控量食用',           ARRAY[]::text[],     ARRAY['高血压适量食用'],     '', 11),
  ('苹果','凉', '生津润燥、补充维生素与膳食纤维',         '日常水果、秋冬干燥',         '糖尿病人群控量食用',                   ARRAY[]::text[],     ARRAY['减脂期适宜'],         '', 12),
  ('猕猴桃','寒','补充维生素C、助消化、抗氧化',           '日常水果、饮食油腻后',       '脾胃虚寒、易腹泻者少食',               ARRAY[]::text[],     ARRAY['减脂期适宜'],         '', 13),
  ('黄瓜','凉', '清热利水、低卡解腻、补充水分',           '夏季消暑、减脂餐',           '脾胃虚寒者少食',                       ARRAY[]::text[],     ARRAY['减脂期适宜','高血压适宜'], '', 14),
  ('姜',  '温', '驱寒暖胃、去腥提鲜、温中散寒',           '淋雨受寒、胃寒不适',         '阴虚火旺、口腔溃疡者少食',             ARRAY[]::text[],     ARRAY[]::text[],              '', 15),
  ('茄子','凉', '清热活血、富含花青素与膳食纤维',         '日常蔬菜、油腻饮食后',       '体寒、腹泻者少食',                     ARRAY[]::text[],     ARRAY['减脂期适宜'],         '', 16)
ON CONFLICT (name) DO NOTHING;

-- ========== 2) 修正张林水果店商品 ingredients：拼音 key → 中文名 ==========
-- 大龙虾2斤
UPDATE public.products SET ingredients = ARRAY['虾']        WHERE id = '15064190-e642-4254-9aa2-001e8275a98b';
-- 党参牛肉汤
UPDATE public.products SET ingredients = ARRAY['牛肉','姜'] WHERE id = 'badf52b6-7c88-486c-a967-a6074c4036d2';
-- 苹果
UPDATE public.products SET ingredients = ARRAY['苹果']      WHERE id = 'd00e260e-32b9-4b6d-a4ae-0da71552f35a';
-- 猕猴桃
UPDATE public.products SET ingredients = ARRAY['猕猴桃']    WHERE id = 'd4ca6145-2cef-4748-8e81-40660c42d8f9';
-- 牛肉粉丝
UPDATE public.products SET ingredients = ARRAY['牛肉']      WHERE id = '96e8e47e-8e1d-4a75-adc0-fecf518fb998';
-- 黄瓜
UPDATE public.products SET ingredients = ARRAY['黄瓜']      WHERE id = '2c94a945-924c-4f96-8a7e-fc8f0562ca3a';
-- 牛肉颗粒
UPDATE public.products SET ingredients = ARRAY['牛肉']      WHERE id = '6dc5486c-e4c4-43d2-8f18-39fbe2079f9d';
-- 番茄炒鸡蛋（修正原误录 qiezi/茄子 → 番茄+鸡蛋）
UPDATE public.products SET ingredients = ARRAY['番茄','鸡蛋'] WHERE id = '5c230b4c-fc67-4036-bbf2-e05a46e169af';

-- ========== 校验（执行后取消注释查看结果） ==========
-- SELECT name, ingredients FROM public.products
--   WHERE store_id = '70778d6b-d819-41fc-87a3-8766a78eb60d' ORDER BY name;
--
-- 备注：西瓜/椰子/农夫山泉/口服液/新品/「一句顶一万句」共 6 个商品 ingredients 仍为 null
--      （录入者未配，属合理：水/药品/书籍/占位）。如需也给西瓜、椰子配食养，可追加：
-- UPDATE public.products SET ingredients = ARRAY['西瓜'] WHERE id = '70caaa95-b7f3-4607-920b-9ae2abe5b0e6';
-- UPDATE public.products SET ingredients = ARRAY['椰子'] WHERE id = 'c4a9a2e9-a88d-4175-af3f-c0eb718bf8f9';
