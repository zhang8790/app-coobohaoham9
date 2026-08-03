-- 用户体质测试结果全量存档：支撑「为什么是你」回放、复测对比、首页每日个性化
-- 仅存结构化的分数/答案，不存任何诊断结论；合规上仍是「食养偏好倾向」参考。

create table if not exists public.constitution_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  primary_key  text not null,
  secondary_key text null,
  scores       jsonb not null default '{}'::jsonb,
  answers      jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_constitution_results_user
  on public.constitution_results (user_id, created_at desc);

comment on table public.constitution_results is
  '用户体质测试结果全量存档（分数+答案+日期），支撑结果回放与复测';

alter table public.constitution_results enable row level security;

-- 本人可读写自己的结果
drop policy if exists rls_constitution_results_owner on public.constitution_results;
create policy rls_constitution_results_owner
  on public.constitution_results
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 管理员仅可读（运营复盘，不可改）
drop policy if exists rls_constitution_results_admin_read on public.constitution_results;
create policy rls_constitution_results_admin_read
  on public.constitution_results
  for select
  using (is_admin());
