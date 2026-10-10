-- ============================================================
-- 科目化分类（食养科目）
-- ------------------------------------------------------------
-- 替代传统物理品类（零食/饮料/生鲜），作为 C 端浏览主分类。
-- 科目按「食养功效 / 人群 / 场景」组织（脾胃调理 / 安神助眠 / 清火润燥 …），
-- 可自动派生（subject-derive）+ 运营后台可改，支持门店自定义（scope='store'）。
-- 复用门店隔离：store_id 关联 stores，门店自定义科目随店隔离。
-- ============================================================

create table if not exists public.product_subjects (
  id          uuid        primary key default gen_random_uuid(),
  key         text        not null unique,
  name        text        not null,
  icon        text,
  description text,
  sort_order  int         not null default 0,
  scope       text        not null default 'global' check (scope in ('global', 'store')),
  store_id    uuid        references public.stores(id) on delete cascade,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_product_subjects_scope_active
  on public.product_subjects (scope, is_active, sort_order);

-- products 冗余 subject_keys（类同 mood_tags/scene_tags 设计，支撑 .overlaps 快速过滤）
alter table public.products add column if not exists subject_keys text[] not null default '{}';
create index if not exists idx_products_subject_keys on public.products using gin (subject_keys);

-- RLS：科目为展示标签，全局科目对所有人可读；写策略与 food 库一致（后台管理，低敏感）
alter table public.product_subjects enable row level security;

drop policy if exists "ps_read" on public.product_subjects;
create policy "ps_read" on public.product_subjects
  for select using (true);

drop policy if exists "ps_all" on public.product_subjects;
create policy "ps_all" on public.product_subjects
  for all using (true) with check (true);

-- 种子全局科目（运营可后台改 name/icon/上下架；key 稳定用于派生与过滤）
insert into public.product_subjects (key, name, icon, description, sort_order, scope, is_active)
values
  ('spleen', '脾胃调理', '🌾', '温中散寒 · 健脾养胃 · 消食化积', 10, 'global', true),
  ('sleep',  '安神助眠', '🌙', '舒缓安适 · 安神助眠',            20, 'global', true),
  ('heat',   '清火润燥', '❄️', '清热降火 · 滋阴润燥 · 润养舒喉', 30, 'global', true),
  ('damp',   '祛湿消肿', '💧', '利水消肿 · 祛湿轻体',            40, 'global', true),
  ('women',  '女性调理', '🌸', '补气养血 · 经期温养',            50, 'global', true),
  ('kids',   '儿童成长', '🧒', '益智成长 · 温和营养',            60, 'global', true),
  ('season', '节气时令', '🍂', '当季时令 · 顺时养生',            70, 'global', true),
  ('sugar',  '控糖轻食', '🥗', '低糖轻食 · 膳食管理',            80, 'global', true)
on conflict (key) do nothing;
