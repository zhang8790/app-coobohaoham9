-- =============================================================================
-- 00123 已保存收款账户（提现管理：绑定一次，免二次填写）
-- -----------------------------------------------------------------------------
-- 背景：原提现每次都手填银行卡/支付宝/身份证，提交后清空，无持久化。
-- 本迁移新增 withdrawal_accounts 表 + 3 个 SECURITY DEFINER RPC，
-- 支持「多张卡/多账户保存、选择、设默认、删除」，覆盖佣金(user)与货款(store)两类。
-- 表 DISABLE RLS，仅通过 RPC 访问，RPC 内校验「当前登录用户=本人或门店店主」。
-- =============================================================================

-- 1) 表
CREATE TABLE IF NOT EXISTS public.withdrawal_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL,                 -- profiles.id（user）或 stores.id（store）
  owner_type   text        NOT NULL CHECK (owner_type IN ('user', 'store')),
  method       text        NOT NULL CHECK (method IN ('bank', 'alipay', 'wechat')),
  real_name    text,
  id_card      text,
  bank_name    text,
  bank_account text,
  bank_holder  text,
  alipay_account text,
  is_default   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_owner ON public.withdrawal_accounts(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_wa_default ON public.withdrawal_accounts(owner_id, owner_type, is_default);

-- 财务/运营类表：与项目约定一致，DISABLE RLS（仅经 SECURITY DEFINER RPC 访问）
ALTER TABLE public.withdrawal_accounts DISABLE ROW LEVEL SECURITY;

-- 2) RPC：读取某 owner 的已保存账户
CREATE OR REPLACE FUNCTION public.fn_get_withdrawal_accounts(p_owner_id uuid, p_owner_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_ok  boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_owner_type = 'user' THEN
    v_ok := (p_owner_id = v_uid);
  ELSIF p_owner_type = 'store' THEN
    SELECT EXISTS(SELECT 1 FROM stores s WHERE s.id = p_owner_id AND s.owner_id = v_uid) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'accounts', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.is_default DESC, t.created_at DESC)
       FROM withdrawal_accounts t
       WHERE t.owner_id = p_owner_id AND t.owner_type = p_owner_type),
      '[]'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 3) RPC：保存（同方式+同账号号去重：已存在则更新，否则插入）；可选置默认
CREATE OR REPLACE FUNCTION public.fn_save_withdrawal_account(
  p_owner_id      uuid,
  p_owner_type    text,
  p_method        text,
  p_real_name     text   DEFAULT NULL,
  p_id_card       text   DEFAULT NULL,
  p_bank_name     text   DEFAULT NULL,
  p_bank_account  text   DEFAULT NULL,
  p_bank_holder   text   DEFAULT NULL,
  p_alipay_account text  DEFAULT NULL,
  p_make_default  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid;
  v_ok    boolean := false;
  v_exist uuid;
  v_id    uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_owner_type = 'user' THEN
    v_ok := (p_owner_id = v_uid);
  ELSIF p_owner_type = 'store' THEN
    SELECT EXISTS(SELECT 1 FROM stores s WHERE s.id = p_owner_id AND s.owner_id = v_uid) INTO v_ok;
  ELSE
    v_ok := false;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 同方式 + 同账号号去重
  IF p_method = 'bank' THEN
    SELECT id INTO v_exist FROM withdrawal_accounts
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND method = 'bank'
       AND bank_account = p_bank_account LIMIT 1;
  ELSIF p_method = 'alipay' THEN
    SELECT id INTO v_exist FROM withdrawal_accounts
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND method = 'alipay'
       AND alipay_account = p_alipay_account LIMIT 1;
  ELSE
    SELECT id INTO v_exist FROM withdrawal_accounts
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND method = 'wechat' LIMIT 1;
  END IF;

  IF v_exist IS NOT NULL THEN
    UPDATE withdrawal_accounts SET
      real_name = p_real_name, id_card = p_id_card,
      bank_name = p_bank_name, bank_account = p_bank_account,
      bank_holder = p_bank_holder, alipay_account = p_alipay_account,
      updated_at = now()
    WHERE id = v_exist RETURNING id INTO v_id;
  ELSE
    INSERT INTO withdrawal_accounts
      (owner_id, owner_type, method, real_name, id_card, bank_name, bank_account, bank_holder, alipay_account)
    VALUES
      (p_owner_id, p_owner_type, p_method, p_real_name, p_id_card, p_bank_name, p_bank_account, p_bank_holder, p_alipay_account)
    RETURNING id INTO v_id;
  END IF;

  -- 置默认：清同 owner 其他默认，再置本行
  IF p_make_default THEN
    UPDATE withdrawal_accounts SET is_default = false
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND id <> v_id;
    UPDATE withdrawal_accounts SET is_default = true WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 4) RPC：删除（校验归属）；若删的是默认且仍有剩余，把最新一条设为默认
CREATE OR REPLACE FUNCTION public.fn_delete_withdrawal_account(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_ok  boolean := false;
  v_rec withdrawal_accounts%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_rec FROM withdrawal_accounts WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_rec.owner_type = 'user' THEN
    v_ok := (v_rec.owner_id = v_uid);
  ELSIF v_rec.owner_type = 'store' THEN
    SELECT EXISTS(SELECT 1 FROM stores s WHERE s.id = v_rec.owner_id AND s.owner_id = v_uid) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM withdrawal_accounts WHERE id = p_id;

  IF v_rec.is_default THEN
    UPDATE withdrawal_accounts SET is_default = true
     WHERE owner_id = v_rec.owner_id AND owner_type = v_rec.owner_type
       AND id = (SELECT id FROM withdrawal_accounts
                 WHERE owner_id = v_rec.owner_id AND owner_type = v_rec.owner_type
                 ORDER BY created_at DESC LIMIT 1);
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ 00123 已保存收款账户体系就绪（表 withdrawal_accounts；RPC: fn_get_withdrawal_accounts / fn_save_withdrawal_account / fn_delete_withdrawal_account）';
END $$;
