-- ========================================
-- 订单创建失败修复脚本（2026-07-04）
-- 错误信息："创建订单失败，请重试"
-- 原因：orders 表 / profiles 表 缺少必要字段
-- ========================================

-- 执行方式：在 Supabase Dashboard > SQL Editor 中执行
-- 项目 URL: https://supabase.com/dashboard/project/pyqgsxcjmijtbstwthbn

-- =====================
-- 第 1 步：查看 orders 表当前结构
-- =====================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- =====================
-- 第 2 步：补全 orders 表缺失字段
-- =====================

-- 2a. service_type（用餐方式）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) DEFAULT 'self_pickup';

-- 2b. address（收货地址）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT;

-- 2c. gold_beans_used（使用的金豆数）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0;

-- 2d. parent_order_no（父订单号，跨门店结算用）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_no TEXT;

-- 2e. referrer_id（推荐人 ID）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer_id UUID;

-- 2f. idempotency_key（幂等键）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 2g. commission_distributed（是否已分佣）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT false;

-- 2h. l1_commission（L1 佣金）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l1_commission NUMERIC DEFAULT 0;

-- 2i. l2_commission（L2 佣金）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l2_commission NUMERIC DEFAULT 0;

-- 2j. buyer_points（买家积分）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0;

-- 2k. platform_income（平台收入）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_income NUMERIC DEFAULT 0;

-- 2l. commission_calculated（是否已计算佣金）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false;

-- 2m. payment_method 改为 TEXT（避免枚举值不匹配）
-- 注意：如果原来是 ENUM 类型，需要先转类型
-- ALTER TABLE orders ALTER COLUMN payment_method TYPE VARCHAR(50) USING payment_method::VARCHAR(50);

-- =====================
-- 第 3 步：补全 profiles 表缺失字段
-- =====================

SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gold_beans';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gold_beans INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_consumption NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_performance NUMERIC DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by UUID;  -- 推荐人 ID

-- 如果测试账号还没有金豆，给测试账号初始化 100 金豆
UPDATE profiles SET gold_beans = 100 WHERE phone = '18701410500' OR phone = '+8618701410500';

-- =====================
-- 第 4 步：验证修复结果
-- =====================

-- 查看 orders 表所有字段
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- 查看测试账号的金豆余额
SELECT id, nickname, phone, gold_beans, total_consumption
FROM profiles
WHERE phone = '18701410500' OR phone = '+8618701410500' OR email LIKE '%test%';
