-- 00236_article_lock_customer.sql
-- 目标：图文只为「锁客」（成交在线下）。记录每篇图文锁定了哪些访客，并在访客无上级时建立推荐关系。
-- 依赖：00001(articles/profiles)、00034(view_count/share_count)、00235(article_likes/mood_tag)

-- ─────────────────────────────────────────────
-- 1. 素材溯源列（素材工坊导入的外链草稿）
-- ─────────────────────────────────────────────
alter table public.articles add column if not exists source_url  text;
alter table public.articles add column if not exists source_type text;   -- 'original' | 'imported'
alter table public.articles add column if not exists source_raw  text;   -- 导入原文快照，用于「改写率」闸门比对

-- ─────────────────────────────────────────────
-- 2. 图文锁客表：一篇图文锁定了哪些访客
-- ─────────────────────────────────────────────
create table if not exists public.article_locks (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid not null references public.articles(id) on delete cascade,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,  -- 图文作者（推广侠客）
  visitor_user_id uuid not null references auth.users(id) on delete cascade,  -- 访客
  is_new_customer boolean not null default false,  -- 是否因本次访问首次建立推荐关系
  created_at      timestamptz not null default now(),
  unique (article_id, visitor_user_id)
);
create index if not exists idx_article_locks_owner   on public.article_locks(owner_user_id);
create index if not exists idx_article_locks_article on public.article_locks(article_id);
create index if not exists idx_article_locks_visitor on public.article_locks(visitor_user_id);

alter table public.article_locks enable row level security;
-- 作者可看自己锁到的客；访客可看自己的记录
drop policy if exists "article_locks_select_own" on public.article_locks;
create policy "article_locks_select_own" on public.article_locks
  for select using (auth.uid() = owner_user_id or auth.uid() = visitor_user_id);
-- 写入统一走 SECURITY DEFINER 函数，这里不开放直接 insert

-- ─────────────────────────────────────────────
-- 3. 锁客 RPC：访客打开图文时调用
--    · 记录锁客关系（幂等）
--    · 访客若尚无上级，则把图文作者设为其推荐人（真正的「锁客」）
-- ─────────────────────────────────────────────
create or replace function public.fn_lock_customer_by_article(p_article_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor  uuid := auth.uid();
  v_owner    uuid;
  v_ref      uuid;
  v_is_new   boolean := false;
  v_inserted boolean := false;
begin
  if v_visitor is null or p_article_id is null then
    return jsonb_build_object('locked', false, 'reason', 'anonymous');
  end if;

  select a.user_id into v_owner from public.articles a where a.id = p_article_id;
  if v_owner is null then
    return jsonb_build_object('locked', false, 'reason', 'article_not_found');
  end if;
  if v_owner = v_visitor then
    return jsonb_build_object('locked', false, 'reason', 'self');
  end if;

  -- 访客当前上级
  select p.referrer_id into v_ref from public.profiles p where p.id = v_visitor;

  -- 无上级 → 本篇图文锁客成功，建立推荐关系
  if v_ref is null then
    update public.profiles set referrer_id = v_owner where id = v_visitor and referrer_id is null;
    v_is_new := true;
  end if;

  insert into public.article_locks (article_id, owner_user_id, visitor_user_id, is_new_customer)
  values (p_article_id, v_owner, v_visitor, v_is_new)
  on conflict (article_id, visitor_user_id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'locked', true,
    'is_new_customer', v_is_new,
    'first_visit', v_inserted
  );
exception when others then
  raise warning '[fn_lock_customer_by_article] article=%, err=%', p_article_id, sqlerrm;
  return jsonb_build_object('locked', false, 'reason', 'error');
end;
$$;
grant execute on function public.fn_lock_customer_by_article(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 4. 侠客战绩 RPC：我的每篇图文 阅读/分享/点赞/锁客/新客
-- ─────────────────────────────────────────────
create or replace function public.fn_my_article_stats()
returns table (
  article_id    uuid,
  title         text,
  cover_image   text,
  is_published  boolean,
  created_at    timestamptz,
  view_count    integer,
  share_count   integer,
  like_count    bigint,
  lock_count    bigint,
  new_customers bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.title,
    a.cover_image,
    a.is_published,
    a.created_at,
    coalesce(a.view_count, 0),
    coalesce(a.share_count, 0),
    (select count(*) from public.article_likes l where l.article_id = a.id),
    (select count(*) from public.article_locks k where k.article_id = a.id),
    (select count(*) from public.article_locks k where k.article_id = a.id and k.is_new_customer)
  from public.articles a
  where a.user_id = auth.uid()
  order by a.created_at desc;
$$;
grant execute on function public.fn_my_article_stats() to authenticated;

-- ─────────────────────────────────────────────
-- 5. 汇总 RPC：我的内容锁客总览
-- ─────────────────────────────────────────────
create or replace function public.fn_my_content_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'articles',      (select count(*) from public.articles a where a.user_id = auth.uid() and a.is_published),
    'drafts',        (select count(*) from public.articles a where a.user_id = auth.uid() and not a.is_published),
    'views',         (select coalesce(sum(coalesce(a.view_count,0)),0) from public.articles a where a.user_id = auth.uid()),
    'shares',        (select coalesce(sum(coalesce(a.share_count,0)),0) from public.articles a where a.user_id = auth.uid()),
    'locks',         (select count(*) from public.article_locks k where k.owner_user_id = auth.uid()),
    'new_customers', (select count(*) from public.article_locks k where k.owner_user_id = auth.uid() and k.is_new_customer)
  );
$$;
grant execute on function public.fn_my_content_summary() to authenticated;
