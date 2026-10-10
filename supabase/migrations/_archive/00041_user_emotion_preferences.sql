-- ============================================
-- 用户情绪偏好表
-- 创建时间: 2026-07-07
-- 说明: 原 create_user_emotion_preferences.sql 为游离文件，从未纳入迁移、未推上云，
--       导致 emotion-recommendation.ts 查询报 404（Could not find the table）。
--       此处收编为正式迁移，幂等、可重复执行。
-- ============================================

-- 通用 updated_at 触发器函数（如已存在则覆盖，幂等）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 用户情绪偏好表
CREATE TABLE IF NOT EXISTS public.user_emotion_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE,
  mood_tags   TEXT[],
  action      TEXT CHECK (action IN ('view', 'click', 'purchase')),
  weight      INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_emotion_preferences_user_id
  ON public.user_emotion_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_preferences_mood_tags
  ON public.user_emotion_preferences USING GIN (mood_tags);

DROP TRIGGER IF EXISTS update_user_emotion_preferences_updated_at
  ON public.user_emotion_preferences;
CREATE TRIGGER update_user_emotion_preferences_updated_at
  BEFORE UPDATE ON public.user_emotion_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 禁用 RLS（测试阶段，与项目既有表一致）
ALTER TABLE public.user_emotion_preferences DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_emotion_preferences
  IS '用户情绪偏好（浏览/点击/购买行为汇总），用于情绪推荐引擎加权';
