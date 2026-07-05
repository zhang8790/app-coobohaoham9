-- ============================================================
-- 来店有喜 - 完整初始化脚本（一键执行）
-- 创建日期: 2026-07-04
-- 说明: 创建测试账号 + 补全所有缺失字段 + 初始化数据
-- ============================================================

-- 步骤 1: 创建测试账号（如果不存在）
-- 注意：这个脚本需要在 Supabase Dashboard → SQL Editor 中执行
-- 因为 auth.users 表需要通过 Dashboard 或 Admin API 创建

-- 先检查测试账号是否存在
DO $$
DECLARE
  test_user_id UUID;
BEGIN
  -- 查找测试账号
  SELECT id INTO test_user_id
  FROM auth.users
  WHERE email = 'test18701410500@test.com';
  
  IF test_user_id IS NULL THEN
    RAISE NOTICE '测试账号不存在，请通过 Dashboard 创建';
    RAISE NOTICE 'URL: https://supabase.com/dashboard/project/pyqgsxcjmijtbstwthbn/auth/users';
    RAISE NOTICE 'Email: test18701410500@test.com';
    RAISE NOTICE 'Password: 12345678';
    RAISE NOTICE '勾选 "Auto Confirm User"';
  ELSE
    RAISE NOTICE '测试账号已存在: %', test_user_id;
  END IF;
END $$;

-- 步骤 2: 补全 orders 表字段（如果不存在）
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) CHECK (service_type IN ('dine_in','delivery')) DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_order_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address_json JSONB,
  ADD COLUMN IF NOT EXISTS remark TEXT,
  ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) CHECK (refund_status IN ('none','pending','approved','rejected','refunded')) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2) DEFAULT 0;

-- 步骤 3: 补全 profiles 表字段
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gold_beans INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invite_code VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS member_rank VARCHAR(20) DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS team_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direct_team_count INTEGER DEFAULT 0;

-- 步骤 4: 创建 commissions 表（如果不存在）
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  level INTEGER NOT NULL CHECK (level IN (1,2)),
  commission_amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','settled')) DEFAULT 'pending',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 步骤 5: 创建 get_rank_progress 函数
CREATE OR REPLACE FUNCTION get_rank_progress(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'current_rank', COALESCE(p.member_rank, 'bronze'),
    'next_rank', CASE 
      WHEN COALESCE(p.member_rank, 'bronze') = 'bronze' THEN 'silver'
      WHEN p.member_rank = 'silver' THEN 'gold'
      WHEN p.member_rank = 'gold' THEN 'diamond'
      ELSE 'max'
    END,
    'team_count', COALESCE(p.team_count, 0),
    'direct_team_count', COALESCE(p.direct_team_count, 0),
    'total_commission', COALESCE(p.total_commission, 0),
    'next_rank_requirement', CASE 
      WHEN COALESCE(p.member_rank, 'bronze') = 'bronze' THEN jsonb_build_object('team_count', 5, 'direct_team_count', 2)
      WHEN p.member_rank = 'silver' THEN jsonb_build_object('team_count', 20, 'direct_team_count', 5)
      WHEN p.member_rank = 'gold' THEN jsonb_build_object('team_count', 50, 'direct_team_count', 10)
      ELSE jsonb_build_object('team_count', 999999, 'direct_team_count', 999999)
    END
  ) INTO result
  FROM profiles p
  WHERE p.id = p_user_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 步骤 6: 给测试账号初始化金豆和邀请码
UPDATE profiles 
SET 
  gold_beans = COALESCE(gold_beans, 0) + 100,
  invite_code = COALESCE(invite_code, 'LDYX001')
WHERE id = (SELECT id FROM auth.users WHERE email = 'test18701410500@test.com' LIMIT 1);

-- 步骤 7: 验证结果
SELECT '=== 验证结果 ===' as info;

-- 检查 orders 表字段
SELECT 'orders 表字段:' as info, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('service_type', 'address', 'gold_beans_used', 'store_id')
ORDER BY column_name;

-- 检查测试账号
SELECT '测试账号:' as info, email, created_at 
FROM auth.users 
WHERE email = 'test18701410500@test.com';

-- 检查测试账号 profile
SELECT '测试账号 profile:' as info, p.invite_code, p.gold_beans, p.member_rank
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'test18701410500@test.com';

-- 完成提示
SELECT '✅ 初始化完成！现在可以登录并测试了。' as result;
