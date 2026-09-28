-- 00211_user_login_identities
-- 认证 P0：建立「登录标识 → GoTrue 登录邮箱」的服务端映射，根治手机号无法密码登录。
--
-- 根因回顾：
--   GoTrue 的 signInWithPassword 必须用 email，而本项目手机号用户没有真实邮箱，
--   历史上靠客户端猜（test<裸号>@test.com / <用户名>@app.example.com），
--   于是 AuthContext.tsx 只能对 3 个硬编码测试号开后门，其余手机号一律
--   throw '该手机号未开通密码登录'。
--   解法：映射表放在服务端，客户端登录前先问「这个手机号该用哪个邮箱」。
--
-- 设计要点：
--   1. login_email 一律沿用 auth.users.email 原值（回填时不重新派生），
--      否则会把现网 4 个已能登录的账号改坏。
--   2. resolve_login_email 内部做手机号规范化：剥掉非数字后取后 11 位再比对，
--      因此客户端传「13800138000」「+8613800138000」「86-138-0013-8000」都能命中。
--   3. 映射表只给「本人 + admin」读，**不建任何写策略**：
--      写只能走 SECURITY DEFINER 函数或 EF(service_role)，防止被篡改登录邮箱。
--
-- 幂等：CREATE TABLE IF NOT EXISTS / DROP+CREATE 函数 / ON CONFLICT DO NOTHING。

BEGIN;

-- =====================================================================
-- 1. 映射表
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_login_identities (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone            text UNIQUE,
  username         text UNIQUE,
  login_email      text UNIQUE NOT NULL,
  password_enabled boolean NOT NULL DEFAULT false,
  password_set_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_login_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_uli_self ON public.user_login_identities;
CREATE POLICY rls_uli_self ON public.user_login_identities
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

COMMENT ON TABLE public.user_login_identities
  IS '登录标识映射：手机号/用户名 → GoTrue 登录邮箱。写入仅允许 SECURITY DEFINER 函数或 service_role。';
COMMENT ON COLUMN public.user_login_identities.password_enabled
  IS '是否开通密码登录。false 时只能走短信验证码登录。';

-- =====================================================================
-- 2. 手机号 → 登录邮箱（手机号规范化后比对）
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  -- 剥掉所有非数字后取后 11 位（兼容 +86 / 86 / 带分隔符 / 裸号）
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) >= 11
      THEN right(regexp_replace(p_phone, '\D', '', 'g'), 11)
    ELSE NULL
  END;
$fn$;

DROP FUNCTION IF EXISTS public.resolve_login_email(text);
CREATE FUNCTION public.resolve_login_email(p_phone text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT login_email
  FROM public.user_login_identities
  WHERE password_enabled IS TRUE
    AND public.fn_normalize_phone(phone) = public.fn_normalize_phone(p_phone)
  LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_normalize_phone(text) TO anon, authenticated;

-- =====================================================================
-- 3. 回填现网已有账号
--    login_email 沿用 auth.users.email 原值，保证现有登录方式不受影响。
--    已设置密码的账号直接视为「已开通密码登录」。
-- =====================================================================
INSERT INTO public.user_login_identities
  (user_id, phone, login_email, password_enabled, password_set_at)
SELECT
  u.id,
  u.phone,
  u.email,
  true,
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_login_identities x WHERE x.user_id = u.id
  );

-- =====================================================================
-- 4. 账号操作审计（管理端代改密 / 开通密码登录留痕）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.account_audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,                     -- 操作者（管理员或本人）
  target_id   uuid,                     -- 被操作账号
  action      text NOT NULL,            -- register / enable_password / reset_password / admin_reset_password
  channel     text,                     -- miniprogram / admin-web
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_account_audit_logs_admin ON public.account_audit_logs;
CREATE POLICY p_account_audit_logs_admin ON public.account_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin() OR actor_id = auth.uid());

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT user_id, phone, login_email, password_enabled FROM public.user_login_identities;
-- SELECT public.resolve_login_email('13800138000');   -- 期望 admin@laidianyouxi.com
-- SELECT public.resolve_login_email('+8618701410500'); -- 期望 test18701410500@test.com
