-- 00113 修复推荐绑定：convert_pending_referral 必须同时写 profiles.referrer_id
-- 背景：原 00035 函数只把推广码文本写进 invited_by，没写 referrer_id（uuid 上级），
-- 导致新注册用户既不在「我的好友」里，也无法触发分佣。
-- 本脚本：
--   1) 修复 convert_pending_referral，转化时同时 SET referrer_id = v_referrer_id
--   2) 回刷存量：invited_by 是推广码文本且 referrer_id 为空的用户，按 invite_code/referral_code 找到上级并补 referrer_id

-- 1. 修复 DB 转化函数
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
  -- 查找最近的 pending 记录
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

  -- 获取推荐人 ID（优先 invite_code，兼容 referral_code）
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE invite_code = v_referral_code OR referral_code = v_referral_code
  LIMIT 1;

  -- 更新 pending 记录状态
  UPDATE pending_referrals
  SET status = 'converted',
      converted_user_id = p_user_id::UUID,
      updated_at = now()
  WHERE id = v_pending_id;

  -- 写入 user_store_relation（锁客关系）
  IF v_store_id IS NOT NULL AND v_referrer_id IS NOT NULL THEN
    INSERT INTO user_store_relation (user_id, store_id, referrer_id, status)
    VALUES (p_user_id::UUID, v_store_id, v_referrer_id, 'active')
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  -- 更新 profiles：保留 invited_by（推广码文本）用于追溯，同时写 referrer_id（uuid 上级）用于分佣/好友列表
  UPDATE profiles
  SET invited_by = COALESCE(invited_by, v_referral_code),
      referrer_id = COALESCE(referrer_id, v_referrer_id)
  WHERE id = p_user_id::UUID;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 回刷存量：invited_by 为推广码文本且 referrer_id 为空的用户
DO $$
DECLARE
  v_count int;
BEGIN
  UPDATE profiles p
  SET referrer_id = r.id
  FROM profiles r
  WHERE p.invited_by IS NOT NULL
    AND p.referrer_id IS NULL
    AND (r.invite_code = p.invited_by OR r.referral_code = p.invited_by);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ 回刷 % 个用户的 referrer_id', v_count;
END $$;
