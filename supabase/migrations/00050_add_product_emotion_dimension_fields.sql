-- 00050  商家情绪编译工作台：product_emotion 补全五维标签 / 质量分 / 审核态
-- ------------------------------------------------------------
-- 工作台（方案 §3）需要把商家「五维打标」结果、编译质量分、审核状态落库，
-- 原 product_emotion 仅有 emotion_title/emotion_detail/scene_tags_compiled/mood_tags_used，
-- 缺以下三列。本迁移补齐，全部幂等可重复执行。
--
-- 列说明：
--   dimension_tags  jsonb  —— 五维标签选择 {function:[],scene:[],emotion:[],identity:[],sensory:[]}
--   quality_score   smallint —— 编译质量评分（0~100，来自 emotion-scoring 引擎）
--   review_status   text   —— draft 草稿 / submitted 待审 / approved 通过 / rejected 驳回

-- 1. dimension_tags（默认空对象）
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS dimension_tags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. quality_score
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS quality_score smallint;

-- 3. review_status（带 CHECK 约束，默认 draft）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_emotion' AND column_name='review_status'
  ) THEN
    ALTER TABLE public.product_emotion
      ADD COLUMN review_status text NOT NULL DEFAULT 'draft';
  END IF;
END $$;

-- 4. CHECK 约束（幂等：先删后建）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_review_status_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_review_status_check
  CHECK (review_status IN ('draft','submitted','approved','rejected'));

-- 5. 评分范围约束（0~100，可选）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_quality_score_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_quality_score_check
  CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));

COMMENT ON COLUMN public.product_emotion.dimension_tags IS '五维情绪标签选择（功能/场景/情绪/身份/感官）';
COMMENT ON COLUMN public.product_emotion.quality_score IS '编译质量评分 0~100（emotion-scoring 引擎）';
COMMENT ON COLUMN public.product_emotion.review_status IS '情绪编译审核态：draft/submitted/approved/rejected';

SELECT '✅ 00050 完成：product_emotion 已补 dimension_tags / quality_score / review_status' AS result;
