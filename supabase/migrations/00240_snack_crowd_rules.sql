-- ============================================================================
-- 药食同源零食 · 儿童档人群触发规则补全（00240）
-- ----------------------------------------------------------------------------
-- 背景：00239 已把药食同源白名单补全至国家官方 106 种（medicinal_food_catalog），
--       但其中已标注的人群宜忌（age_caution）尚未落成 food_crowd_triggers 规则，
--       ingredient-analyze 引擎运行时感知不到；同时《儿童零食通用要求》团体标准
--       禁用的添加剂/反式脂肪也未进人群触发库（仅存在于添加剂库 yellow 档）。
--
-- 本迁移补两类种子（全部复用现有 crowd_code，无需改 EF / tips）：
--   A. 儿童零食添加剂零容忍触发（依据 T/CNFCSA《儿童零食通用要求》/T/FDSA 033-2022）
--   B. 药食同源 106 白名单内成分的人群触发补全（依据 00239 已标注宜忌口径）
--
-- severity 口径（沿用 00221 四级）：
--   forbidden       法律/安全硬禁（过敏、酒精、1岁内蜂蜜、泻药类、孕禁活血类）
--   advise_against  官方/团体标准「不宜」口径（第三四批孕乳婴不宜、儿童零食禁用添加剂）
--   caution         限量/传统慎用提示
--
-- 幂等：on conflict do update；执行方式 = Supabase SQL Editor 全量粘贴。
-- 前置依赖：00220（三表）、00221（severity 列）已执行。
-- ============================================================================

-- ============================================================================
-- A. 儿童零食添加剂零容忍触发（T/CNFCSA《儿童零食通用要求》：禁防腐剂/人工色素/
--    甜味剂/反式脂肪/含铝添加剂，添加剂指标向婴幼儿辅食标准看齐）
-- ============================================================================
insert into public.food_crowd_triggers (trigger_keyword, crowd_code, severity) values
  -- ----- 合成着色剂（团体标准明令禁用） → children advise_against / infant advise_against -----
  ('柠檬黄',     'children', 'advise_against'),
  ('日落黄',     'children', 'advise_against'),
  ('胭脂红',     'children', 'advise_against'),
  ('诱惑红',     'children', 'advise_against'),
  ('亮蓝',       'children', 'advise_against'),
  ('喹啉黄',     'children', 'advise_against'),
  ('酸性红',     'children', 'advise_against'),
  ('偶氮玉红',   'children', 'advise_against'),
  ('柠檬黄',     'infant',   'advise_against'),
  ('日落黄',     'infant',   'advise_against'),
  ('胭脂红',     'infant',   'advise_against'),
  ('诱惑红',     'infant',   'advise_against'),
  ('亮蓝',       'infant',   'advise_against'),

  -- ----- 甜味剂（团体标准：不允许使用） → children / infant advise_against -----
  ('阿斯巴甜',   'children', 'advise_against'),
  ('三氯蔗糖',   'children', 'advise_against'),
  ('安赛蜜',     'children', 'advise_against'),
  ('糖精钠',     'children', 'advise_against'),
  ('甜蜜素',     'children', 'advise_against'),
  ('纽甜',       'children', 'advise_against'),
  ('阿斯巴甜',   'infant',   'advise_against'),
  ('三氯蔗糖',   'infant',   'advise_against'),
  ('安赛蜜',     'infant',   'advise_against'),
  ('糖精钠',     'infant',   'advise_against'),

  -- ----- 防腐剂（团体标准：不允许使用） → children / infant advise_against -----
  ('苯甲酸钠',   'children', 'advise_against'),
  ('苯甲酸',     'children', 'advise_against'),
  ('脱氢乙酸钠', 'children', 'advise_against'),
  ('脱氢乙酸',   'children', 'advise_against'),
  ('山梨酸钾',   'children', 'advise_against'),
  ('山梨酸',     'children', 'advise_against'),
  ('苯甲酸钠',   'infant',   'advise_against'),
  ('脱氢乙酸钠', 'infant',   'advise_against'),
  ('山梨酸钾',   'infant',   'advise_against'),

  -- ----- 含铝添加剂（团体标准明令禁用） → children advise_against -----
  ('硫酸铝钾',   'children', 'advise_against'),
  ('硫酸铝铵',   'children', 'advise_against'),
  ('明矾',       'children', 'advise_against'),
  ('含铝膨松剂', 'children', 'advise_against'),

  -- ----- 反式脂肪酸来源（团体标准：不应含有） → children / infant advise_against，成人高血脂 caution -----
  ('氢化植物油',         'children', 'advise_against'),
  ('部分氢化植物油',     'children', 'advise_against'),
  ('氢化棕榈油',         'children', 'advise_against'),
  ('氢化大豆油',         'children', 'advise_against'),
  ('植脂末',             'children', 'advise_against'),
  ('代可可脂',           'children', 'advise_against'),
  ('起酥油',             'children', 'advise_against'),
  ('人造奶油',           'children', 'advise_against'),
  ('人造黄油',           'children', 'advise_against'),
  ('植物奶油',           'children', 'advise_against'),
  ('氢化植物油',         'infant',   'advise_against'),
  ('植脂末',             'infant',   'advise_against'),
  ('代可可脂',           'infant',   'advise_against'),
  ('氢化植物油',         'hyperlipidemia', 'caution'),
  ('植脂末',             'hyperlipidemia', 'caution'),
  ('代可可脂',           'hyperlipidemia', 'caution'),

  -- ----- 辐照处理原料（团体标准：不应使用） → children advise_against -----
  ('辐照',       'children', 'advise_against'),

  -- ----- 咖啡因类补强（儿童零食常见踩坑：能量饮料/巧克力味零食） -----
  ('浓缩咖啡粉', 'children', 'advise_against'),
  ('瓜拉纳提取物', 'children', 'advise_against'),
  ('茶多酚',     'children', 'caution')
