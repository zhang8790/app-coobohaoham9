-- ============================================
-- 来店有喜 V4：多区域差异化分类 + 多城市自营门店LBS定位
-- 红包/实物引流 + 二级分销合规方案
-- 实施原则：扩展现有表，不创建V2新表
-- ============================================

-- 启用UUID扩展
create extension if not exists "uuid-ossp";

-- ============================================
-- 1. 城市信息表（新增，用于多区域运营）
-- ============================================
create table if not exists public.cities (
  id uuid primary key default uuid_generate_v4(),
  city_code varchar(20) unique not null,        -- 城市编码（如：331082）
  city_name varchar(100) not null,             -- 城市名称（如：台州临海）
  province varchar(100),                        -- 省份
  lng numeric(10,6),                          -- 城市中心经度
  lat numeric(10,6),                          -- 城市中心纬度
  geo_hash varchar(12),                        -- 城市中心GeoHash
  status varchar(20) default 'active',         -- active/inactive
  config_json jsonb default '{}',              -- 城市配置（让利区间、红包面额等）
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.cities is '城市信息表（每个城市独立隔离数据）';

-- 启用RLS
alter table public.cities enable row level security;
drop policy if exists "Allow all" on public.cities;
create policy "Allow all" on public.cities for all using (true) with check (true);

-- 索引
create index if not exists idx_cities_code on public.cities(city_code);
create index if not exists idx_cities_status on public.cities(status);

-- ============================================
-- 2. 商圈/网格表（新增）
-- ============================================
create table if not exists public.business_districts (
  id uuid primary key default uuid_generate_v4(),
  city_id uuid references public.cities(id) on delete cascade,
  district_name varchar(100) not null,        -- 区/县名称
  business_type varchar(50),                   -- 商圈类型：市中心/居民区/工业区/写字楼
  center_lng numeric(10,6),                   -- 商圈中心经度
  center_lat numeric(10,6),                    -- 商圈中心纬度
  geo_hash varchar(12),                        -- 商圈中心GeoHash
  radius_km int default 3,                     -- 辐射半径（公里）
  status varchar(20) default 'active',
  created_at timestamptz default now()
);

comment on table public.business_districts is '商圈/网格表（城市下拆分商圈，精细化运营）';

alter table public.business_districts enable row level security;
drop policy if exists "Allow all" on public.business_districts;
create policy "Allow all" on public.business_districts for all using (true) with check (true);

create index if not exists idx_districts_city on public.business_districts(city_id);

-- ============================================
-- 3. 自营门店表（新增，含LBS坐标）
-- ============================================
create table if not exists public.self_operated_stores (
  id uuid primary key default uuid_generate_v4(),
  store_code varchar(50) unique not null,       -- 门店编码
  store_name varchar(200) not null,             -- 门店名称
  city_id uuid references public.cities(id) on delete set null,
  district_id uuid references public.business_districts(id) on delete set null,
  lng numeric(10,6) not null,                  -- 经度（GCJ02坐标系）
  lat numeric(10,6) not null,                  -- 纬度（GCJ02坐标系）
  geo_hash varchar(12),                         -- GeoHash（用于粗筛）
  geo_hash_6 varchar(12),                       -- GeoHash 6位（约1.2km精度）
  address text,                                  -- 详细地址
  service_radius int default 5,                  -- 辐射服务半径（公里）
  business_hours jsonb default '{}',            -- 营业时段
  distance_sort_weight int default 100,         -- 距离权重（用于排序）
  status varchar(20) default 'active',          -- active/inactive/renovation
  phone varchar(20),                            -- 门店电话
  images text[],                                 -- 门店图片
  description text,                             -- 门店描述
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.self_operated_stores is '自营门店表（含标准GCJ02坐标，用于LBS就近匹配）';

alter table public.self_operated_stores enable row level security;
drop policy if exists "Allow all" on public.self_operated_stores;
create policy "Allow all" on public.self_operated_stores for all using (true) with check (true);

-- 索引（LBS查询优化）
create index if not exists idx_stores_city on public.self_operated_stores(city_id);
create index if not exists idx_stores_status on public.self_operated_stores(status);
create index if not exists idx_stores_geohash on public.self_operated_stores(geo_hash_6);

-- ============================================
-- 4. 扩展现有 products 表（增加城市/商圈字段）
-- ============================================
alter table public.products add column if not exists city_id uuid references public.cities(id) on delete set null;
alter table public.products add column if not exists district_id uuid references public.business_districts(id) on delete set null;
alter table public.products add column if not exists self_store_id uuid references public.self_operated_stores(id) on delete set null;
alter table public.products add column if not exists city_price numeric(10,2);  -- 城市独立售价
alter table public.products add column if not exists city_stock int default 0;   -- 城市独立库存
alter table public.products add column if not exists commission_rate_l1 int;      -- 城市独立一级分佣比例
alter table public.products add column if not exists commission_rate_l2 int;      -- 城市独立二级分佣比例

comment on column public.products.city_id is 'NULL=全国可见，非NULL=仅该城市可见';

create index if not exists idx_products_city on public.products(city_id);
create index if not exists idx_products_self_store on public.products(self_store_id);

-- ============================================
-- 5. 扩展现有 categories 表（增加城市字段）
-- ============================================
alter table public.categories add column if not exists city_id uuid references public.cities(id) on delete cascade;
alter table public.categories add column if not exists category_level int default 1;  -- 1:全国 2:城市自定义 3:商圈标签
alter table public.categories add column if not exists is_national boolean default false;  -- 是否全国通用

comment on column public.categories.city_id is 'NULL=全国通用分类，非NULL=城市自定义分类';

create index if not exists idx_categories_city on public.categories(city_id);

-- ============================================
-- 6. 红包/实物营销工具表（新增）
-- ============================================
create table if not exists public.marketing_campaigns (
  id uuid primary key default uuid_generate_v4(),
  campaign_type varchar(20) not null,            -- 'redpacket' / 'physical_gift'
  city_id uuid references public.cities(id) on delete cascade,
  store_id uuid references public.self_operated_stores(id) on delete cascade,
  campaign_name varchar(200) not null,          -- 活动名称
  gift_name varchar(200),                        -- 实物名称（实物类型时必填）
  gift_value numeric(10,2),                     -- 红包金额/实物价值
  gift_stock int default 0,                       -- 库存数量
  gift_claimed int default 0,                    -- 已领取数量
  min_consumption numeric(10,2) default 10,      -- 最低消费门槛（激活分佣）
  valid_hours int default 72,                     -- 核销有效期（小时）
  funding_source varchar(20) default 'merchant',  -- merchant/platform
  status varchar(20) default 'active',           -- active/paused/ended
  start_time timestamptz default now(),
  end_time timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.marketing_campaigns is '红包/实物营销工具表（按城市/门店隔离，独立台账）';

alter table public.marketing_campaigns enable row level security;
drop policy if exists "Allow all" on public.marketing_campaigns;
create policy "Allow all" on public.marketing_campaigns for all using (true) with check (true);

create index if not exists idx_campaigns_city on public.marketing_campaigns(city_id);
create index if not exists idx_campaigns_store on public.marketing_campaigns(store_id);

-- ============================================
-- 7. 红包/实物领取记录表（新增，溯源轨迹）
-- ============================================
create table if not exists public.user_campaign_claims (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  store_id uuid references public.self_operated_stores(id) on delete set null,
  claim_type varchar(20) not null,               -- 'redpacket' / 'physical_gift'
  claim_amount numeric(10,2),                    -- 领取金额/价值
  is_activated boolean default false,              -- 是否激活（到店消费后激活）
  activated_at timestamptz,                       -- 激活时间
  order_id uuid,                                  -- 激活对应的订单ID
  referrer_id uuid references public.profiles(id) on delete set null,  -- 推荐人ID
  referrer_relation varchar(10),                  -- 推荐关系：'l1' / 'l2'
  ip_address inet,                                 -- 领取时IP
  device_id varchar(200),                          -- 设备ID（防羊毛党）
  created_at timestamptz default now()
);

comment on table public.user_campaign_claims is '红包/实物领取记录表（仅记录推荐轨迹，无收益；到店消费后激活分佣）';

alter table public.user_campaign_claims enable row level security;
drop policy if exists "Allow all" on public.user_campaign_claims;
create policy "Allow all" on public.user_campaign_claims for all using (true) with check (true);

create index if not exists idx_claims_user on public.user_campaign_claims(user_id);
create index if not exists idx_claims_campaign on public.user_campaign_claims(campaign_id);
create index if not exists idx_claims_referrer on public.user_campaign_claims(referrer_id);

-- ============================================
-- 8. 扩展现有 commissions 表（增加城市/门店/营销字段）
-- ============================================
alter table public.commissions add column if not exists city_id uuid references public.cities(id) on delete set null;
alter table public.commissions add column if not exists store_id uuid references public.self_operated_stores(id) on delete set null;
alter table public.commissions add column if not exists commission_type varchar(20) default 'consumption';  -- 'consumption' / 'redpacket' / 'physical_gift'
alter table public.commissions add column if not exists is_from_campaign boolean default false;  -- 是否来自红包/实物激活
alter table public.commissions add column if not exists campaign_claim_id uuid references public.user_campaign_claims(id) on delete set null;

comment on column public.commissions.commission_type is '佣金类型：consumption=消费分佣，redpacket=红包激活，physical_gift=实物激活';

create index if not exists idx_commissions_city on public.commissions(city_id);
create index if not exists idx_commissions_store on public.commissions(store_id);

-- ============================================
-- 9. 风控日志表（新增）
-- ============================================
create table if not exists public.risk_control_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  risk_type varchar(50) not null,                -- 'device_match' / 'ip_match' / 'order_spike'
  risk_level varchar(20) default 'medium',        -- low/medium/high
  trigger_value text,                             -- 触发值（如：同一设备ID）
  action_taken varchar(50),                       -- 'block' / 'warn' / 'pause_campaign'
  related_order_id uuid,
  related_campaign_id uuid,
  is_resolved boolean default false,
  created_at timestamptz default now()
);

comment on table public.risk_control_logs is '风控日志表（全链路日志留存10年，应对核查）';

alter table public.risk_control_logs enable row level security;
drop policy if exists "Allow all" on public.risk_control_logs;
create policy "Allow all" on public.risk_control_logs for all using (true) with check (true);

-- ============================================
-- 10. 函数：计算两点距离（半正矢公式，返回公里）
-- ============================================
create or replace function public.calculate_distance_km(
  lat1 numeric, lng1 numeric,
  lat2 numeric, lng2 numeric
) returns numeric as $$
declare
  r numeric := 6371;  -- 地球半径（公里）
  dlat numeric;
  dlng numeric;
  a numeric;
  c numeric;
begin
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2)^2;
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  return r * c;
end;
$$ language plpgsql immutable;

comment on function public.calculate_distance_km is '计算两点距离（半正矢公式，返回公里）';

-- ============================================
-- 11. 函数：查找就近门店（LBS核心算法）
-- ============================================
create or replace function public.find_nearest_stores(
  p_lat numeric, p_lng numeric,
  p_city_id uuid default null,
  p_max_distance_km int default 5,
  p_limit int default 20
) returns table (
  store_id uuid,
  store_name varchar(200),
  address text,
  distance_km numeric,
  is_open boolean
) as $$
begin
  return query
  select 
    s.id as store_id,
    s.store_name,
    s.address,
    public.calculate_distance_km(p_lat, p_lng, s.lat, s.lng) as distance_km,
    case when s.status = 'active' then true else false end as is_open
  from public.self_operated_stores s
  where 
    s.status = 'active'
    and (p_city_id is null or s.city_id = p_city_id)
    and public.calculate_distance_km(p_lat, p_lng, s.lat, s.lng) <= p_max_distance_km
  order by distance_km asc, s.distance_sort_weight desc
  limit p_limit;
end;
$$ language plpgsql stable;

comment on function public.find_nearest_stores is 'LBS核心函数：查找用户就近门店（按距离排序）';

-- ============================================
-- 12. 初始化示例数据
-- ============================================

-- 插入示例城市（台州临海）
insert into public.cities (city_code, city_name, province, lng, lat, geo_hash, status, config_json)
values 
  ('331082', '台州临海', '浙江省', 121.1444, 28.8581, 'wtmm', 'active', '{
    "commission_range": {"l1": [5, 15], "l2": [2, 8]},
    "redpacket_amount": [3, 5, 10],
    "physical_gift_types": ["日用小商品", "高端礼盒"],
    "price_tier": "tier3"
  }'::jsonb)
on conflict (city_code) do nothing;

-- 插入示例商圈
insert into public.business_districts (city_id, district_name, business_type, center_lng, center_lat, geo_hash, radius_km, status)
select 
  c.id, '古城街道', '居民区', 121.1444, 28.8581, 'wtmm', 3, 'active'
from public.cities c where c.city_code = '331082'
on conflict do nothing;

-- 插入示例自营门店
insert into public.self_operated_stores (store_code, store_name, city_id, lng, lat, geo_hash, geo_hash_6, address, service_radius, status, phone)
select 
  'S001', '来店有喜临海古城店', c.id, 121.1444, 28.8581, 'wtmm', 'wtmmr', 
  '浙江省台州市临海市古城街道xx路xx号', 5, 'active', '0576-12345678'
from public.cities c where c.city_code = '331082'
on conflict (store_code) do nothing;

-- ============================================
-- 完成
-- ============================================
raise notice '✅ 区域架构数据库扩展完成！';
