-- 迁移：增加 team_performance 字段到 profiles 表
-- 用途：存储用户团队业绩，用于计算分佣比例
-- 团队业绩 = 直接下线消费总额 + 间接下线消费总额 × 0.5

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS team_performance NUMERIC(10, 2) DEFAULT 0;

-- 添加注释
COMMENT ON COLUMN profiles.team_performance IS '团队业绩（直接下线消费 + 间接下线消费×0.5）';

-- 创建索引（用于查询团队业绩排名）
CREATE INDEX IF NOT EXISTS idx_profiles_team_performance ON profiles(team_performance DESC);

-- 初始化现有用户的 team_performance（可选，根据实际情况）
-- 注意：这个更新需要在应用层实现，因为需要递归查询下线
-- 这里只是创建字段和索引
