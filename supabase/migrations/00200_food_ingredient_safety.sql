-- ============================================================
-- 食品配料安全管理系统 · 食品域 V1.0 全量表（基于现有 Supabase 后端）
-- 复用来电有喜既有 supabase 客户端；异业共享会员联盟不在此文件，按规划剔除。
-- 二级分销复用来电有喜既有模型，不重复建表。
--
-- 客户端使用 anon key，故 RLS 对 anon 开放所需读写；
--   生产环境建议将写操作收敛到 Edge Function（service_role）后再收紧。
-- 执行方式：在 Supabase SQL Editor 全量粘贴运行。
--
-- ⚠️ 若先前误执行过「食养语义版 00200」（含 ingredients/product_ingredients 表），
--    本脚本开头会 DROP 这两个旧表后重建为下方安全库结构，避免命名/字段冲突。
-- ============================================================

-- 清理上一版（食养语义）误建表，防止与下方 food_additives 冲突
drop table if exists public.product_ingredients cascade;
drop table if exists public.ingredients cascade;

-- ---------- 1. 配料安全库 food_additives（壁垒资产：白/黄/黑 + 国标）----------
create table if not exists public.food_additives (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text,                              -- 防腐剂/色素/增稠剂/甜味剂/香精/营养强化剂/其他
  risk_level  text not null default 'white'
              check (risk_level in ('white','yellow','black')),
  age_limit   int,                               -- 最小适用年龄（月），NULL=全龄
  gb_std      text,                              -- 国标依据，如 GB2760
  risk_desc   text,                              -- 风险说明文案
  source      text not null default 'preset'
              check (source in ('preset','auto')),
  status      text not null default 'active'
              check (status in ('active','pending_review')),
  created_by  uuid,
  reviewed_by uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_food_additives_name on public.food_additives (name);
create index if not exists idx_food_additives_risk on public.food_additives (risk_level);

-- ---------- 2. 配料别名 food_additive_aliases（俗称/异体映射）----------
create table if not exists public.food_additive_aliases (
  id          uuid primary key default gen_random_uuid(),
  additive_id uuid not null references public.food_additives(id) on delete cascade,
  alias       text not null,
  unique (additive_id, alias)
);
create index if not exists idx_faa_additive on public.food_additive_aliases (additive_id);

-- ---------- 3. 商品-配料关联 product_food_additives ----------
create table if not exists public.product_food_additives (
  product_id  uuid not null references public.products(id) on delete cascade,
  additive_id uuid not null references public.food_additives(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (product_id, additive_id)
);
create index if not exists idx_pfa_additive on public.product_food_additives (additive_id);

-- ---------- 4. 配料表 OCR 任务 ingredient_ocr_tasks ----------
create table if not exists public.ingredient_ocr_tasks (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid references public.products(id) on delete set null,
  store_id           uuid references public.stores(id) on delete set null,
  image_url          text not null,                -- 配料表原图（OCR 输入）
  raw_text           text,                         -- OCR 原始识别文本
  parsed_ingredients text[] default '{}',          -- 解析出的配料名列表
  matched_additives  text[] default '{}',          -- 已匹配安全库的配料名
  safety_grade       text check (safety_grade in ('S','A','C')),  -- 引擎初算安全评级
  status             text not null default 'pending'
                   check (status in ('pending','reviewing','approved','rejected')),
  reviewer_id        uuid,                         -- 复核人
  review_note        text,                         -- 复核意见
  risk_flags         text[] default '{}',          -- 风险标注（反式脂肪/高钠/致敏原…）
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_ocr_status on public.ingredient_ocr_tasks (status);
create index if not exists idx_ocr_store  on public.ingredient_ocr_tasks (store_id);

-- ---------- 5. 库存批次 stock_batches（入库质检 + 临期预警）----------
create table if not exists public.stock_batches (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  store_id    uuid references public.stores(id) on delete set null,
  batch_no    text,
  qty         int not null default 0,
  produced_at timestamptz,
  expire_at   timestamptz,                         -- 临期预警依据
  status      text not null default 'normal'
              check (status in ('normal','sold_out','expired','blocked')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_sb_product on public.stock_batches (product_id);
create index if not exists idx_sb_expire on public.stock_batches (expire_at);

-- ---------- 6. 库存汇总 inventories（按仓/车实时库存）----------
create table if not exists public.inventories (
  id         uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('warehouse','vehicle')),
  owner_id   uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  qty        int not null default 0,
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id, product_id)
);
create index if not exists idx_inv_owner on public.inventories (owner_type, owner_id);

-- ---------- 7. 流动车 vehicles ----------
create table if not exists public.vehicles (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid references public.stores(id) on delete set null,
  name       text not null,
  status     text not null default 'active'
             check (status in ('active','offline')),
  created_at timestamptz not null default now()
);
create index if not exists idx_vehicles_store on public.vehicles (store_id);

-- ---------- 8. 流动车调拨单 vehicle_transfers ----------
create table if not exists public.vehicle_transfers (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  type        text not null check (type in ('out','return','cross')),  -- 出库/回库/跨车
  product_id  uuid references public.products(id) on delete set null,
  qty         int not null default 0,
  operator_id uuid,                              -- 操作人（弱网可空，恢复后补）
  sync_status text not null default 'synced'
              check (sync_status in ('synced','pending')),  -- 弱网离线标记
  created_at  timestamptz not null default now()
);
create index if not exists idx_vt_vehicle on public.vehicle_transfers (vehicle_id);
create index if not exists idx_vt_sync on public.vehicle_transfers (sync_status);

-- ---------- 9. 会员摄入记录 intake_logs ----------
create table if not exists public.intake_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  product_id   uuid references public.products(id) on delete set null,
  product_name text,
  ingredients  text[] default '{}',               -- 摄入的配料名/key
  nature       text,                              -- 该餐整体性味
  health_tags  text[] default '{}',
  taken_at     timestamptz not null default now(),
  scene        text,                              -- 场景（熬夜/经期…）
  created_at   timestamptz not null default now()
);
create index if not exists idx_intake_user on public.intake_logs (user_id, taken_at desc);

-- ---------- 10. 会员健康画像 health_reports ----------
create table if not exists public.health_reports (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  period             text not null,               -- 统计周期，如 2026-07
  nature_distribution jsonb,                      -- 性味分布
  top_ingredients    text[] default '{}',
  risk_flags         text[] default '{}',         -- 累计风险（高钠/高糖…）
  advice             text,                         -- 食养建议（不替代医嘱）
  generated_at       timestamptz not null default now(),
  unique (user_id, period)
);
create index if not exists idx_health_user on public.health_reports (user_id, period);

-- ============================================================
-- RLS（anon key 模式：开放所需读写；生产建议收敛到 Edge Function）
-- ============================================================
alter table public.food_additives          enable row level security;
alter table public.food_additive_aliases   enable row level security;
alter table public.product_food_additives  enable row level security;
alter table public.ingredient_ocr_tasks    enable row level security;
alter table public.stock_batches           enable row level security;
alter table public.inventories             enable row level security;
alter table public.vehicles                enable row level security;
alter table public.vehicle_transfers       enable row level security;
alter table public.intake_logs             enable row level security;
alter table public.health_reports          enable row level security;

-- 配料安全库：公开可读；写开放（MVP，生产改 Edge Function）
create policy "food_additives_read"  on public.food_additives for select using (true);
create policy "food_additives_write" on public.food_additives for all    using (true) with check (true);

create policy "faa_all" on public.food_additive_aliases for all using (true) with check (true);
create policy "pfa_all" on public.product_food_additives for all using (true) with check (true);
create policy "ocr_all" on public.ingredient_ocr_tasks for all using (true) with check (true);

-- 库存/流动车：开放（MVP；理想按 auth.uid() 限定 store_id）
create policy "sb_all"  on public.stock_batches  for all using (true) with check (true);
create policy "inv_all" on public.inventories    for all using (true) with check (true);
create policy "veh_all" on public.vehicles       for all using (true) with check (true);
create policy "vt_all"  on public.vehicle_transfers for all using (true) with check (true);

-- 会员摄入 / 健康画像：开放（MVP；理想按 auth.uid() 限定 user_id）
create policy "intake_all" on public.intake_logs   for all using (true) with check (true);
create policy "health_all" on public.health_reports for all using (true) with check (true);

-- ============================================================
-- 示例种子（配料安全库核心条目；完整 500+ 由 shiyang-dictionary 批量导入脚本生成）
-- risk_level: white=安全可用 / yellow=限量使用 / black=婴幼儿禁用或禁用
-- ============================================================
insert into public.food_additives (name, category, risk_level, age_limit, gb_std, risk_desc, status) values
  ('山梨酸钾',     '防腐剂',   'white',  null, 'GB2760', '常见防腐剂，代谢快、低毒，按量使用安全',                  'active'),
  ('苯甲酸钠',     '防腐剂',   'yellow', null, 'GB2760', '防腐剂，与维C同存可能生成微量苯，需控量',               'active'),
  ('脱氢乙酸钠',   '防腐剂',   'yellow', null, 'GB2760', '防腐剂，2024版国标已收紧使用范围，注意限量',            'active'),
  ('胭脂红',       '色素',     'yellow', 36,   'GB2760', '合成色素，部分儿童敏感，建议3岁以下少用',                'active'),
  ('柠檬黄',       '色素',     'yellow', 36,   'GB2760', '合成色素，与多动行为关联存争议，婴幼儿限量',            'active'),
  ('日落黄',       '色素',     'yellow', 36,   'GB2760', '合成色素，建议3岁以下少用',                              'active'),
  ('糖精钠',       '甜味剂',   'yellow', 36,   'GB2760', '人工甜味剂，无营养，婴幼儿不建议',                      'active'),
  ('阿斯巴甜',     '甜味剂',   'yellow', null, 'GB2760', '人工甜味剂，苯丙酮尿症患者禁用',                        'active'),
  ('三氯蔗糖',     '甜味剂',   'white',  null, 'GB2760', '高倍甜味剂，无热量，目前认为安全',                      'active'),
  ('卡拉胶',       '增稠剂',   'white',  null, 'GB2760', '海藻提取增稠剂，食品级安全',                            'active'),
  ('明胶',         '增稠剂',   'white',  null, 'GB2760', '动物皮骨提取，常见安全',                                'active'),
  ('部分氢化植物油','反式脂肪','black',  null, 'GB28050','含反式脂肪酸，婴幼儿禁用、成人严控',                   'active'),
  ('亚硝酸盐',     '护色剂',   'black',  36,   'GB2760', '肉制品护色剂，过量有毒，婴幼儿严禁',                    'active'),
  ('人工香精',     '香精',     'yellow', 36,   'GB2760', '合成香精，部分儿童敏感，建议少用',                      'active')
on conflict (name) do nothing;
