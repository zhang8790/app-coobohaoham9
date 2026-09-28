-- 00206 邀请码绑定门店 · 函数加固（生成/兑换/撤销）
-- 依据：《邀请码绑定门店_运营与交互方案.md》第 1、4、6 节
--
-- ⚠️ 关键手法：给 RPC 函数「加参数」必须 DROP 旧签名再 CREATE。
--    CREATE OR REPLACE FUNCTION 是「按签名精确替换」，参数不同会变成**重载**，
--    两个签名同时存在时 PostgREST 调 rpc() 会因重载歧义报错。
--    新参数全部带 DEFAULT → 老调用方（admin-web 传 2 个参、小程序传 1 个参）免改动即可继续工作。

BEGIN;

-- ---------- D. create_store_invite v2 ----------
DROP FUNCTION IF EXISTS public.create_store_invite(uuid, text);

CREATE FUNCTION public.create_store_invite(
  p_store_id      uuid,
  p_role          text,
  p_remark        text DEFAULT NULL,
  p_expires_hours int  DEFAULT 168,   -- 默认 7 天
  p_max_uses      int  DEFAULT 1
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_code   text;
  v_uid    uuid := auth.uid();
  v_caller int;
  -- Crockford Base32：剔除易混的 I L O U 后保留 0/1 已无混淆源（对手字符不在集内）
  v_alpha  CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_role NOT IN ('owner','manager','staff','cashier') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  -- 【规则二】owner 是门店资产归属，禁止通过邀请码转让 → 改后台直设 stores.owner_id
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'owner must be granted via stores.owner_id, not invite code';
  END IF;

  IF NOT (public.is_store_operator(p_store_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'permission denied: not store operator';
  END IF;

  -- 【规则一】降级发放：只能发出严格低于自己的角色。
  -- owner/store owner=4, manager=3, staff=2, cashier=1；平台 admin 计 99（不受此限）
  v_caller := CASE WHEN public.is_admin() THEN 99
                   ELSE public.fn_my_store_role(p_store_id) END;

  -- 仅 owner / manager / admin 有发码资格；staff、cashier 不可发码
  IF v_caller < 3 THEN
    RAISE EXCEPTION 'insufficient privilege: only owner/manager/admin can issue invites';
  END IF;

  IF v_caller <> 99 AND public.fn_role_rank(p_role) >= v_caller THEN
    RAISE EXCEPTION 'insufficient privilege: cannot issue a role equal or higher than your own';
  END IF;

  IF p_max_uses IS NULL OR p_max_uses < 1 THEN
    RAISE EXCEPTION 'invalid max_uses';
  END IF;
  IF p_max_uses > 1 AND p_role NOT IN ('staff','cashier') THEN
    RAISE EXCEPTION 'multi-use invites are limited to staff/cashier';
  END IF;
  IF p_expires_hours IS NULL OR p_expires_hours < 1 OR p_expires_hours > 720 THEN
    RAISE EXCEPTION 'invalid expires_hours (1-720)';
  END IF;

  LOOP
    v_code := 'LD';
    FOR i IN 0..7 LOOP
      v_code := v_code || substr(v_alpha,
        1 + (get_byte(decode(md5(random()::text || clock_timestamp()::text || i::text), 'hex'), i) % 32)::int,
        1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.store_invites WHERE code = v_code);
  END LOOP;

  INSERT INTO public.store_invites (store_id, code, role, created_by, expires_at, max_uses, remark)
  VALUES (
    p_store_id, v_code, p_role, v_uid,
    now() + (p_expires_hours || ' hours')::interval,
    p_max_uses,
    NULLIF(btrim(coalesce(p_remark, '')), '')
  );

  RETURN v_code;
END;
$fn$;

COMMENT ON FUNCTION public.create_store_invite(uuid, text, text, int, int)
  IS '生成门店邀请码。硬约束：owner 不可发；只能发严格低于自己的角色；多用途码仅限 staff/cashier';

-- ---------- E. redeem_store_invite v2 ----------
DROP FUNCTION IF EXISTS public.redeem_store_invite(text);

CREATE FUNCTION public.redeem_store_invite(
  p_code   text,
  p_source text DEFAULT 'code'   -- code / qrcode / admin，用于埋点区分来源
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv     public.store_invites%ROWTYPE;
  v_uid     uuid := auth.uid();
  v_now     timestamptz := now();
  v_raw     text := upper(btrim(coalesce(p_code, '')));
  v_err     text := NULL;
  v_prev    text := NULL;
  v_prev_on boolean;
  v_store   record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- 撞库限速：5 分钟内失败 ≥5 次直接拒
  IF (
    SELECT count(*) FROM public.store_invite_redemptions
    WHERE user_id = v_uid AND ok = false AND created_at > v_now - interval '5 minutes'
  ) >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT * INTO v_inv FROM public.store_invites WHERE code = v_raw;

  IF NOT FOUND THEN
    v_err := 'code_not_found';
  ELSIF v_inv.revoked_at IS NOT NULL THEN
    v_err := 'code_revoked';
  ELSIF v_inv.expires_at <= v_now THEN
    v_err := 'code_expired';
  ELSIF v_inv.use_count >= v_inv.max_uses THEN
    v_err := 'max_uses_reached';
  ELSIF v_inv.max_uses = 1 AND v_inv.used_by IS NOT NULL THEN
    v_err := 'code_used';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = v_inv.store_id AND s.is_active IS TRUE
  ) THEN
    v_err := 'store_inactive';
  END IF;

  IF v_err IS NOT NULL THEN
    INSERT INTO public.store_invite_redemptions
      (invite_id, code_attempt, store_id, user_id, ok, error_code, source)
    VALUES (v_inv.id, v_raw, v_inv.store_id, v_uid, false, v_err, coalesce(p_source, 'code'));
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  SELECT role, is_active INTO v_prev, v_prev_on
  FROM public.store_staff
  WHERE store_id = v_inv.store_id AND user_id = v_uid;

  IF FOUND THEN
    -- 已有更高身份 → 拒绝，防止用低权限码把自己的高权限覆盖掉（同时也挡住反向提权）
    IF public.fn_role_rank(v_prev) > public.fn_role_rank(v_inv.role) THEN
      INSERT INTO public.store_invite_redemptions
        (invite_id, code_attempt, store_id, user_id, ok, error_code, role, prev_role, source)
      VALUES (v_inv.id, v_raw, v_inv.store_id, v_uid, false, 'role_conflict', v_inv.role, v_prev, coalesce(p_source, 'code'));
      RETURN jsonb_build_object('ok', false, 'error', 'role_conflict', 'store_id', v_inv.store_id);
    END IF;

    IF v_prev = v_inv.role AND v_prev_on IS TRUE THEN
      SELECT id, name INTO v_store FROM public.stores WHERE id = v_inv.store_id;
      RETURN jsonb_build_object('ok', false, 'error', 'already_bound_same',
                                'store_id', v_inv.store_id, 'store_name', v_store.name);
    END IF;
  END IF;

  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_inv.store_id, v_uid, v_inv.role, true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true, created_at = now();

  UPDATE public.store_invites
  SET use_count = use_count + 1,
      used_by   = CASE WHEN max_uses = 1 THEN v_uid   ELSE used_by END,
      used_at   = CASE WHEN max_uses = 1 THEN v_now   ELSE used_at END
  WHERE id = v_inv.id;

  SELECT id, name INTO v_store FROM public.stores WHERE id = v_inv.store_id;

  INSERT INTO public.store_invite_redemptions
    (invite_id, code_attempt, store_id, user_id, ok, role, prev_role, source)
  VALUES (v_inv.id, v_raw, v_inv.store_id, v_uid, true, v_inv.role, v_prev, coalesce(p_source, 'code'));

  RETURN jsonb_build_object('ok', true,
                            'store_id',   v_inv.store_id,
                            'store_name', v_store.name,
                            'role',       v_inv.role,
                            'bound_at',   v_now);
END;
$fn$;

COMMENT ON FUNCTION public.redeem_store_invite(text, text)
  IS '兑换邀请码。返回细分错误码：not_authenticated/rate_limited/code_not_found/code_revoked/code_expired/max_uses_reached/code_used/store_inactive/role_conflict/already_bound_same';

-- ---------- F. revoke_store_invite（新增，补 G3「无撤销」缺口）----------
CREATE OR REPLACE FUNCTION public.revoke_store_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv public.store_invites%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv FROM public.store_invites WHERE code = upper(btrim(coalesce(p_code, '')));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF NOT (public.is_store_operator(v_inv.store_id) OR public.is_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;
  IF v_inv.used_by IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_revoked');
  END IF;

  UPDATE public.store_invites
  SET revoked_at = now(), revoked_by = v_uid
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'code', v_inv.code);
END;
$fn$;

-- ---------- G. 恢复 RPC 授权（DROP/CREATE 会丢 GRANT）----------
GRANT EXECUTE ON FUNCTION public.create_store_invite(uuid, text, text, int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite(text, text)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_store_invite(text)                    TO anon, authenticated, service_role;

COMMIT;
