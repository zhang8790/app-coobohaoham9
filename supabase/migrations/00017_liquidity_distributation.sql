-- =====================================================
-- 流动性二级分销 + 段位系统 数据库迁移
-- 基于现有 V4 六段位系统，新增流动一级机制
-- 执行前请备份数据库
-- =====================================================

-- 1. orders 表加流动一级相关字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_income NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false;

-- 2. profiles 表加段位缓存字段（避免每次计算）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank TEXT DEFAULT '江湖散修';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dynamic_score NUMERIC(10,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_recruit_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consecutive_zero_months INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_promoter BOOLEAN DEFAULT false;  -- 是否推广员
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS promoter_status TEXT DEFAULT 'none';  -- none/pending/approved

-- 3. commissions 表加类型字段
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'static';
-- 'static_l1' = 静态一级，'static_l2' = 静态二级，'dynamic_l1' = 流动一级

-- 4. 新增防刷单风控表
CREATE TABLE IF NOT EXISTS order_risk_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  risk_type TEXT NOT NULL,  -- 'self_dealing'/'loop_referral'/'high_frequency'/'points_arbitrage'
  risk_level TEXT NOT NULL, -- 'low'/'medium'/'high'
  description TEXT,
  handled BOOLEAN DEFAULT false,
  handled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 新增用户绑定关系表（流动一级绑定）
CREATE TABLE IF NOT EXISTS user_staff_bindings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  staff_id UUID REFERENCES profiles(id) NOT NULL,
  store_id UUID REFERENCES stores(id),
  bind_type TEXT DEFAULT 'scan',  -- 'scan'/'service'/'manual'
  expired_at TIMESTAMP,  -- 绑定过期时间（30天后）
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, staff_id)
);

-- 6. 更新 RANK_CONFIG 表（段位配置）
-- 如果不存在则创建
CREATE TABLE IF NOT EXISTS rank_configs (
  id SERIAL PRIMARY KEY,
  rank_name TEXT UNIQUE NOT NULL,
  min_dynamic_score NUMERIC(10,2) NOT NULL,
  l1_commission_rate NUMERIC(5,2) NOT NULL,
  l2_commission_rate NUMERIC(5,2) NOT NULL,
  points_rate NUMERIC(5,2) NOT NULL,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 插入/更新段位配置（如果 rank_configs 表已存在且缺少唯一约束，先添加）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_configs_rank_name_key') THEN
    ALTER TABLE rank_configs ADD CONSTRAINT rank_configs_rank_name_key UNIQUE (rank_name);
  END IF;
END $$;

INSERT INTO rank_configs (rank_name, min_dynamic_score, l1_commission_rate, l2_commission_rate, points_rate, icon, color)
VALUES
  ('江湖散修', 0,    0.40, 0.15, 0.10, '🍃', '#90EE90'),
  ('外门弟子', 500,  0.45, 0.18, 0.12, '🌟', '#50C878'),
  ('内门弟子', 2000, 0.50, 0.20, 0.13, '📚', '#4A90D9'),
  ('核心弟子', 5000, 0.54, 0.22, 0.14, '⚔️', '#CD7F32'),
  ('长老',    15000, 0.57, 0.24, 0.15, '🏯', '#C0C0C0'),
  ('掌门',    50000, 0.60, 0.25, 0.15, '👑', '#FFD700')
ON CONFLICT (rank_name) DO UPDATE SET
  l1_commission_rate = EXCLUDED.l1_commission_rate,
  l2_commission_rate = EXCLUDED.l2_commission_rate,
  points_rate = EXCLUDED.points_rate;

-- 7. 平台最低抽成配置表
CREATE TABLE IF NOT EXISTS platform_configs (
  id SERIAL PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO platform_configs (config_key, config_value, description)
VALUES
  ('min_platform_rate', '0.05', '平台最低抽成比例（让利池的5%）'),
  ('binding_valid_days', '30', '流动一级绑定有效期（天）'),
  ('max_orders_per_day', '10', '同一买家每日订单上限'),
  ('min_order_for_commission', '5', '最低计佣订单金额（元）'),
  ('refund_commission_recovery_days', '60', '退款追回佣金天数')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value;

-- 8. 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_staff_id ON orders(staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_commission_calculated ON orders(commission_calculated);
CREATE INDEX IF NOT EXISTS idx_profiles_rank ON profiles(rank);
CREATE INDEX IF NOT EXISTS idx_profiles_dynamic_score ON profiles(dynamic_score);
CREATE INDEX IF NOT EXISTS idx_user_staff_bindings_user_id ON user_staff_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_staff_bindings_staff_id ON user_staff_bindings(staff_id);
CREATE INDEX IF NOT EXISTS idx_order_risk_logs_order_id ON order_risk_logs(order_id);

-- 9. 关闭 RLS（测试阶段，正式上线前需配置）
ALTER TABLE order_risk_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_staff_bindings DISABLE ROW LEVEL SECURITY;
ALTER TABLE rank_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_configs DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 执行完成
-- =====================================================
-- 验证：
-- SELECT * FROM rank_configs;
-- SELECT * FROM platform_configs;
