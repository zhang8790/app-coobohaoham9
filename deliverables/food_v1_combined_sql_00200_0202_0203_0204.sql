-- ============================================================
-- 食品域 V1.0 · 一键执行包（修正版）
-- 合并：00200 + 00202 + 00203 + 00204（按依赖顺序）
--
-- ⚠️ 重要纠正：原计划的 "ocr_all" 不是独立文件，
--   它是 00200 里给 ingredient_ocr_tasks 表建的 RLS 策略名。
--   所以必须包含 00200，否则照片识别所需的任务表不存在。
--
-- 执行方式：在 Supabase SQL Editor 全量粘贴本文件一次运行即可。
-- 全部 CREATE TABLE IF NOT EXISTS / upsert，幂等，可重复执行。
-- 00201(合作伙伴重分类) 与食品/OCR 无关，未纳入本包。
-- ============================================================

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

-- 先 DROP 已存在的同名策略（幂等重跑：让脚本可重复执行）
drop policy if exists "food_additives_read"  on public.food_additives;
drop policy if exists "food_additives_write" on public.food_additives;
drop policy if exists "faa_all" on public.food_additive_aliases;
drop policy if exists "pfa_all" on public.product_food_additives;
drop policy if exists "ocr_all" on public.ingredient_ocr_tasks;
drop policy if exists "sb_all"  on public.stock_batches;
drop policy if exists "inv_all" on public.inventories;
drop policy if exists "veh_all" on public.vehicles;
drop policy if exists "vt_all"  on public.vehicle_transfers;
drop policy if exists "intake_all" on public.intake_logs;
drop policy if exists "health_all" on public.health_reports;

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
-- ============================================================
-- 00202_create_product_images_bucket.sql
-- 创建 product-images 存储桶（food-scan 拍照配料 OCR 用）
-- 根因：food-scan 拍照调用 uploadToStorage(bucket:'product-images')，
--       但该桶此前从未创建，导致上传报「存储桶不存在」。
-- 本迁移补齐 product-images 桶（公开读取）+ RLS 策略。幂等可重复执行。
-- ============================================================

-- 1. 创建 product-images 桶（公开读取）
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 公开读取策略（所有人可读取配料图片）
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- 3. 允许匿名与登录用户上传（C 端游客也可用拍照识别）
DROP POLICY IF EXISTS "product_images_anon_insert" ON storage.objects;
CREATE POLICY "product_images_anon_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'anon');

DROP POLICY IF EXISTS "product_images_auth_insert" ON storage.objects;
CREATE POLICY "product_images_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- 4. 登录用户可管理自己上传的文件
DROP POLICY IF EXISTS "product_images_auth_update" ON storage.objects;
CREATE POLICY "product_images_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "product_images_auth_delete" ON storage.objects;
CREATE POLICY "product_images_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.uid() = owner);

-- 提示：单张配料图通常 < 10MB，Supabase 默认 50MB 上限足够；
-- 如需调大，在 Supabase 控制台 Storage → product-images → 修改「文件大小上限」。

SELECT '✅ product-images 存储桶已就绪' AS result;
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
