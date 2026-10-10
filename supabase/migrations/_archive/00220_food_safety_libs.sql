-- ============================================================
-- 食品配料安全管理系统 · 模块补全迁移（建立在 00200/00203 基础之上）
-- ------------------------------------------------------------
-- 对齐用户最新规格（4 档评级 + 三张可维护基础表 + 标准报告 JSON）：
--   ① food_allergens        过敏原匹配库（8 类，触发过敏警示）
--   ② food_crowd_triggers   人群标签触发库（触发词 → crowd_code）
--   ③ food_crowd_tips       人群文案库（crowd_code → 食养提示文案）
--   ④ food_analysis_reports 标准报告持久化（绑定商品详情页）
--   ⑤ ingredient_ocr_tasks  扩展 safety_level(4档) + report_json
-- 说明：添加剂安全库 food_additives / 别名 food_additive_aliases 已由 00200/00203 建好，
--       本迁移仅补缺失的两张基础表 + 报告表 + ocr 任务扩展列，不重复建表。
-- RLS：MVP 阶段公开读、写开放（生产建议收敛到 Edge Function service_role）。
-- 执行：Supabase SQL Editor 全量粘贴运行；本脚本幂等可重复执行。
-- ============================================================

-- ---------- ① 过敏原匹配库 food_allergens ----------
create table if not exists public.food_allergens (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,        -- soy/sesame/peanut/wheat/dairy/shrimp/crab/nut
  name        text not null,               -- 大豆/芝麻/花生/小麦/乳制品/虾/蟹/坚果
  description text,                        -- 过敏提示说明
  crowd_code  text not null,               -- 命中后加载的人群提示 code（对应 food_crowd_tips）
  sort_order  int not null default 0
);
create index if not exists idx_food_allergens_key on public.food_allergens (key);

-- ---------- ② 人群标签触发库 food_crowd_triggers ----------
create table if not exists public.food_crowd_triggers (
  id               uuid primary key default gen_random_uuid(),
  trigger_keyword  text not null,          -- 配料名/关键词（如 谷氨酸钠 / 白砂糖 / 动物提取物）
  crowd_code       text not null,          -- 命中后加载的人群提示 code
  unique (trigger_keyword, crowd_code)
);
create index if not exists idx_fct_keyword on public.food_crowd_triggers (trigger_keyword);

-- ---------- ③ 人群文案库 food_crowd_tips ----------
create table if not exists public.food_crowd_tips (
  id           uuid primary key default gen_random_uuid(),
  crowd_code   text not null unique,       -- hypertension/hyperlipidemia/diabetes/gout/children/allergy_*
  label        text not null,              -- 高血压提示 / 糖尿病提示 / 大豆·芝麻过敏 ...
  general_tip  text,                       -- 一般人群提示文案（食养参考，不替代医嘱）
  children_tip text,                       -- 儿童专项提示
  fit_people   text,                       -- 适宜人群
  unfit_people text,                       -- 不适宜/需谨慎人群
  sort_order   int not null default 0
);
create index if not exists idx_fct_code on public.food_crowd_tips (crowd_code);

