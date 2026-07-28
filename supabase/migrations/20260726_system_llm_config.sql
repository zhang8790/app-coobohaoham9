-- ============================================================
-- 系统级配置表：LLM / 第三方服务密钥等敏感配置集中存放
-- ------------------------------------------------------------
-- 目的：把"在小程序/Edge Function 里用 LLM"所需的
--   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
--   从「Supabase 环境变量（只能 CLI 设置，无法网页填）」
--   改为「数据库配置表」，让总管理后台可网页填写、全项目共用。
--
-- 安全：仅管理员(is_admin = profiles.role='admin')可读写；
--   anon / 普通用户 select 不到 → API Key 永不外泄到客户端。
--   Edge Function 用 service_role 在服务端读取（绕过 RLS，安全）。
-- ============================================================

create table if not exists public.system_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.system_config is '系统级键值配置（LLM/第三方密钥等），仅管理员可读写';

alter table public.system_config enable row level security;

-- 仅管理员可读写（is_admin() 已在 00081 定义：get_user_role(auth.uid())='admin'）
drop policy if exists system_config_admin_all on public.system_config;
create policy system_config_admin_all
  on public.system_config
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 拒绝 anon 直接访问（防密钥泄漏到未登录客户端）
drop policy if exists system_config_anon_deny on public.system_config;
create policy system_config_anon_deny
  on public.system_config
  for all
  to anon
  using (false)
  with check (false);