on conflict (trigger_keyword, crowd_code) do update set severity = excluded.severity;

-- ============================================================================
-- B. 药食同源 106 白名单内成分 → 人群触发补全
--    （依据 medicinal_food_catalog 已标注宜忌 + 国家公告口径，食养参考不替代医嘱）
-- ============================================================================
insert into public.food_crowd_triggers (trigger_keyword, crowd_code, severity) values
  -- ===== 甘草：甘草酸升血压/水钠潴留 → 高血压 advise_against =====
  ('甘草',       'hypertension', 'advise_against'),

  -- ===== 白果（银杏）：生食有毒须熟食、婴幼儿禁用 =====
  ('白果',       'infant',   'forbidden'),
  ('白果',       'pregnant', 'caution'),
  ('白果',       'children', 'caution'),

  -- ===== 桃仁：活血，孕妇禁用 =====
  ('桃仁',       'pregnant', 'forbidden'),

  -- ===== 西红花：活血，孕妇禁用（第二批仅香辛料） =====
  ('西红花',     'pregnant', 'forbidden'),

  -- ===== 苦杏仁：含生氰苷，婴幼儿禁用、须炮制 =====
  ('苦杏仁',     'infant',   'forbidden'),
  ('苦杏仁',     'children', 'advise_against'),

  -- ===== 肉桂 / 高良姜：辛热刺激，婴幼儿不宜 =====
  ('肉桂',       'infant',   'advise_against'),
  ('高良姜',     'infant',   'advise_against'),

  -- ===== 决明子 / 胖大海：寒凉滑利，婴幼儿慎用 =====
  ('决明子',     'infant',   'advise_against'),
  ('胖大海',     'infant',   'advise_against'),
  ('决明子',     'pregnant', 'caution'),
  ('胖大海',     'pregnant', 'caution'),

  -- ===== 麦芽：传统认为回奶（00221 已有「炒麦芽」，补生名） =====
  ('麦芽',       'lactating', 'advise_against'),

  -- ===== 姜黄：活血，孕妇慎用 =====
  ('姜黄',       'pregnant', 'caution'),

  -- ===== 薏苡仁别名补全（00221 已有 薏米/薏仁，补规范名） =====
  ('薏苡仁',     'pregnant', 'advise_against'),

  -- =====================================================================
  -- 第三批（2023 第9号）9 种：官方口径「孕妇、哺乳期妇女及婴幼儿不宜食用」
  -- =====================================================================
  ('党参',       'pregnant',  'advise_against'),
  ('党参',       'lactating', 'advise_against'),
  ('党参',       'infant',    'advise_against'),
  ('肉苁蓉',     'pregnant',  'advise_against'),
  ('肉苁蓉',     'lactating', 'advise_against'),
  ('肉苁蓉',     'infant',    'advise_against'),
  ('铁皮石斛',   'pregnant',  'advise_against'),
  ('铁皮石斛',   'lactating', 'advise_against'),
  ('铁皮石斛',   'infant',    'advise_against'),
  ('西洋参',     'pregnant',  'advise_against'),
  ('西洋参',     'lactating', 'advise_against'),
  ('西洋参',     'infant',    'advise_against'),
  ('黄芪',       'pregnant',  'advise_against'),
  ('黄芪',       'lactating', 'advise_against'),
  ('黄芪',       'infant',    'advise_against'),
  ('灵芝',       'pregnant',  'advise_against'),
  ('灵芝',       'lactating', 'advise_against'),
  ('灵芝',       'infant',    'advise_against'),
  ('山茱萸',     'pregnant',  'advise_against'),
  ('山茱萸',     'lactating', 'advise_against'),
  ('山茱萸',     'infant',    'advise_against'),
  ('天麻',       'pregnant',  'advise_against'),
  ('天麻',       'lactating', 'advise_against'),
  ('天麻',       'infant',    'advise_against'),
  ('杜仲叶',     'pregnant',  'advise_against'),
  ('杜仲叶',     'lactating', 'advise_against'),
  ('杜仲叶',     'infant',    'advise_against'),

  -- =====================================================================
  -- 第四批（2024 第4号）4 种：同官方口径「孕乳婴不宜食用」
  -- =====================================================================
  ('地黄',       'pregnant',  'advise_against'),
  ('地黄',       'lactating', 'advise_against'),
  ('地黄',       'infant',    'advise_against'),
  ('麦冬',       'pregnant',  'advise_against'),
  ('麦冬',       'lactating', 'advise_against'),
  ('麦冬',       'infant',    'advise_against'),
  ('天冬',       'pregnant',  'advise_against'),
  ('天冬',       'lactating', 'advise_against'),
  ('天冬',       'infant',    'advise_against'),
  ('化橘红',     'pregnant',  'advise_against'),
  ('化橘红',     'lactating', 'advise_against'),
  ('化橘红',     'infant',    'advise_against')
on conflict (trigger_keyword, crowd_code) do update set severity = excluded.severity;

-- ============================================================================
-- C. 验证查询（执行后手工跑，确认行数增长）
-- ============================================================================
-- 按 crowd_code 统计触发规则数：
--   select crowd_code, count(*) from public.food_crowd_triggers group by 1 order by 1;
-- 抽查儿童档 forbidden/advise_against：
--   select * from public.food_crowd_triggers where crowd_code='children' and severity in ('advise_against','forbidden') order by trigger_keyword;
-- ============================================================================
