-- ============================================
-- 食材食疗智能导购 · 用户反馈回流表
-- 创建时间: 2026-07-16
-- 说明:
--   1. food_therapy_feedback —— 记录用户与导购商品的交互事件（浏览/加购/购买/点赞/点踩）
--      用于「消费历史 + 体质权重学习闭环」：聚合用户对食疗标签的偏好，形成个性化权重。
--   2. 与项目既有表一致：DISABLE ROW LEVEL SECURITY（测试阶段）。
--   3. 个性化权重为轻量方案：统计各 health_tag 的正负反馈次数 → 打分加权，
--      无需训练模型（详见 src/utils/food-therapy/scoring.ts 的 scoreFoodTherapy weights 参数）。
-- ============================================

CREATE TABLE IF NOT EXISTS public.food_therapy_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  product_id  UUID,
  event_type  TEXT NOT NULL CHECK (event_type IN ('view','add_cart','purchase','like','dislike')),
  health_tag  TEXT[] DEFAULT '{}',
  emotion_tag TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ftf_user ON public.food_therapy_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ftf_user_event ON public.food_therapy_feedback(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ftf_product ON public.food_therapy_feedback(product_id);

-- ========== 禁用 RLS（与项目既有表一致）==========
ALTER TABLE public.food_therapy_feedback DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.food_therapy_feedback IS '食材食疗导购用户反馈回流 - 个性化权重学习数据（轻量统计，无训练）';

-- ✅ 完成！
