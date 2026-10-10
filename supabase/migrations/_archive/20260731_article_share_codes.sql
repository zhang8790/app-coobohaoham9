-- 20260731 图文分享小程序码映射表（朋友圈锁客闭环）
-- WeChat getwxacodeunlimit 的 scene 仅 ≤32 字节，而 article id 是 uuid(36)，
-- 故用短码 scene 反查 article_id + 分享人(referrer)，扫码打开 article-detail 时自动锁客。
create table if not exists public.article_share_codes (
  scene       text primary key,                         -- 短码（≤32 字符，微信扫码带回）
  article_id  uuid not null references public.articles(id) on delete cascade,
  referrer_id uuid,                                      -- 发起分享的侠客（锁客归属参考）
  created_at  timestamptz not null default now()
);

create index if not exists idx_article_share_codes_article
  on public.article_share_codes(article_id);

alter table public.article_share_codes enable row level security;

-- 前端不得直连读写，所有写入走 wxacode Edge Function（service_role 绕过 RLS）
drop policy if exists article_share_codes_no_anon on public.article_share_codes;
create policy article_share_codes_no_anon on public.article_share_codes
  for all to anon, authenticated
  using (false) with check (false);
