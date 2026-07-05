-- ========================================
-- 一键修复脚本（2026-07-04）
-- 解决：订单创建失败 + 推广中心空白 + 段位空白
-- ========================================

-- 执行方式：在 Supabase Dashboard > SQL Editor 中执行

-- =====================
-- 第 1 步：补全 orders 表字段（解决订单创建失败）
-- =====================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) DEFAULT 'self_pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_no TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l1_commission NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l2_commission NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_income NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false;

-- payment_method 改为 TEXT 类型（避免枚举值不匹配导致 400 错误）
-- 注意：如果原来是 ENUM 类型，需要先转类型。这里用 IF NOT EXISTS 方式安全处理。

-- =====================
-- 第 2 步：补全 profiles 表字段
-- =====================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gold_beans INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_consumption NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_performance NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS member_rank VARCHAR(50) DEFAULT '江湖散修';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code VARCHAR(20);

-- 给测试账号初始化数据
UPDATE profiles SET
  gold_beans = COALESCE(gold_beans, 100),
  total_consumption = COALESCE(total_consumption, 0),
  team_performance = COALESCE(team_performance, 0),
  member_rank = COALESCE(member_rank, '江湖散修'),
  invite_code = COALESCE(invite_code, 'LDYX001')
WHERE phone = '18701410500' OR phone = '+8618701410500' OR email LIKE '%test%';

-- =====================
-- 第 3 步：创建 get_rank_progress 函数（解决推广中心空白）
-- =====================

CREATE OR REPLACE FUNCTION get_rank_progress(p_user_id UUID)
RETURNS TABLE (
  current_rank TEXT,
  next_rank TEXT,
  direct_count INT,
  target_count INT,
  progress INT,
  total_gmv NUMERIC,
  points INT,
  balance NUMERIC
) AS $$
DECLARE
  v_total_consumption NUMERIC;
  v_team_performance NUMERIC;
  v_direct_count INT;
  v_current_rank TEXT := '江湖散修';
BEGIN
  -- 获取用户消费数据
  SELECT COALESCE(total_consumption, 0), COALESCE(team_performance, 0)
  INTO v_total_consumption, v_team_performance
  FROM profiles WHERE id = p_user_id;

  -- 获取直推人数
  SELECT COUNT(*) INTO v_direct_count
  FROM profiles WHERE referrer_id = p_user_id;

  -- 计算当前段位（简化版 V4 算法）
  IF (v_total_consumption + v_team_performance) >= 100000 THEN
    v_current_rank := '掌门';
  ELSIF (v_total_consumption + v_team_performance) >= 50000 THEN
    v_current_rank := '长老';
  ELSIF (v_total_consumption + v_team_performance) >= 10000 THEN
    v_current_rank := '核心弟子';
  ELSIF (v_total_consumption + v_team_performance) >= 5000 THEN
    v_current_rank := '内门弟子';
  ELSIF (v_total_consumption + v_team_performance) >= 1000 THEN
    v_current_rank := '外门弟子';
  ELSE
    v_current_rank := '江湖散修';
  END IF;

  -- 返回结果
  RETURN QUERY SELECT
    v_current_rank AS current_rank,
    CASE v_current_rank
      WHEN '江湖散修' THEN '外门弟子'
      WHEN '外门弟子' THEN '内门弟子'
      WHEN '内门弟子' THEN '核心弟子'
      WHEN '核心弟子' THEN '长老'
      WHEN '长老' THEN '掌门'
      ELSE NULL
    END AS next_rank,
    v_direct_count AS direct_count,
    CASE v_current_rank
      WHEN '江湖散修' THEN 5
      WHEN '外门弟子' THEN 10
      WHEN '内门弟子' THEN 30
      WHEN '核心弟子' THEN 50
      WHEN '长老' THEN 100
      ELSE 0
    END AS target_count,
    LEAST(v_direct_count * 10, 100) AS progress,
    (v_total_consumption + v_team_performance) AS total_gmv,
    FLOOR((v_total_consumption + v_team_performance) * 0.01) AS points,
    COALESCE((SELECT gold_beans FROM profiles WHERE id = p_user_id), 0) AS balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================
-- 第 4 步：确保 commissions 表存在且有正确字段
-- =====================

CREATE TABLE IF NOT EXISTS commissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  beneficiary_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  payer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  level INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  settled_at TIMESTAMP WITH TIME ZONE
);

-- 启用 RLS（如果已关闭则跳过）
-- ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- =====================
-- 第 5 步：验证所有修复
-- =====================

SELECT 'orders 表字段' as table_name, column_name, data_type
FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('service_type','address','gold_beans_used')
UNION ALL
SELECT 'profiles 表字段', column_name, data_type
FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('gold_beans','invite_code','total_consumption')
ORDER BY table_name, column_name;

-- 验证测试账号数据
SELECT id, nickname, phone, gold_beans, invite_code, member_rank, total_consumption
FROM profiles
WHERE phone = '18701410500' OR email LIKE '%test%';

-- 验证函数存在
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'get_rank_progress';
