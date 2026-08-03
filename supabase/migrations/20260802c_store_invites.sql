-- =============================================================
-- P5 门店邀请码：让「总后台建的运营账号」也能在小程序进店
--   - 网页版管理中心(邮箱运营者)生成门店邀请码
--   - 运营者本人用小程序微信登录后，输入邀请码兑换
--   - 兑换时把当前微信身份 upsert 进 store_staff(同店)
--   - 之后微信登录自动被识别为本店运营者，可进 merchant-center
--   纯加法，不影响现有 owner_id / store_staff 逻辑
-- =============================================================

-- 1) 邀请码表
CREATE TABLE IF NOT EXISTS public.store_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  role        text NOT NULL CHECK (role IN ('owner','manager','staff','cashier')),
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_by     uuid REFERENCES public.profiles(id),
  used_at     timestamptz
);

-- 2) RLS：仅本店运营者 / admin 可见本店邀请码
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_store_invites_select ON public.store_invites;
CREATE POLICY rls_store_invites_select ON public.store_invites
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

-- 写操作统一走 SECURITY DEFINER 的 RPC，这里仅防御性保留 admin 写权限
DROP POLICY IF EXISTS rls_store_invites_write ON public.store_invites;
CREATE POLICY rls_store_invites_write ON public.store_invites
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) 生成邀请码（校验调用者是本店 operator / admin）
CREATE OR REPLACE FUNCTION public.create_store_invite(p_store_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_uid  uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.is_store_operator(p_store_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'permission denied: not store operator';
  END IF;
  IF p_role NOT IN ('owner','manager','staff','cashier') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  -- 生成唯一码：LD + 8 位大写字母数字
  LOOP
    v_code := 'LD' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.store_invites WHERE code = v_code);
  END LOOP;

  INSERT INTO public.store_invites (store_id, code, role, created_by, expires_at)
  VALUES (p_store_id, v_code, p_role, v_uid, now() + interval '7 days');

  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_store_invite(uuid, text) TO authenticated;

-- 4) 兑换邀请码（把当前微信身份加入同店 store_staff）
CREATE OR REPLACE FUNCTION public.redeem_store_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      public.store_invites%ROWTYPE;
  v_uid      uuid := auth.uid();
  v_store_id uuid;
  v_role     text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv
  FROM public.store_invites
  WHERE code = p_code
    AND used_by IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  END IF;

  v_store_id := v_inv.store_id;
  v_role     := v_inv.role;

  -- upsert 进 store_staff（UNIQUE(store_id, user_id)）
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, v_uid, v_role, true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true, created_at = now();

  -- 标记邀请码已用
  UPDATE public.store_invites
  SET used_by = v_uid, used_at = now()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'store_id', v_store_id, 'role', v_role);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite(text) TO authenticated;
