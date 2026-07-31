-- ============================================================
-- 来电有喜 · 食疗商品模块 · 全局食材字典表（系统内核：一劳永逸模板）
-- ------------------------------------------------------------
-- 用途：所有商品上传时「输入食材名 → 自动拉取属性 → 合并计算性味/过敏原/
--       人群/慢病标签 → 自动生成安全分析文案与商品属性」。新增食材由后台维护，
--       关联商品在前端按实时引擎计算，天然「全平台自动更新食疗参数」。
-- 对齐用户规格（2026-07-31 食疗商品系统化方案）：
--   食材名 / 性味 / 基础作用 / 适配场景 / 禁忌人群 / 过敏原 / 慢病适配标签 / 搭配中和
-- 执行：Supabase SQL Editor 全量粘贴运行；幂等可重复执行。
-- ============================================================

create table if not exists public.food_ingredients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,        -- 食材名：番茄 / 鸡蛋 / 党参
  nature        text not null,               -- 性味枚举：大寒/寒凉/凉/微凉/平性/微温/温/温热/大热
  base_effect   text,                        -- 基础作用（合规食养描述，无医疗词）
  fit_scenes    text,                        -- 适配场景
  caution_crowds text,                       -- 禁忌人群（逗号分隔）
  allergens     text[] default '{}',          -- 过敏原标签：无 / 蛋类 / 乳制品 / 海鲜 / 坚果 ...
  chronic_tags  text[] default '{}',          -- 慢病适配标签：高血压友好 / 减脂友好 / 儿童营养 ...
  neutralize    text,                        -- 搭配中和食材（如凉性番茄搭配生姜中和寒气）
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_food_ingredients_name on public.food_ingredients (name);
create index if not exists idx_food_ingredients_active on public.food_ingredients (is_active, sort_order);

-- ============================================================
-- 种子数据（用户方案示例：番茄 + 鸡蛋；运营可在 admin 直接增改，无需改代码）
-- ============================================================
insert into public.food_ingredients
  (name, nature, base_effect, fit_scenes, caution_crowds, allergens, chronic_tags, neutralize, sort_order)
values
  ('番茄', '凉',
   '生津止渴、补充维C、开胃促食欲',
   '日常饮食、夏季燥热、食欲不振',
   '脾胃虚寒、经期量大、怕冷体虚人群少食',
   '{}',
   array['高血压友好','减脂友好'],
   '生姜', 1),
  ('鸡蛋', '平',
   '补充优质蛋白、补虚固本、日常营养补给',
   '全年龄段日常三餐',
   '蛋类过敏、高胆固醇人群控量食用',
   array['蛋类'],
   array['高血压适量食用','儿童补充营养'],
   '', 2)
on conflict (name) do update set
  nature        = excluded.nature,
  base_effect   = excluded.base_effect,
  fit_scenes    = excluded.fit_scenes,
  caution_crowds= excluded.caution_crowds,
  allergens     = excluded.allergens,
  chronic_tags  = excluded.chronic_tags,
  neutralize    = excluded.neutralize,
  sort_order    = excluded.sort_order,
  is_active     = true;

-- ============================================================
-- RLS：MVP 阶段公开读、认证用户可写（与 food_additives / food_crowd_* 一致）；
--       生产建议收敛到 is_admin() / service_role。
-- ============================================================
alter table public.food_ingredients enable row level security;

drop policy if exists "fi_read"  on public.food_ingredients;
drop policy if exists "fi_write" on public.food_ingredients;

create policy "fi_read"  on public.food_ingredients
  for select using (true);
create policy "fi_write" on public.food_ingredients
  for all using (true) with check (true);
