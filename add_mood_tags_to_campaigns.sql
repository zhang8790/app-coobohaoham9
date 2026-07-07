-- 添加情绪标签到营销活动表
ALTER TABLE marketing_campaigns 
ADD COLUMN IF NOT EXISTS mood_tags text[];

-- 添加情绪化文案字段
ALTER TABLE marketing_campaigns 
ADD COLUMN IF NOT EXISTS emotion_copy text;

-- 禁用 RLS（测试阶段）
ALTER TABLE marketing_campaigns DISABLE ROW LEVEL SECURITY;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_mood_tags 
ON marketing_campaigns USING GIN(mood_tags);

-- 验证
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;
