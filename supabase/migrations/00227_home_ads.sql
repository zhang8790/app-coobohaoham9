-- ============================================================
-- 00227 首页宣传广告位 home_ads
-- ------------------------------------------------------------
-- 支撑「首页宣传广告（图片 / 视频）轮播」后台可配置能力：
--   运营在管理后台「首页广告」页上传图片（images 桶）/ 视频（videos 桶），
--   小程序首页 AdBanner 拉取 is_active=true 的素材按 sort_order 轮播。
-- 字段说明：
--   media_type  图片 image / 视频 video
--   media_url   素材公开 URL（images / videos 桶）
--   poster_url  视频封面（可选，图片类型留空）
--   link_url    点击跳转（小程序内部路由，如 /pages/xxx/index；可空）
--   title       备注标题（仅后台管理用，前端不展示文字）
--   sort_order  轮播顺序，越小越靠前
--   is_active   是否启用（停用则不展示）
-- RLS：
--   公开读仅活跃广告（首页轮播用 anon key）；
--   登录用户可读写全部（后台管理，含停用项）。
-- 执行：supabase db query --linked --file supabase/migrations/00227_home_ads.sql
--       （或 Supabase SQL Editor 全量粘贴）。幂等可重复执行。
-- ============================================================

create table if not exists public.home_ads (
  id          uuid primary key default gen_random_uuid(),
  media_type  text not null
              check (media_type in ('image', 'video')),
  media_url   text not null,
  poster_url  text,
  link_url    text,
  title       text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_home_ads_sort on public.home_ads (sort_order);
create index if not exists idx_home_ads_active on public.home_ads (is_active, sort_order);

-- ============================================================
-- RLS
-- ============================================================
alter table public.home_ads enable row level security;

drop policy if exists "home_ads_public_read" on public.home_ads;
drop policy if exists "home_ads_auth_all"   on public.home_ads;

-- 公开读：仅活跃广告（小程序首页轮播，anon key）
create policy "home_ads_public_read" on public.home_ads
  for select using (is_active = true);

-- 登录用户可读写全部（后台管理，含停用项）
create policy "home_ads_auth_all" on public.home_ads
  for all to authenticated
  using (true) with check (true);

-- 更新时自动刷新 updated_at（避免后台忘记维护）
create or replace function public.touch_home_ads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_home_ads_touch on public.home_ads;
create trigger trg_home_ads_touch
  before update on public.home_ads
  for each row execute function public.touch_home_ads_updated_at();

select '✅ home_ads 表已就绪' as result;
