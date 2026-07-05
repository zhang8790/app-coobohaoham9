-- 补全数据库缺失字段（2026-07-04）
-- 执行方式：在 Supabase Dashboard > SQL Editor 中执行

-- =====================
-- 1. profiles 表补全字段
-- =====================

-- 检查 profiles 表是否有 gold_beans 字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'gold_beans';

-- 如果不存在，添加 gold_beans 字段
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gold_beans INTEGER DEFAULT 0;

-- 检查是否有 total_consumption 字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'total_consumption';

-- 如果不存在，添加 total_consumption 字段
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS total_consumption NUMERIC DEFAULT 0;

-- 检查是否有 team_performance 字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'team_performance';

-- 如果不存在，添加 team_performance 字段
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS team_performance NUMERIC DEFAULT 0;

-- =====================
-- 2. orders 表补全字段
-- =====================

-- 检查 orders 表是否有 address 字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'address';

-- 如果不存在，添加 address 字段
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS address TEXT;

-- 检查 orders 表是否有 service_type 字段
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'service_type';

-- 如果不存在，添加 service_type 字段
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) DEFAULT 'self_pickup';

-- =====================
-- 3. 创建 points_logs 表（如果不存在）
-- =====================

CREATE TABLE IF NOT EXISTS points_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'earn' | 'redeem'
  source VARCHAR(50), -- 'purchase' | 'review' | 'checkin'
  related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS（如果 RLS 已关闭，可以跳过）
-- ALTER TABLE points_logs ENABLE ROW LEVEL SECURITY;

-- =====================
-- 4. 创建 user_addresses 表（如果不存在）
-- =====================

CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  province VARCHAR(50),
  city VARCHAR(50),
  district VARCHAR(50),
  detail TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS（如果 RLS 已关闭，可以跳过）
-- ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;

-- =====================
-- 5. 验证结果
-- =====================

-- 查看 profiles 表结构
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- 查看 orders 表结构
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- 查看所有表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
