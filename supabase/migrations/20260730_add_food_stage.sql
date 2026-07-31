-- 20260730 商品食养阶段 food_stage（清/通/调/补/固）
-- 用于「清通调补固」食养导购模块：空值时由 ingredients 主导功效确定性派生，
-- 商家可在商品编辑页人工覆盖（微调）。仅新增一列，不影响既有列与 RLS。
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS food_stage text;

-- 取值约束：仅允许 清/通/调/补/固，其余(null)表示未标注→由引擎派生
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_food_stage_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_food_stage_check
      CHECK (food_stage IS NULL OR food_stage IN ('清','通','调','补','固'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.food_stage IS
  '食养阶段（清/通/调/补/固）。空=由 ingredients 主导功效派生；商家可在编辑页人工微调覆盖。';