-- ---------- ④ 标准报告持久化 food_analysis_reports ----------
create table if not exists public.food_analysis_reports (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid references public.products(id) on delete set null,  -- 绑定商品详情
  source             text not null default 'manual'
                     check (source in ('manual','ocr','llm')),
  input_text         text,                 -- 原始录入/识别文本
  parsed_ingredients text[] default '{}',  -- 清洗后配料名列表
  additive_list      jsonb,                -- [{name,level,type,desc}] 标准输出
  allergen_list      jsonb,                -- [{key,name,crowd_code}] 命中过敏原
  crowd_tips         text[] default '{}',  -- 命中人群 code 列表
  safe_level         text,                 -- 中文档位：A优选 / A含限量成分 / B适度慎选 / C不推荐
  safe_level_code    text,                 -- 4档 code：A_preferred/A_limit/B_caution/C_avoid
  main_conclusion    jsonb,                -- {general,children,fit_people,unfit_people}
  health_shortboard_tip text,              -- 健康短板提示（个性化，结合 user_health_profile）
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create index if not exists idx_far_product on public.food_analysis_reports (product_id);
create index if not exists idx_far_created on public.food_analysis_reports (created_at desc);

-- ---------- ⑤ ingredient_ocr_tasks 扩展（4档评级 + 标准报告）----------
-- 保留原 safety_grade(S/A/C) 兼容旧 ocr-ingredient；新增 safety_level(4档) 与 report_json
alter table public.ingredient_ocr_tasks
  add column if not exists safety_level text
    check (safety_level in ('A_preferred','A_limit','B_caution','C_avoid'));
alter table public.ingredient_ocr_tasks
  add column if not exists report_json jsonb;

-- ============================================================
-- 种子数据（可后台维护：运营在 admin 直接改，无需改代码）
-- ============================================================

-- ① 过敏原库（8 类）
insert into public.food_allergens (key, name, description, crowd_code, sort_order) values
  ('soy',    '大豆',   '含大豆蛋白，部分人群过敏',                 'allergy_soy',    1),
  ('sesame', '芝麻',   '常见过敏原，儿童需关注',                   'allergy_sesame', 2),
  ('peanut', '花生',   '高致敏性坚果类，易引发急性过敏',           'allergy_peanut', 3),
  ('wheat',  '小麦',   '含麸质，乳糜泻/麸质不耐受人群忌',          'allergy_wheat',  4),
  ('dairy',  '乳制品', '含乳糖/乳蛋白，乳糖不耐或乳蛋白过敏忌',    'allergy_dairy',  5),
  ('shrimp', '虾',     '甲壳类水产，高致敏',                       'allergy_shrimp', 6),
  ('crab',   '蟹',     '甲壳类水产，高致敏',                       'allergy_crab',   7),
  ('nut',    '坚果',   '树坚果类（腰果/杏仁/核桃等），高致敏',     'allergy_nut',    8)
on conflict (key) do nothing;

-- ② 人群触发词 → crowd_code（对齐用户规格表）
insert into public.food_crowd_triggers (trigger_keyword, crowd_code) values
  ('谷氨酸钠',   'hypertension'),
  ('食用盐',     'hypertension'),
  ('氯化钠',     'hypertension'),
  ('植物油',     'hyperlipidemia'),
  ('白砂糖',     'hyperlipidemia'),
  ('麦芽糖浆',   'hyperlipidemia'),
  ('白砂糖',     'diabetes'),
  ('果葡糖浆',   'diabetes'),
  ('淀粉',       'diabetes'),
  ('麦芽糖',     'diabetes'),
  ('动物提取物', 'gout'),
  ('高嘌呤原料', 'gout')
on conflict (trigger_keyword, crowd_code) do nothing;

-- ③ 人群文案库（食养参考，不替代医嘱；合规：禁医疗宣称/绝对化）
insert into public.food_crowd_tips (crowd_code, label, general_tip, children_tip, fit_people, unfit_people, sort_order) values
  ('hypertension', '高血压提示', '含钠偏高，建议适量食用、日常关注血压。', '儿童饮食宜清淡，控制含盐配料摄入。', '无相关禁忌的一般人群', '高血压人群（需限量、关注钠摄入）', 1),
  ('hyperlipidemia', '高血脂/代谢偏弱提示', '含添加糖或油脂类配料偏多，建议适量、搭配运动。', '儿童应控制添加糖与油脂摄入，避免偏好甜食。', '代谢正常、活动量充足人群', '高血脂/代谢偏弱人群（建议限量）', 2),
  ('diabetes', '糖尿病人群提示', '含添加糖/精制碳水，易引起血糖波动，建议少量或避开。', '儿童控糖同样重要，减少含糖配料摄入。', '血糖平稳、无禁忌人群', '糖尿病人群（慎用，关注碳水与糖）', 3),
  ('gout', '痛风提示', '含高嘌呤/动物提取物，可能诱发尿酸升高，建议限量。', '儿童一般少见，但痛风家族史需留意。', '尿酸正常人群', '痛风/高尿酸人群（慎用高嘌呤配料）', 4),
  ('children', '儿童提示', '整体可适量食用，仍建议家长酌情、避免过量。', '儿童肠胃与代谢未完善，少量多样、家长把关。', '无相关过敏/禁忌的儿童', '对配料存在过敏或禁忌的儿童', 5),
  ('allergy_soy',    '大豆过敏提示',   '配料含大豆成分，过敏人群请避开。', '婴幼儿大豆过敏常见，请严格规避。', '无大豆过敏的一般人群', '对大豆过敏人群', 11),
  ('allergy_sesame', '芝麻过敏提示',   '配料含芝麻成分，过敏人群请避开。', '儿童芝麻过敏需家长把关。',       '无芝麻过敏的一般人群', '对芝麻过敏人群', 12),
  ('allergy_peanut', '花生过敏提示',   '配料含花生，高致敏，过敏人群严禁。', '儿童花生过敏风险高，严禁接触。', '无花生过敏的一般人群', '对花生过敏人群（严禁）', 13),
  ('allergy_wheat',  '小麦/麸质提示',  '配料含小麦（麸质），乳糜泻人群忌。', '儿童麸质不耐受需规避。',       '无麸质禁忌的一般人群', '乳糜泻/麸质不耐受人群', 14),
  ('allergy_dairy',  '乳制品过敏提示', '配料含乳制品，乳糖不耐/乳蛋白过敏忌。', '儿童乳糖不耐常见，注意选择。', '无乳制品过敏的一般人群', '乳糖不耐/乳蛋白过敏人群', 15),
  ('allergy_shrimp', '虾类过敏提示',   '配料含虾（甲壳类），过敏人群忌。',   '儿童甲壳类过敏需规避。',       '无虾类过敏的一般人群', '对虾过敏人群', 16),
  ('allergy_crab',   '蟹类过敏提示',   '配料含蟹（甲壳类），过敏人群忌。',   '儿童甲壳类过敏需规避。',       '无蟹类过敏的一般人群', '对蟹过敏人群', 17),
  ('allergy_nut',    '坚果过敏提示',   '配料含坚果，高致敏，过敏人群严禁。', '儿童坚果过敏风险高，严禁接触。', '无坚果过敏的一般人群', '对坚果过敏人群（严禁）', 18)
on conflict (crowd_code) do nothing;

-- ============================================================
-- RLS
-- ============================================================
alter table public.food_allergens       enable row level security;
alter table public.food_crowd_triggers  enable row level security;
alter table public.food_crowd_tips      enable row level security;
alter table public.food_analysis_reports enable row level security;

drop policy if exists "fa_read"  on public.food_allergens;
drop policy if exists "fct_read" on public.food_crowd_triggers;
drop policy if exists "fctip_read" on public.food_crowd_tips;
drop policy if exists "far_all"  on public.food_analysis_reports;
drop policy if exists "fa_all"  on public.food_allergens;
drop policy if exists "fct_all" on public.food_crowd_triggers;
drop policy if exists "fctip_all" on public.food_crowd_tips;

-- MVP：三库 + 报告表开放读写（与 food_additives 一致）；生产建议收敛到 Edge Function / is_admin()
create policy "fa_all"    on public.food_allergens        for all using (true) with check (true);
create policy "fct_all"   on public.food_crowd_triggers   for all using (true) with check (true);
create policy "fctip_all" on public.food_crowd_tips       for all using (true) with check (true);
create policy "far_all"   on public.food_analysis_reports for all using (true) with check (true);
