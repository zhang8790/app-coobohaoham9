-- ============================================================
-- 00225 · 食疗人群匹配标签规则表 food_tag_rules（模块三核心变现壁垒）
--   每个用户标签 → 优先/规避配料清单 + 适配品类 + 权重
--   运营在后台「权重微调面板」可改，无需改代码。
-- 执行：supabase db query --linked --file supabase/migrations/00225_food_tag_rules.sql
-- ============================================================

create table if not exists public.food_tag_rules (
  tag_key            text primary key,
  label              text not null,
  group_name         text,
  prefer_ingredients text[] not null default '{}',
  avoid_ingredients  text[] not null default '{}',
  prefer_categories  text[] not null default '{}',
  weight_prefer      int  not null default 15,
  weight_avoid       int  not null default 25,
  status             text not null default 'active' check (status in ('active','inactive')),
  created_at         timestamptz not null default now()
);
create index if not exists idx_ftr_status on public.food_tag_rules (status);

alter table public.food_tag_rules enable row level security;
drop policy if exists "ftr_read"  on public.food_tag_rules;
drop policy if exists "ftr_write" on public.food_tag_rules;
create policy "ftr_read"  on public.food_tag_rules for select using (true);
create policy "ftr_write" on public.food_tag_rules for all    using (true) with check (true);

-- 种子：PRD 3.1 九大用户标签（无诊断行为，仅配料匹配筛选）
insert into public.food_tag_rules
  (tag_key, label, group_name, prefer_ingredients, avoid_ingredients, weight_prefer, weight_avoid)
values
  ('children_picky',  '儿童挑食',     '儿童',   ARRAY['天然','果汁','蛋白','钙','铁','锌','膳食纤维'],           ARRAY['人工色素','人工香精','反式脂肪'],                     18, 20),
  ('children_spleen', '儿童脾胃弱',   '儿童',   ARRAY['山药','小米','麦芽','益生菌','膳食纤维'],                   ARRAY['人工色素','反式脂肪','高钠'],                         18, 22),
  ('children_heat',   '儿童易上火',   '儿童',   ARRAY['梨','百合','绿豆','天然'],                                 ARRAY['白砂糖','蔗糖','果葡糖浆','人工色素','香精'],             18, 24),
  ('office_damp',     '上班族湿气重', '成人',   ARRAY['薏米','赤小豆','茯苓','膳食纤维','天然'],                   ARRAY['高糖','油腻','植脂末','反式脂肪'],                     16, 22),
  ('stayup_weak',     '熬夜体虚',     '成人',   ARRAY['蛋白','B族维生素','天然','铁'],                             ARRAY['高钠','人工色素','反式脂肪'],                         16, 20),
  ('elder_sugar',     '中老年控糖',   '中老年', ARRAY['无糖','膳食纤维','蛋白','三氯蔗糖'],                       ARRAY['白砂糖','蔗糖','果葡糖浆','糖精钠','麦芽糖'],           20, 26),
  ('elder_bp',        '中老年控血压', '中老年', ARRAY['低钠','钾','膳食纤维','天然'],                             ARRAY['钠','盐','亚硝酸盐','高钠'],                           20, 26),
  ('weak_cough',      '体虚易咳',     '成人',   ARRAY['梨','百合','天然','蛋白'],                                 ARRAY['人工香精','人工色素','高钠'],                         16, 22),
  ('diet_calorie',    '减脂控卡',     '成人',   ARRAY['高蛋白','膳食纤维','0糖','天然'],                           ARRAY['白砂糖','蔗糖','植脂末','反式脂肪','果葡糖浆'],         20, 26)
on conflict (tag_key) do nothing;
