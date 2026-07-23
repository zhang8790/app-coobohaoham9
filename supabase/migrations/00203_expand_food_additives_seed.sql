-- ============================================================
-- 00203 扩充食品配料安全库种子（food_additives）
-- 目的：将安全库从 14 条扩到覆盖 GB 2760 常见 ~130 种添加剂，
--       让 C 端「文本解析」「拍照 OCR」能命中日常 90% 食品配料。
-- 与前端 src/utils/additive-dictionary.ts 的 ADDITIVE_DICT 保持一致。
-- 幂等：name 唯一，已存在的 14 条 ON CONFLICT DO NOTHING 跳过。
-- 执行：Supabase SQL Editor 全量粘贴运行。
-- ============================================================

insert into public.food_additives (name, category, risk_level, age_limit, gb_std, risk_desc, status) values
  -- 防腐剂
  ('山梨酸钾',     '防腐剂', 'white',  null, 'GB2760', '常见防腐剂，代谢快、低毒，按量使用安全', 'active'),
  ('苯甲酸钠',     '防腐剂', 'yellow', 36,   'GB2760', '防腐剂，与维C同存可能生成微量苯，需控量', 'active'),
  ('脱氢乙酸钠',   '防腐剂', 'yellow', 36,   'GB2760', '防腐剂，2024版国标已收紧使用范围，注意限量', 'active'),
  ('丙酸钙',       '防腐剂', 'white',  null, 'GB2760', '面包常用防腐剂，安全性高', 'active'),
  ('丙酸钠',       '防腐剂', 'white',  null, 'GB2760', '面包常用防腐剂，安全性高', 'active'),
  ('对羟基苯甲酸乙酯','防腐剂','yellow', null, 'GB2760', '尼泊金类防腐剂，限量使用', 'active'),
  ('对羟基苯甲酸丙酯','防腐剂','yellow', null, 'GB2760', '尼泊金类防腐剂，限量使用', 'active'),
  ('乳酸链球菌素', '防腐剂', 'white',  null, 'GB2760', '天然多肽防腐剂（Nisin），安全', 'active'),
  ('纳他霉素',     '防腐剂', 'white',  null, 'GB2760', '表面抗真菌防腐剂，安全', 'active'),
  -- 甜味剂
  ('糖精钠',       '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂，无营养，婴幼儿不建议', 'active'),
  ('阿斯巴甜',     '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂，苯丙酮尿症患者禁用', 'active'),
  ('安赛蜜',       '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂（AK糖），限量使用', 'active'),
  ('三氯蔗糖',     '甜味剂', 'white',  null, 'GB2760', '高倍甜味剂，无热量，目前认为安全', 'active'),
  ('甜蜜素',       '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂，过量有争议，限量', 'active'),
  ('木糖醇',       '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，防龋齿，安全', 'active'),
  ('麦芽糖醇',     '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，升糖低，安全', 'active'),
  ('赤藓糖醇',     '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，零热量，安全', 'active'),
  ('山梨糖醇',     '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('甘露醇',       '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('乳糖醇',       '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('异麦芽酮糖醇', '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('罗汉果甜苷',   '甜味剂', 'white',  null, 'GB2760', '天然植物甜味剂，安全', 'active'),
  ('甜菊糖苷',     '甜味剂', 'white',  null, 'GB2760', '天然植物甜味剂，安全', 'active'),
  ('纽甜',         '甜味剂', 'white',  null, 'GB2760', '高倍甜味剂，安全', 'active'),
  ('阿力甜',       '甜味剂', 'white',  null, 'GB2760', '高倍甜味剂，安全', 'active'),
  -- 合成色素
  ('胭脂红',       '色素',   'yellow', 36,   'GB2760', '合成色素，部分儿童敏感，建议3岁以下少用', 'active'),
  ('苋菜红',       '色素',   'yellow', 36,   'GB2760', '合成色素，建议限量', 'active'),
  ('柠檬黄',       '色素',   'yellow', 36,   'GB2760', '合成色素，与多动行为关联存争议，婴幼儿限量', 'active'),
  ('日落黄',       '色素',   'yellow', 36,   'GB2760', '合成色素，建议3岁以下少用', 'active'),
  ('亮蓝',         '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('靛蓝',         '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('诱惑红',       '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('赤藓红',       '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('新红',         '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('二氧化钛',     '色素',   'yellow', 36,   'GB2760', '白色素，部分国家限用，建议少用', 'active'),
  -- 天然色素
  ('焦糖色',       '色素',   'white',  null, 'GB2760', '天然着色剂，安全', 'active'),
  ('红曲红',       '色素',   'white',  null, 'GB2760', '天然红曲色素，安全', 'active'),
  ('姜黄',         '色素',   'white',  null, 'GB2760', '天然姜黄色素，安全', 'active'),
  ('栀子黄',       '色素',   'white',  null, 'GB2760', '天然着色剂，安全', 'active'),
  ('β-胡萝卜素',    '色素',   'white',  null, 'GB2760', '天然类胡萝卜素，安全', 'active'),
  ('叶绿素铜钠盐', '色素',   'yellow', null, 'GB2760', '天然源叶绿素着色剂，限量', 'active'),
  ('高粱红',       '色素',   'yellow', null, 'GB2760', '天然着色剂，限量', 'active'),
  ('天然苋菜红',   '色素',   'yellow', null, 'GB2760', '天然着色剂，限量', 'active'),
  -- 增稠剂
  ('卡拉胶',       '增稠剂', 'white',  null, 'GB2760', '海藻提取增稠剂，食品级安全', 'active'),
  ('明胶',         '增稠剂', 'white',  null, 'GB2760', '动物皮骨提取，常见安全', 'active'),
  ('黄原胶',       '增稠剂', 'white',  null, 'GB2760', '微生物发酵胶，安全', 'active'),
  ('瓜尔胶',       '增稠剂', 'white',  null, 'GB2760', '植物种子胶，安全', 'active'),
  ('阿拉伯胶',     '增稠剂', 'white',  null, 'GB2760', '天然树胶，安全', 'active'),
  ('果胶',         '增稠剂', 'white',  null, 'GB2760', '水果提取胶，安全', 'active'),
  ('海藻酸钠',     '增稠剂', 'white',  null, 'GB2760', '褐藻胶，安全', 'active'),
  ('羧甲基纤维素钠','增稠剂','white',  null, 'GB2760', 'CMC 增稠稳定剂，安全', 'active'),
  ('羟丙基甲基纤维素','增稠剂','white', null, 'GB2760', 'HPMC 增稠剂，安全', 'active'),
  ('刺槐豆胶',     '增稠剂', 'white',  null, 'GB2760', '槐豆胶，安全', 'active'),
  ('结冷胶',       '增稠剂', 'white',  null, 'GB2760', '微生物胶，安全', 'active'),
  ('亚麻籽胶',     '增稠剂', 'white',  null, 'GB2760', '植物胶，安全', 'active'),
  ('魔芋胶',       '增稠剂', 'white',  null, 'GB2760', '魔芋甘露聚糖，安全', 'active'),
  ('变性淀粉',     '增稠剂', 'white',  null, 'GB2760', '改性淀粉，安全', 'active'),
  -- 乳化剂
  ('单硬脂酸甘油酯','乳化剂','white',  null, 'GB2760', '单甘酯乳化剂，安全', 'active'),
  ('蔗糖脂肪酸酯', '乳化剂', 'white',  null, 'GB2760', '蔗糖酯乳化剂，安全', 'active'),
  ('磷脂',         '乳化剂', 'white',  null, 'GB2760', '大豆卵磷脂乳化剂，安全', 'active'),
  ('聚甘油脂肪酸酯','乳化剂','white',  null, 'GB2760', '聚甘油酯乳化剂，安全', 'active'),
  ('硬脂酰乳酸钠', '乳化剂', 'white',  null, 'GB2760', 'SSL 乳化剂，安全', 'active'),
  ('双乙酰酒石酸单双甘油酯','乳化剂','white', null, 'GB2760', 'DATEM 乳化剂，安全', 'active'),
  ('司盘60',       '乳化剂', 'white',  null, 'GB2760', 'Span60 乳化剂，安全', 'active'),
  ('吐温80',       '乳化剂', 'white',  null, 'GB2760', 'Tween80 乳化剂，安全', 'active'),
  -- 抗氧化剂
  ('丁基羟基茴香醚','抗氧化剂','yellow', null, 'GB2760', 'BHA 抗氧化剂，限量使用', 'active'),
  ('二丁基羟基甲苯','抗氧化剂','yellow', null, 'GB2760', 'BHT 抗氧化剂，限量使用', 'active'),
  ('特丁基对苯二酚','抗氧化剂','yellow', null, 'GB2760', 'TBHQ 抗氧化剂，限量使用', 'active'),
  ('没食子酸丙酯', '抗氧化剂', 'yellow', null, 'GB2760', 'PG 抗氧化剂，限量使用', 'active'),
  ('抗坏血酸棕榈酸酯','抗氧化剂','white', null, 'GB2760', '维C衍生物抗氧化，安全', 'active'),
  ('茶多酚',       '抗氧化剂', 'white',  null, 'GB2760', '天然抗氧化，安全', 'active'),
  ('D-异抗坏血酸钠','抗氧化剂','white', null, 'GB2760', '异维C钠抗氧化，安全', 'active'),
  ('维生素E',      '抗氧化剂', 'white',  null, 'GB2760', '生育酚抗氧化，安全', 'active'),
  -- 膨松剂
  ('碳酸氢钠',     '膨松剂', 'white',  null, 'GB2760', '小苏打，安全', 'active'),
  ('碳酸氢铵',     '膨松剂', 'yellow', null, 'GB2760', '臭粉，加热释氨，限量', 'active'),
  ('硫酸铝钾',     '膨松剂', 'black',  null, 'GB2760', '明矾含铝，儿童慎用、严控', 'active'),
  ('硫酸铝铵',     '膨松剂', 'black',  null, 'GB2760', '铵明矾含铝，儿童慎用、严控', 'active'),
  ('葡萄糖酸-δ-内酯','膨松剂','white', null, 'GB2760', 'GDL 酸度/膨松，安全', 'active'),
  ('酒石酸氢钾',   '膨松剂', 'white',  null, 'GB2760', '塔塔粉，安全', 'active'),
  -- 酸度调节剂
  ('柠檬酸',       '酸度调节剂', 'white', null, 'GB2760', '常见酸味剂，安全', 'active'),
  ('柠檬酸钠',     '酸度调节剂', 'white', null, 'GB2760', '缓冲剂，安全', 'active'),
  ('苹果酸',       '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('酒石酸',       '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('乳酸',         '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('醋酸',         '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('磷酸',         '酸度调节剂', 'white', null, 'GB2760', '酸味剂/ pH 调节，限量', 'active'),
  ('富马酸',       '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  -- 水分保持剂
  ('六偏磷酸钠',   '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  ('三聚磷酸钠',   '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  ('焦磷酸钠',     '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  ('磷酸三钠',     '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  -- 营养强化剂
  ('维生素C',      '营养强化剂', 'white', null, 'GB14880', '抗坏血酸，营养强化', 'active'),
  ('维生素D',      '营养强化剂', 'white', null, 'GB14880', '胆钙化醇，营养强化', 'active'),
  ('维生素A',      '营养强化剂', 'white', null, 'GB14880', '视黄醇，营养强化', 'active'),
  ('维生素B1',     '营养强化剂', 'white', null, 'GB14880', '硫胺素，营养强化', 'active'),
  ('维生素B2',     '营养强化剂', 'white', null, 'GB14880', '核黄素，营养强化', 'active'),
  ('碳酸钙',       '营养强化剂', 'white', null, 'GB14880', '钙强化，安全', 'active'),
  ('乳酸钙',       '营养强化剂', 'white', null, 'GB14880', '钙强化，安全', 'active'),
  ('硫酸亚铁',     '营养强化剂', 'white', null, 'GB14880', '铁强化，安全', 'active'),
  ('葡萄糖酸锌',   '营养强化剂', 'white', null, 'GB14880', '锌强化，安全', 'active'),
  ('乳酸锌',       '营养强化剂', 'white', null, 'GB14880', '锌强化，安全', 'active'),
  ('氧化锌',       '营养强化剂', 'white', null, 'GB14880', '锌强化，安全', 'active'),
  ('亚硒酸钠',     '营养强化剂', 'yellow', null, 'GB14880', '硒强化，严格限量', 'active'),
  ('牛磺酸',       '营养强化剂', 'white', null, 'GB14880', '氨基酸强化，安全', 'active'),
  ('DHA',         '营养强化剂', 'white', null, 'GB14880', '藻油DHA，安全', 'active'),
  ('ARA',         '营养强化剂', 'white', null, 'GB14880', '花生四烯酸，安全', 'active'),
  -- 护色剂 / 漂白剂
  ('亚硝酸盐',     '护色剂', 'black',  36,   'GB2760', '肉制品护色剂，过量有毒，婴幼儿严禁', 'active'),
  ('硝酸钠',       '护色剂', 'yellow', null, 'GB2760', '护色剂，限量使用', 'active'),
  ('二氧化硫',     '漂白剂', 'yellow', null, 'GB2760', '漂白/防腐，敏感者限量', 'active'),
  ('亚硫酸钠',     '漂白剂', 'yellow', null, 'GB2760', '漂白/防腐，敏感者限量', 'active'),
  ('焦亚硫酸钠',   '漂白剂', 'yellow', null, 'GB2760', '漂白/防腐，敏感者限量', 'active'),
  ('低亚硫酸钠',   '漂白剂', 'yellow', null, 'GB2760', '保险粉，漂白/防腐，限量', 'active'),
  -- 增味剂
  ('谷氨酸钠',     '增味剂', 'white',  null, 'GB2760', '味精，安全', 'active'),
  ('5''-呈味核苷酸二钠','增味剂','white', null, 'GB2760', 'I+G 增鲜，安全', 'active'),
  ('琥珀酸二钠',   '增味剂', 'white',  null, 'GB2760', '干贝素增鲜，安全', 'active'),
  ('酵母抽提物',   '增味剂', 'white',  null, 'GB2760', '天然增鲜，安全', 'active'),
  ('L-丙氨酸',     '增味剂', 'white',  null, 'GB2760', '增味剂，安全', 'active'),
  ('甘氨酸',       '增味剂', 'white',  null, 'GB2760', '增味剂，安全', 'active'),
  -- 香精香料
  ('人工香精',     '香精',   'yellow', 36,   'GB2760', '合成香精，部分儿童敏感，建议少用', 'active'),
  ('食用香精',     '香精',   'yellow', 36,   'GB2760', '香精，建议少用', 'active'),
  ('香兰素',       '香精',   'yellow', 36,   'GB2760', '香精，建议少用', 'active'),
  ('乙基麦芽酚',   '香精',   'yellow', 36,   'GB2760', '增香剂，建议少用', 'active'),
  ('甲基环戊烯醇酮','香精',  'yellow', 36,   'GB2760', 'MCP 增香，限量', 'active'),
  -- 被膜剂 / 加工助剂
  ('巴西棕榈蜡',   '被膜剂', 'white',  null, 'GB2760', '被膜剂，安全', 'active'),
  ('聚二甲基硅氧烷','加工助剂','white', null, 'GB2760', '消泡剂，安全', 'active'),
  ('硬脂酸镁',     '加工助剂', 'white', null, 'GB2760', '抗结剂，安全', 'active'),
  ('丙二醇',       '加工助剂', 'yellow', null, 'GB2760', '保湿剂，限量使用', 'active'),
  -- 反式脂肪
  ('部分氢化植物油','反式脂肪','black',  null, 'GB28050', '含反式脂肪酸，婴幼儿禁用、成人严控', 'active')
on conflict (name) do nothing;

-- 常用别名补录（提升拍照 OCR / 文本匹配率；与 ADDITIVE_DICT.aliases 对应）
insert into public.food_additive_aliases (additive_id, alias)
select id, '山梨酸' from public.food_additives where name = '山梨酸钾' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '安息香酸钠' from public.food_additives where name = '苯甲酸钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '阿司帕坦' from public.food_additives where name = '阿斯巴甜' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '乙酰磺胺酸钾' from public.food_additives where name = '安赛蜜' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '环己基氨基磺酸钠' from public.food_additives where name = '甜蜜素' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '糖精' from public.food_additives where name = '糖精钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '单甘酯' from public.food_additives where name = '单硬脂酸甘油酯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '蔗糖酯' from public.food_additives where name = '蔗糖脂肪酸酯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '大豆磷脂' from public.food_additives where name = '磷脂' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '味精' from public.food_additives where name = '谷氨酸钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'I+G' from public.food_additives where name = '5''-呈味核苷酸二钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '小苏打' from public.food_additives where name = '碳酸氢钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '明矾' from public.food_additives where name = '硫酸铝钾' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '亚硝酸钠' from public.food_additives where name = '亚硝酸盐' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'BHA' from public.food_additives where name = '丁基羟基茴香醚' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'BHT' from public.food_additives where name = '二丁基羟基甲苯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'TBHQ' from public.food_additives where name = '特丁基对苯二酚' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'PG' from public.food_additives where name = '没食子酸丙酯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '抗坏血酸' from public.food_additives where name = '维生素C' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '生育酚' from public.food_additives where name = '维生素E' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '植脂末' from public.food_additives where name = '部分氢化植物油' on conflict do nothing;
