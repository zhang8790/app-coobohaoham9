-- 00213_admin_password_toggle
-- 管理端「密码登录开关」：允许管理员启用/停用某账号的密码登录。
--
-- 为什么必须走 SECURITY DEFINER 函数：
--   public.user_login_identities 只开放了 SELECT 策略（本人 + admin），
--   刻意**不建任何写策略**——否则登录邮箱可被篡改，等于可劫持他人账号。
--   管理端要改 password_enabled，只能经由本函数（内部强制校验 is_admin）。
--
-- 幂等：DROP + CREATE（无参变更，重复执行安全）。

BEGIN;

DROP FUNCTION IF EXISTS public.admin_set_password_enabled(uuid, boolean);
CREATE FUNCTION public.admin_set_password_enabled(
  p_user_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rows int;
BEGIN
  -- 仅管理员可操作
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin', 'message', '仅管理员可操作');
  END IF;

  UPDATE public.user_login_identities
     SET password_enabled = COALESCE(p_enabled, false),
         updated_at = now()
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- 该账号还没有映射行（例如从未开通密码登录），按需补一行
    INSERT INTO public.user_login_identities (user_id, phone, login_email, password_enabled)
    SELECT u.id, public.fn_normalize_phone(u.phone), u.email, COALESCE(p_enabled, false)
      FROM auth.users u
     WHERE u.id = p_user_id AND u.email IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE
       SET password_enabled = COALESCE(p_enabled, false), updated_at = now();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_not_found', 'message', '账号不存在或无登录邮箱');
    END IF;
  END IF;

  -- 审计
  INSERT INTO public.account_audit_logs (actor_id, target_id, action, channel, detail)
  VALUES (auth.uid(), p_user_id,
          CASE WHEN COALESCE(p_enabled, false) THEN 'enable_password_login' ELSE 'disable_password_login' END,
          'admin-web',
          jsonb_build_object('password_enabled', COALESCE(p_enabled, false)));

  RETURN jsonb_build_object('ok', true, 'password_enabled', COALESCE(p_enabled, false));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_set_password_enabled(uuid, boolean) TO authenticated;

COMMIT;

-- ---------- 回读验证（单独执行，需管理员 JWT）----------
-- SELECT public.admin_set_password_enabled('<user_id>', true);
-- SELECT user_id, login_email, password_enabled FROM public.user_login_identities;
