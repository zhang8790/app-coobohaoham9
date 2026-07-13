-- 添加情绪标签字段到营销活动表
ALTER TABLE marketing_campaigns 
ADD COLUMN IF NOT EXISTS mood_tags text[];

COMMENT ON COLUMN marketing_campaigns.mood_tags IS '情绪标签（中文）';

-- 商品评价表（若不存在则先建表，来自 00008 迁移）
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  content TEXT,
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "评价可公开读" ON product_reviews FOR SELECT USING (true);
CREATE POLICY "用户只能发布自己的评价" ON product_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

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
