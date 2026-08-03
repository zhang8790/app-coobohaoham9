-- ============================================================
-- 战略支柱②：家庭档案 · 一户一档（绑定家庭锁死用户）
-- ------------------------------------------------------------
-- 目的：让用户把全家（本人 + 家人）的体质 / 过敏史 / 饮食周期 / 过往购买食养方案
--       沉淀到本平台，拉高迁移成本，形成壁垒价值真正落地的载体。
-- 合规：成员维度全部走中性食养参考话术，严禁「治疗 / 降血压」等医疗宣称（见 compliance/shield 红线）。
-- RLS：families / family_members 均按 owner_id 归属；客户端禁止越权读写他人家庭。
-- 注意：本迁移无函数体，纯 DDL + 策略；与 20260802_medicinal_food_catalog 互不依赖。
-- ============================================================

-- 1) 家庭（一户一档）：每个 owner 仅一条，owner_id 唯一
create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null default '我的家庭',
  created_at timestamptz not null default now(),
  constraint families_owner_unique unique (owner_id)
);

comment on table public.families is '家庭档案（一户一档）：仅归属 owner 可读写，绑定家庭拉高迁移成本';

-- 2) 家庭成员结构化画像：中性食养参考维度，不替代医嘱
create table if not exists public.family_members (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  age_group         text,                                  -- 儿童/青少年/成人/孕哺期/老年
  gender            text,                                  -- 男/女/不填
  constitution_type text,                                  -- 中医九种体质或沿用 13 人群标签
  allergies          text[] not null default '{}',         -- allergen-dictionary key 列表
  chronic_conditions text[] not null default '{}',         -- HEALTH_CROWD_OPTIONS
  body_states        text[] not null default '{}',         -- BODY_CROWD_OPTIONS
  health_goals       text[] not null default '{}',         -- 控糖/护胃/助眠/补血/抗疲劳/减脂/清热
  diet_cycle         jsonb,                                -- 中性「饮食周期/节奏」(控糖周期/经期节奏/作息)，不涉病症
  avatar_color       text,                                 -- 家庭成员卡片配色（前端用）
  notes              text,                                 -- 自由备注（中性食养偏好，非病历）
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.family_members is '家庭成员结构化画像（中性食养参考维度，仅作食养参考不替代医嘱）';

-- 3) RLS：owner 级归属
alter table public.families enable row level security;
alter table public.family_members enable row level security;

drop policy if exists families_owner_all on public.families;
create policy families_owner_all on public.families
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists family_members_owner_all on public.family_members;
create policy family_members_owner_all on public.family_members
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 4) 索引
create index if not exists idx_families_owner on public.families (owner_id);
create index if not exists idx_family_members_family on public.family_members (family_id);
create index if not exists idx_family_members_owner on public.family_members (owner_id);
