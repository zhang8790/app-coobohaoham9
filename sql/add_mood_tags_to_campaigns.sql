-- 添加情绪标签字段到营销活动表
ALTER TABLE marketing_campaigns 
ADD COLUMN IF NOT EXISTS mood_tags text[];

COMMENT ON COLUMN marketing_campaigns.mood_tags IS '情绪标签（中文）';

-- 添加情绪标签字段到商品评价表
ALTER TABLE product_reviews 
ADD COLUMN IF NOT EXISTS mood_tags text[];

COMMENT ON COLUMN product_reviews.mood_tags IS '情绪标签（中文）';

-- 创建用户情绪偏好表
CREATE TABLE IF NOT EXISTS user_mood_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  mood_tag text NOT NULL,
  score integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now()
);

-- 禁用RLS（测试阶段）
ALTER TABLE user_mood_preferences DISABLE ROW LEVEL SECURITY;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_mood_preferences_user_id 
ON user_mood_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_user_mood_preferences_mood_tag 
ON user_mood_preferences(mood_tag);

-- 验证
SELECT 'marketing_campaigns' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'marketing_campaigns' AND column_name = 'mood_tags'
UNION ALL
SELECT 'product_reviews' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'product_reviews' AND column_name = 'mood_tags';
