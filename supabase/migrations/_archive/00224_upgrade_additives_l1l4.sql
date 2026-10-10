-- ============================================================
-- 00224 · 添加剂风险分级统一为 L1-L4（模块二核心壁垒）
--   + 补 PRD 2.2 字段（国标编号/使用范围/限量标准/敏感人群/固定文案/禁忌搭配）
-- 执行：supabase db query --linked --file supabase/migrations/00224_upgrade_additives_l1l4.sql
-- 注意顺序：先删旧约束 → 迁移旧值 → 再加新约束（否则 ADD CONSTRAINT 会因旧值报错回滚）
-- ============================================================

-- 1) 去掉旧 white/yellow/black 约束（若存在）
ALTER TABLE public.food_additives DROP CONSTRAINT IF EXISTS food_additives_risk_level_check;

-- 2) 先把旧值迁移为 L1-L4（此刻无约束，可自由改）
--    white→L2(常规合规) / yellow→L3(敏感控量) / black→L4(老幼弱少吃)
--    L1(纯天然无风险) 保留给明确天然来源的条目，由运营在后台手动指定。
UPDATE public.food_additives
SET risk_level = CASE risk_level
  WHEN 'white'  THEN 'L2'
  WHEN 'yellow' THEN 'L3'
  WHEN 'black'  THEN 'L4'
  ELSE COALESCE(NULLIF(risk_level, ''), 'L2')
END
WHERE risk_level IS NULL OR risk_level IN ('white','yellow','black','');

-- 3) 再加 L1-L4 约束（此时数据已全部合规）
ALTER TABLE public.food_additives
  ADD CONSTRAINT food_additives_risk_level_check
  CHECK (risk_level IN ('L1','L2','L3','L4'));

-- 4) 补 PRD 2.2 字段
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS gb_number          text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS usage_scope        text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS limit_standard     text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS sensitive_crowds   text[] not null default '{}';
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS fixed_tip          text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS forbidden_pairings text[] not null default '{}';

-- 5) 给现有种子补默认合规文案（固定，不可人工随意改）
UPDATE public.food_additives
SET limit_standard = '按 GB2760 最大使用量使用',
    fixed_tip      = '在国家标准允许范围内使用，正常食用无安全风险。',
    sensitive_crowds = '{}',
    forbidden_pairings = '{}'
WHERE fixed_tip IS NULL;

-- 6) 个别精细化（敏感人群提示）
UPDATE public.food_additives
SET fixed_tip = '婴幼儿（36月龄内）建议少用合成色素类添加剂。',
    sensitive_crowds = ARRAY['儿童']
WHERE name IN ('胭脂红','柠檬黄','日落黄','糖精钠','人工香精');

UPDATE public.food_additives
SET fixed_tip = '含反式脂肪酸，婴幼儿禁用、成人应严格控制摄入。',
    sensitive_crowds = ARRAY['儿童','老年']
WHERE name = '部分氢化植物油';

UPDATE public.food_additives
SET fixed_tip = '肉制品护色剂，过量有毒性，婴幼儿严禁食用。',
    sensitive_crowds = ARRAY['儿童']
WHERE name = '亚硝酸盐';

UPDATE public.food_additives
SET fixed_tip = '人工甜味剂，苯丙酮尿症患者禁用。',
    sensitive_crowds = ARRAY['儿童']
WHERE name = '阿斯巴甜';
