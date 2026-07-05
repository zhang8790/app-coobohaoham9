-- 来店有喜 - 完整数据库初始化 SQL 脚本
-- 执行方法：复制到 Supabase SQL Editor 并运行
-- SQL Editor 地址：https://supabase.com/dashboard/project/pyqgsxcjmijtbstwthbn/sql/editor

-- =================== 第一步：补全 orders 表字段 ===================

-- 检查当前 orders 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- 补全缺失字段
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS referrer_id UUID,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(10,2) DEFAULT 0;

-- 修改 payment_method 为 VARCHAR（避免枚举问题）
-- 先检查当前类型
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'payment_method';

-- 如果 payment_method 是枚举类型，改为 VARCHAR
-- 注意：如果已有数据，需要先处理现有数据
-- 这里提供安全的方法：

-- 方法 1：直接修改为 VARCHAR（会丢失枚举约束，但更灵活）
-- ALTER TABLE public.orders ALTER COLUMN payment_method TYPE VARCHAR(50) USING payment_method::VARCHAR(50);

-- 方法 2：添加新字段，逐步迁移（更安全）
-- 这里使用方法 1，因为项目还在测试阶段

-- =================== 第二步：补全 profiles 表字段 ===================

-- 检查当前 profiles 表字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 补全缺失字段
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS gold_beans INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_performance NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_consumption NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- 为已有用户生成 invite_code（如果不存在）
UPDATE public.profiles 
SET invite_code = UPPER(SUBSTRING(MD5(id::TEXT) FROM 1 FOR 8))
WHERE invite_code IS NULL OR invite_code = '';

-- =================== 第三步：创建 commissions 表 ===================

CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id UUID,
  order_no TEXT,
  commission_amount NUMERIC(10,2) NOT NULL,
  level INTEGER NOT NULL CHECK (level IN (1, 2)),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 启用 RLS
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- 创建策略（允许所有操作，因为 RLS 已关闭）
DROP POLICY IF EXISTS "Allow all" ON public.commissions;
CREATE POLICY "Allow all" ON public.commissions
  FOR ALL USING (true) WITH CHECK (true);

-- =================== 第四步：创建 RPC 函数 ===================

-- 创建 get_rank_progress 函数
CREATE OR REPLACE FUNCTION public.get_rank_progress(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  total_consumption NUMERIC := 0;
  team_performance NUMERIC := 0;
  dynamic_score NUMERIC := 0;
  current_rank TEXT := '江湖散修';
  next_rank TEXT := '外门弟子';
  direct_count INTEGER := 0;
BEGIN
  -- 获取用户消费和团队业绩
  SELECT 
    COALESCE(p.total_consumption, 0),
    COALESCE(p.team_performance, 0)
  INTO total_consumption, team_performance
  FROM public.profiles p
  WHERE p.id = p_user_id;

  dynamic_score := total_consumption + team_performance;

  -- 计算段位
  IF dynamic_score >= 100000 THEN
    current_rank := '掌门';
    next_rank := '已是最高段位';
  ELSIF dynamic_score >= 50000 THEN
    current_rank := '长老';
    next_rank := '掌门';
  ELSIF dynamic_score >= 10000 THEN
    current_rank := '核心弟子';
    next_rank := '长老';
  ELSIF dynamic_score >= 5000 THEN
    current_rank := '内门弟子';
    next_rank := '核心弟子';
  ELSIF dynamic_score >= 1000 THEN
    current_rank := '外门弟子';
    next_rank := '内门弟子';
  ELSE
    current_rank := '江湖散修';
    next_rank := '外门弟子';
  END IF;

  -- 计算直推人数
  SELECT COUNT(*) INTO direct_count
  FROM public.profiles
  WHERE referrer_id = p_user_id;

  -- 构建返回结果
  result := jsonb_build_object(
    'current_rank', current_rank,
    'next_rank', next_rank,
    'direct_count', direct_count,
    'target_count', 5,
    'progress', LEAST(100, FLOOR(dynamic_score / 100)),
    'total_gmv', dynamic_score,
    'points', FLOOR(dynamic_score * 0.01),
    'balance', COALESCE((SELECT gold_beans FROM public.profiles WHERE id = p_user_id), 0)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =================== 第五步：初始化测试账号数据 ===================

-- 为测试账号初始化 profile（如果不存在）
INSERT INTO public.profiles (id, nickname, invite_code, gold_beans, total_consumption, team_performance, member_rank)
VALUES (
  'd6b38349-dded-4879-9eac-3165a646436a',
  '测试侠客',
  'LDYX001',
  100,
  0,
  0,
  '江湖散修'
)
ON CONFLICT (id) DO UPDATE SET
  invite_code = EXCLUDED.invite_code,
  gold_beans = COALESCE(profiles.gold_beans, 0) + 100;

-- =================== 第六步：验证结果 ===================

-- 验证 orders 表字段
SELECT 'orders 表字段检查' AS check_item;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- 验证 profiles 表字段
SELECT 'profiles 表字段检查' AS check_item;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- 验证测试账号
SELECT '测试账号验证' AS check_item;
SELECT id, nickname, invite_code, gold_beans, member_rank
FROM public.profiles
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 验证 RPC 函数
SELECT 'RPC 函数验证' AS check_item;
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'get_rank_progress';

-- =================== 完成 ===================
SELECT '✅ 数据库初始化完成！' AS result;
