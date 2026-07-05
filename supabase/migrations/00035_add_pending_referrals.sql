-- 扫码即锁客：未注册用户也记录下线关系
-- 2026-07-05

-- 1. 创建 pending_referrals 表
CREATE TABLE IF NOT EXISTS pending_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,               -- 设备标识（微信 openid 或设备ID）
  referral_code TEXT NOT NULL,   -- 推广码（profiles.invite_code）
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'expired')),
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

-- 2. 添加索引
CREATE INDEX IF NOT EXISTS idx_pending_referrals_device_id ON pending_referrals(device_id);
CREATE INDEX IF NOT EXISTS idx_pending_referrals_referral_code ON pending_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_pending_referrals_status ON pending_referrals(status);
CREATE INDEX IF NOT EXISTS idx_pending_referrals_converted_user_id ON pending_referrals(converted_user_id);

-- 3. 添加注释
COMMENT ON TABLE pending_referrals IS '预锁客表：存储未注册用户的锁客关系';
COMMENT ON COLUMN pending_referrals.device_id IS '设备标识（微信 openid 或设备ID）';
COMMENT ON COLUMN pending_referrals.referral_code IS '推广码（对应 profiles.invite_code）';
COMMENT ON COLUMN pending_referrals.store_id IS '门店ID（如果是扫码进入门店）';
COMMENT ON COLUMN pending_referrals.campaign_id IS '活动ID（如果是活动分享）';
COMMENT ON COLUMN pending_referrals.status IS '状态：pending-待转化、converted-已转化、expired-已过期';
COMMENT ON COLUMN pending_referrals.converted_user_id IS '转化后的用户ID（注册后填入）';
COMMENT ON COLUMN pending_referrals.expires_at IS '过期时间（默认30天）';

-- 4. 启用 RLS
ALTER TABLE pending_referrals ENABLE ROW LEVEL SECURITY;

-- 5. 创建策略（允许匿名插入，允许服务角色读取）
CREATE POLICY IF NOT EXISTS "Allow anonymous insert" ON pending_referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow service role select" ON pending_referrals
  FOR SELECT USING (true);

-- 6. 创建自动过期函数
CREATE OR REPLACE FUNCTION update_expired_pending_referrals()
RETURNS void AS $$
BEGIN
  UPDATE pending_referrals
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. 创建转化函数（注册时调用）
CREATE OR REPLACE FUNCTION convert_pending_referral(
  p_device_id TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referral_code TEXT;
  v_store_id UUID;
  v_campaign_id UUID;
  v_pending_id UUID;
BEGIN
  -- 查找最近的 pending 记录
  SELECT id, referral_code, store_id, campaign_id
  INTO v_pending_id, v_referral_code, v_store_id, v_campaign_id
  FROM pending_referrals
  WHERE device_id = p_device_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 更新 pending 记录状态
  UPDATE pending_referrals
  SET status = 'converted',
      converted_user_id = p_user_id,
      updated_at = now()
  WHERE id = v_pending_id;

  -- 写入 user_store_relation（锁客关系）
  IF v_store_id IS NOT NULL THEN
    INSERT INTO user_store_relation (user_id, store_id, referrer_id, status, created_at)
    VALUES (
      p_user_id,
      v_store_id,
      (SELECT id FROM profiles WHERE invite_code = v_referral_code LIMIT 1),
      'active',
      now()
    )
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  -- 更新 profiles.invited_by
  UPDATE profiles
  SET invited_by = v_referral_code
  WHERE id = p_user_id
    AND invited_by IS NULL;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
