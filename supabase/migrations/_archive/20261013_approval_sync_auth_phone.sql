-- 20261013_approval_sync_auth_phone
-- 账号 P0 根因预防：商家审核通过(profiles.merchant_status → 'approved')时，
--   若 auth.users.phone 为空，则用其 approved 申请的 contact_phone 归一 E.164，
--   回填 auth.users.phone(+确认态) 与 profiles.phone。
--   保证「approved = 网页版可 OTP 登录」，不再产生新的「无手机号死锁」账号。
--
-- 背景：admin-web approveApplication 已 best-effort 调 admin-update-user-identity EF
--   补手机号，但依赖 EF 部署、失败不阻断审核。本触发器在 DB 层兜底，与 EF 互补且幂等
--   （phone 已写则跳过），任一路径把 merchant_status 置 approved 都会生效。
--
-- 实现：AFTER UPDATE OF merchant_status ON profiles 的触发器 + SECURITY DEFINER 函数。
--   加法式，不改 fn_open_store_for_user。
-- 运行：supabase db query --linked < supabase/migrations/_archive/20261013_approval_sync_auth_phone.sql
--   （或 Dashboard → SQL Editor 以 postgres 执行）
-- 幂等：CREATE OR REPLACE 函数 + DROP TRIGGER IF EXISTS + 仅补空值。
-- 依赖：public.fn_normalize_phone(text)（00211 已建）。

CREATE OR REPLACE FUNCTION public.fn_sync_auth_phone_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur_phone text;
  v_norm      text;
  v_e164      text;
BEGIN
  -- 仅在「从未 approved 变为 approved」时处理
  IF NEW.merchant_status IS DISTINCT FROM 'approved'
     OR OLD.merchant_status = 'approved' THEN
    RETURN NEW;
  END IF;

  -- auth.users.phone 已有值 → 幂等跳过
  SELECT u.phone INTO v_cur_phone FROM auth.users u WHERE u.id = NEW.id;
  IF v_cur_phone IS NOT NULL AND btrim(v_cur_phone) <> '' THEN
    RETURN NEW;
  END IF;

  -- 取该用户最新一条 approved 申请的 contact_phone，归一到 11 位
  SELECT public.fn_normalize_phone(a.contact_phone)
    INTO v_norm
  FROM public.merchant_applications a
  WHERE a.user_id = NEW.id
    AND a.status = 'approved'
  ORDER BY a.created_at DESC
  LIMIT 1;

  -- 仅处理大陆手机号（1[3-9] 开头 11 位）；其余留待人工（避免写坏国际号）
  IF v_norm ~ '^1[3-9][0-9]{9}$' THEN
    v_e164 := '+86' || v_norm;

    UPDATE auth.users u
       SET phone              = v_e164,
           phone_confirmed_at = COALESCE(u.phone_confirmed_at, now()),
           updated_at         = now()
     WHERE u.id = NEW.id
       AND u.phone IS NULL;

    -- 注意：此处 SET 不含 merchant_status，不会再次触发本触发器（无递归）
    UPDATE public.profiles p
       SET phone = v_e164
     WHERE p.id = NEW.id
       AND (p.phone IS NULL OR btrim(p.phone) = '');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_auth_phone_on_approval()
  IS '审核通过时把 approved 申请的 contact_phone 回填 auth.users.phone/profiles.phone（E.164），保证网页版可 OTP 登录。SECURITY DEFINER，仅补空值、仅大陆手机号。';

DROP TRIGGER IF EXISTS trg_sync_auth_phone_on_approval ON public.profiles;
CREATE TRIGGER trg_sync_auth_phone_on_approval
  AFTER UPDATE OF merchant_status ON public.profiles
  FOR EACH ROW
  WHEN (NEW.merchant_status = 'approved')
  EXECUTE FUNCTION public.fn_sync_auth_phone_on_approval();
