-- 00205 结构化健康画像 + 扫描历史（健康画像驱动食疗推荐 · MVP 地基）
-- 依赖 00204（商品安全字段）。幂等，可重复执行。
-- 旧 profiles.constitution_tags（自由文本）保留兼容，本表为结构化升级。

-- ① 结构化健康画像（1:1 profiles）
create table if not exists user_health_profile (
  user_id            uuid primary key references profiles(id) on delete cascade,
  age_group          text,                                  -- 儿童/青少年/成人/孕哺期/老年
  gender             text,                                  -- 男/女/不填
  constitution_type  text,                                  -- 九种体质 或 沿用 13 人群标签
  allergies          text[] not null default '{}',          -- allergen-dictionary key
  chronic_conditions text[] not null default '{}',          -- HEALTH_CROWD_OPTIONS
  body_states        text[] not null default '{}',          -- BODY_CROWD_OPTIONS
  health_goals       text[] not null default '{}',          -- 控糖/护胃/助眠/补血/抗疲劳/减脂/清热
  privacy_flags      jsonb not null default '{"history_store":true,"cross_store_aggregate":false}',
  updated_at         timestamptz not null default now()
);
alter table user_health_profile enable row level security;
drop policy if exists "own profile" on user_health_profile;
create policy "own profile" on user_health_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ② 扫描历史（学习闭环：输入/解析/画像快照/tier/反馈）
create table if not exists user_scan_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id) on delete cascade,
  input_type       text,              -- text / photo / barcode
  raw_text         text,
  parsed           jsonb,             -- 添加剂/过敏原/营养/性味
  profile_snapshot jsonb,             -- 分析时画像快照（避免画像变更后历史失真）
  tier             text,              -- recommend/caution/avoid
  created_at       timestamptz not null default now()
);
create index if not exists idx_scan_history_user on user_scan_history(user_id, created_at desc);
alter table user_scan_history enable row level security;
drop policy if exists "own scan history" on user_scan_history;
create policy "own scan history" on user_scan_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
