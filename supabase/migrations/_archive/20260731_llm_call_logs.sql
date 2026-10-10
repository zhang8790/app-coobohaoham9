-- ============================================================
-- 智能模型调用日志（token 用量统计）
-- 记录每次 Edge Function 调用 LLM 的 token 消耗，用于后台智能模型配置页统计
-- 本文件不使用任何 ASCII 单引号（字符串常量全部改用美元引用 $q$...$q$），
-- 以避免 supabase db query 在 Windows 下对单引号的包裹转义问题。
-- ============================================================

create table if not exists public.llm_call_logs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  function_name    text not null,
  module           text,
  model            text not null,
  prompt_tokens    int  not null default 0,
  completion_tokens int not null default 0,
  total_tokens     int  not null default 0,
  latency_ms       int,
  success          boolean not null default true,
  error_message    text,
  user_id          uuid references auth.users(id) on delete set null,
  order_no         text,
  meta             jsonb default $q${}$q$::jsonb
);

create index if not exists idx_llm_logs_created
  on public.llm_call_logs (created_at desc);

alter table public.llm_call_logs enable row level security;

do $f$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = $q$public$q$ and tablename = $q$llm_call_logs$q$ and cmd = $q$SELECT$q$
  ) then
    create policy "admin read llm_call_logs"
      on public.llm_call_logs
      for select
      using (public.is_admin());
  end if;
end $f$;

-- ============================================================
-- 聚合统计 RPC：fn_llm_usage_stats(p_days)
-- ============================================================
create or replace function public.fn_llm_usage_stats(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_totals      jsonb;
  v_today       jsonb;
  v_by_day      jsonb;
  v_by_module   jsonb;
begin
  select
    jsonb_build_object(
      $q$total_calls$q$,        coalesce(sum(1) filter (where success), 0),
      $q$total_tokens$q$,       coalesce(sum(total_tokens) filter (where success), 0),
      $q$total_prompt$q$,       coalesce(sum(prompt_tokens) filter (where success), 0),
      $q$total_completion$q$,   coalesce(sum(completion_tokens) filter (where success), 0),
      $q$failed_calls$q$,       coalesce(sum(1) filter (where not success), 0)
    ),
    jsonb_build_object(
      $q$today_calls$q$,   coalesce(sum(1) filter (where success and date_trunc($q$day$q$, created_at) = date_trunc($q$day$q$, now())), 0),
      $q$today_tokens$q$,  coalesce(sum(total_tokens) filter (where success and date_trunc($q$day$q$, created_at) = date_trunc($q$day$q$, now())), 0)
    )
  into v_totals, v_today
  from public.llm_call_logs;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      $q$day$q$,        to_char(d, $q$YYYY-MM-DD$q$),
      $q$calls$q$,      coalesce(s.calls, 0),
      $q$tokens$q$,     coalesce(s.tokens, 0)
    ) order by d
  ), $q$[]$q$::jsonb)
  into v_by_day
  from generate_series(
         date_trunc($q$day$q$, now()) - (p_days - 1) * interval $q$1 day$q$,
         date_trunc($q$day$q$, now()),
         interval $q$1 day$q$
       ) as d
  left join (
    select date_trunc($q$day$q$, created_at) as day,
           count(*) filter (where success) as calls,
           sum(total_tokens) filter (where success) as tokens
    from public.llm_call_logs
    where created_at >= date_trunc($q$day$q$, now()) - (p_days - 1) * interval $q$1 day$q$
    group by 1
  ) s on s.day = d;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      $q$module$q$,      module,
      $q$calls$q$,       calls,
      $q$tokens$q$,      tokens
    ) order by tokens desc nulls last
  ), $q$[]$q$::jsonb)
  into v_by_module
  from (
    select module,
           count(*) filter (where success) as calls,
           coalesce(sum(total_tokens) filter (where success), 0) as tokens
    from public.llm_call_logs
    where success and module is not null
    group by module
  ) s;

  return jsonb_build_object(
    $q$totals$q$,   v_totals,
    $q$today$q$,    v_today,
    $q$by_day$q$,   v_by_day,
    $q$by_module$q$, v_by_module
  );
end;
$f$;

-- 最近明细 RPC：fn_llm_recent_logs(p_limit)
create or replace function public.fn_llm_recent_logs(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      $q$id$q$, id,
      $q$created_at$q$, created_at,
      $q$function_name$q$, function_name,
      $q$module$q$, module,
      $q$model$q$, model,
      $q$prompt_tokens$q$, prompt_tokens,
      $q$completion_tokens$q$, completion_tokens,
      $q$total_tokens$q$, total_tokens,
      $q$latency_ms$q$, latency_ms,
      $q$success$q$, success,
      $q$error_message$q$, error_message
    ) order by created_at desc
  ), $q$[]$q$::jsonb)
  into v_rows
  from public.llm_call_logs
  limit p_limit;

  return v_rows;
end;
$f$;

grant execute on function public.fn_llm_usage_stats(int) to authenticated;
grant execute on function public.fn_llm_recent_logs(int) to authenticated;
