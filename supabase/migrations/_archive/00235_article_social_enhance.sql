-- 00235_article_social_enhance.sql
-- 创作重构配套：文章点赞 + 心情标签聚合 + 分享原子自增
-- 依赖：00216_article_social（article_favorites/article_follows）、00034（share_count/view_count）

-- ─────────────────────────────────────────────
-- 1. 文章点赞表
-- ─────────────────────────────────────────────
create table if not exists public.article_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);
create index if not exists idx_article_likes_article on public.article_likes(article_id);
create index if not exists idx_article_likes_user on public.article_likes(user_id);

alter table public.article_likes enable row level security;
drop policy if exists "article_likes_select" on public.article_likes;
create policy "article_likes_select" on public.article_likes for select using (true);
drop policy if exists "article_likes_insert_self" on public.article_likes;
create policy "article_likes_insert_self" on public.article_likes for insert with check (auth.uid() = user_id);
drop policy if exists "article_likes_delete_self" on public.article_likes;
create policy "article_likes_delete_self" on public.article_likes for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 2. 文章心情标签（心情广场按 mood_tag 聚合；来自 QUICK_MOOD_PRESETS 的标签）
-- ─────────────────────────────────────────────
alter table public.articles add column if not exists mood_tag text;
create index if not exists idx_articles_mood_tag on public.articles(mood_tag);

-- ─────────────────────────────────────────────
-- 3. 分享原子自增（避免 read-modify-write 丢增量）
-- ─────────────────────────────────────────────
create or replace function public.increment_article_share(p_article_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles set share_count = coalesce(share_count, 0) + 1 where id = p_article_id;
$$;
grant execute on function public.increment_article_share(uuid) to authenticated, anon;
