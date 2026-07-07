-- 用户情绪偏好表
CREATE TABLE IF NOT EXISTS user_emotion_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  mood_tags text[],  -- 商品情绪标签
  action text CHECK (action IN ('view', 'click', 'purchase')),
  weight integer DEFAULT 1,  -- 权重：view=1, click=2, purchase=3
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 禁用 RLS（测试阶段）
ALTER TABLE user_emotion_preferences DISABLE ROW LEVEL SECURITY;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_emotion_preferences_user_id ON user_emotion_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_preferences_mood_tags ON user_emotion_preferences USING GIN(mood_tags);

-- 创建更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_user_emotion_preferences_updated_at
  BEFORE UPDATE ON user_emotion_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
