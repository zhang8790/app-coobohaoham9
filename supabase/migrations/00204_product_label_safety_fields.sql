-- ============================================================
-- 00204 · 商品标签安全字段（全面安全分析的数据底座）
-- ------------------------------------------------------------
-- 为「全面安全分析（致敏原 / 营养成分 / 标签合规 / 适宜人群）」补充商品级
-- 结构化字段，使商品详情页可直读分析结果，而无需每次全文本重算。
-- 与 00200 安全库、00100 食养字段互补，均为 products 表可选列（缺省不影响旧商品）。
--
-- 执行方式：Supabase SQL Editor 全量粘贴运行（幂等，可重复执行）。
-- ============================================================

-- 1) 致敏原（声明/识别的致敏原 key，对应 allergen-dictionary 的 key）
alter table public.products
  add column if not exists allergens text[] default '{}'::text[];
comment on column public.products.allergens is
  '商品致敏原 key 列表（gluten/crustacean/fish/egg/peanut/soy/milk/tree_nut/sesame/mango/pineapple），来自商家标注或分析引擎识别';

-- 2) 营养成分（每 100g/100mL，结构化）
alter table public.products
  add column if not exists nutrition jsonb default '{}'::jsonb;
comment on column public.products.nutrition is
  '营养成分（每100g）：{energy_kj,protein_g,fat_g,carb_g,sugar_g,sodium_mg}，用于高糖/高钠/高脂评估';

-- 3) 标签合规信息 {score, present{}, missing[]}
alter table public.products
  add column if not exists label_info jsonb default '{}'::jsonb;
comment on column public.products.label_info is
  '标签合规完整度：{score:int, present:record, missing:text[]}，依据 GB 7718 必检项';

-- 4) 安全评级 S/A/C/D（引擎计算缓存）
alter table public.products
  add column if not exists safety_grade text
  check (safety_grade in ('S','A','C','D'));
comment on column public.products.safety_grade is
  '全面安全评级（引擎聚合添加剂+致敏原+营养+标签）：S较安全/A需注意/C含风险/D高风险';

-- 5) 分析报告缓存（完整 JSON，前端直读，避免重算）
alter table public.products
  add column if not exists safety_summary jsonb;
comment on column public.products.safety_summary is
  '全面安全分析报告完整缓存（ComprehensiveSafetyReport JSON），含 warnings/ageSuitability 等';

-- 索引（致敏原 GIN 便于按致敏原检索；safety_grade 普通索引）
create index if not exists idx_products_allergens on public.products using gin (allergens);
create index if not exists idx_products_safety_grade on public.products (safety_grade);

-- 注：products 表 RLS 沿用既有策略；新增列继承表级 RLS，无需单独建策略。
