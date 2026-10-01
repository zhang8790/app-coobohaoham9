-- 00237 锁客优先级 + 收藏锁客来源（审计修复 B）
-- 背景：审计发现两个真实边界：
--   1) 门店自动绑定（store_default）触发面过宽，会「截胡」推广员地推
--   2) 从「我的收藏」进商品不携带推广来源，锁客丢失给门店 owner
-- 本脚本引入 referrer_source 标记来源优先级，并让收藏记录推广码以便还原。
-- 铁律：改函数参数须 DROP 旧签名再 CREATE；幂等，可重复执行。

-- 1) profiles 增加 referrer_source：标记客户归属来源，用于优先级判定
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referrer_source text;

COMMENT ON COLUMN public.profiles.referrer_source IS
  '客户归属来源：store_default=门店/门店码自动绑定(兜底) | share=分享/邀请码绑定(显式) | qr=二维码显式绑定 | manual=后台显式绑定。store_default 可被任意显式来源覆盖';

-- 回刷存量：已有 referrer_id 但 source 为空 → 按 invited_by 推断（有邀请码文本≈显式，否则门店兜底）
UPDATE public.profiles
SET referrer_source = CASE WHEN invited_by IS NOT NULL THEN 'share' ELSE 'store_default' END
WHERE referrer_id IS NOT NULL AND referrer_source IS NULL;

-- 2) favorites 增加 referral_code：记录收藏时的推广来源，避免收藏→商品详情丢失锁客
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS referral_code text;

COMMENT ON COLUMN public.favorites.referral_code IS
  '收藏时的推广来源码；从收藏进商品详情时还原为 ref 参数，优先于门店默认绑定';

-- 3) bind_referrer 改造：引入 p_source，实现「显式来源可覆盖门店默认」
-- ⚠️ 幂等铁律：改函数参数必须 DROP 新旧「全部」签名，再 CREATE。
--    只删旧签名而用普通 CREATE 建新签名 → 重跑撞 42723（function already exists with same argument types）。
--    且旧的 1 参签名若残留，与「带 DEFAULT 的 2 参签名」并存会让单参调用报 42725（函数不唯一）——
--    客户端 login/index.tsx、utils/share.ts 都是单参调用，故 1 参签名必须删净。
DROP FUNCTION IF EXISTS public.bind_referrer(text);
DROP FUNCTION IF EXISTS public.bind_referrer(text, text);

CREATE FUNCTION public.bind_referrer(
  p_referral_code text,
  p_source text DEFAULT 'share'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_referrer RECORD;
  v_self_code text;
  v_existing_source text;
  v_existing_id uuid;
BEGIN
  -- 避免自绑
  SELECT referral_code INTO v_self_code FROM public.profiles WHERE id = auth.uid();
  IF v_self_code = upper(trim(p_referral_code)) THEN
    RETURN jsonb_build_object('success', false, 'error', '不能绑定自己的推广码');
  END IF;

  -- 查推广人
  SELECT id, referral_code INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_referral_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '推广码不存在');
  END IF;

  -- 查现有绑定与来源
  SELECT referrer_id, referrer_source INTO v_existing_id, v_existing_source
  FROM public.profiles WHERE id = auth.uid();

  -- 已绑定：
  IF v_existing_source IS NOT NULL THEN
    -- a) 现有是 store_default（门店兜底），新来源是显式（share/qr/manual/invite_code）→ 允许覆盖升级
    -- b) 其它（已显式绑定）→ 跳过，保护既有推广员权益
    IF NOT (v_existing_source = 'store_default' AND p_source IN ('share', 'qr', 'manual', 'invite_code')) THEN
      RETURN jsonb_build_object('success', true, 'message', '已绑定', 'referrer_id', v_existing_id, 'source', v_existing_source);
    END IF;
  END IF;

  UPDATE public.profiles
  SET referrer_id = v_referrer.id,
      referrer_source = p_source
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer.id, 'source', p_source);
END;
$$;

-- DROP 会连带清掉原函数 ACL，显式还原执行权限（客户端 anon/authenticated 需可调用）
GRANT EXECUTE ON FUNCTION public.bind_referrer(text, text) TO anon, authenticated, service_role;

-- 4) convert_pending_referral 同步写 referrer_source（注册转化走的是显式分享/邀请来源）
CREATE OR REPLACE FUNCTION convert_pending_referral(
  p_device_id TEXT,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referral_code TEXT;
  v_store_id UUID;
  v_pending_id UUID;
  v_referrer_id UUID;
BEGIN
  SELECT id, referral_code, store_id
  INTO v_pending_id, v_referral_code, v_store_id
  FROM pending_referrals
  WHERE device_id = p_device_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE invite_code = v_referral_code OR referral_code = v_referral_code
  LIMIT 1;

  UPDATE pending_referrals
  SET status = 'converted',
      converted_user_id = p_user_id::UUID,
      updated_at = now()
  WHERE id = v_pending_id;

  IF v_store_id IS NOT NULL AND v_referrer_id IS NOT NULL THEN
    INSERT INTO user_store_relation (user_id, store_id, referrer_id, status)
    VALUES (p_user_id::UUID, v_store_id, v_referrer_id, 'active')
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  UPDATE profiles
  SET invited_by = COALESCE(invited_by, v_referral_code),
      referrer_id = COALESCE(referrer_id, v_referrer_id),
      referrer_source = COALESCE(referrer_source, 'share')
  WHERE id = p_user_id::UUID;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ 00237 锁客优先级 + 收藏锁客来源 已就绪' AS result;
