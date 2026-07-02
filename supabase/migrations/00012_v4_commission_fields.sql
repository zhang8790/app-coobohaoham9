-- V4分佣算法数据库迁移
-- 为profiles表添加V4算法需要的字段
-- 执行时间：2026-07-02

-- 添加V4分佣算法需要的字段到profiles表
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS total_consumption NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS team_performance NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_consumption NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS consecutive_zero_months INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS team_monthly_gmv NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_new_recruit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS months_since_last_recruit INTEGER DEFAULT 0;

-- 添加字段注释
COMMENT ON COLUMN profiles.total_consumption IS '个人累计消费金额（用于计算动态分数）';
COMMENT ON COLUMN profiles.team_performance IS '团队业绩（直接下线消费 + 间接下线消费×0.5）';
COMMENT ON COLUMN profiles.monthly_consumption IS '当月个人消费金额（用于判定活跃门槛）';
COMMENT ON COLUMN profiles.consecutive_zero_months IS '连续零消费月数（连续2个月则取消分佣资格）';
COMMENT ON COLUMN profiles.team_monthly_gmv IS '团队月度GMV（用于判定团队流水档位）';
COMMENT ON COLUMN profiles.has_new_recruit IS '当月是否有新增下线（用于拓新衰减机制）';
COMMENT ON COLUMN profiles.months_since_last_recruit IS '距离上次拓新的月数（用于拓新衰减机制）';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_total_consumption ON profiles(total_consumption);
CREATE INDEX IF NOT EXISTS idx_profiles_team_performance ON profiles(team_performance);
CREATE INDEX IF NOT EXISTS idx_profiles_monthly_consumption ON profiles(monthly_consumption);

-- 更新现有数据（可选，根据需要执行）
-- 将现有用户的total_consumption初始化为0
-- UPDATE profiles SET total_consumption = 0 WHERE total_consumption IS NULL;

-- 验证迁移是否成功
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' 
-- AND column_name IN ('total_consumption', 'team_performance', 'monthly_consumption', 'consecutive_zero_months', 'team_monthly_gmv', 'has_new_recruit', 'months_since_last_recruit');
