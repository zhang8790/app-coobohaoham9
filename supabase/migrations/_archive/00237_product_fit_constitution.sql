-- 00237 商品「适合人群」辨证增强：手动覆盖 + 适配体质/人群标签
-- fit_people_override：商家手填的适合人群文本，优先级高于引擎自动生成；空时回退引擎结果
-- fit_crowd_tags：商家/引擎标记的适配体质或人群标签（取自身体/健康人群词表：
--   宫寒量少 / 脾胃虚寒 / 易上火 / 体虚怕冷 / 高血压 / 失眠 …），用于详情页辨证标签与个性化匹配
-- 注：须在用户本机执行（沙箱无 supabase CLI/Token）；幂等，可重复运行。

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fit_people_override text NULL,
  ADD COLUMN IF NOT EXISTS fit_crowd_tags text[] NULL;

CREATE INDEX IF NOT EXISTS idx_products_fit_crowd_tags
  ON public.products USING gin (fit_crowd_tags);

COMMENT ON COLUMN public.products.fit_people_override IS
  '商家手填适合人群（覆盖引擎自动生成）；空则回退 therapy_json/fit_people 引擎结果';
COMMENT ON COLUMN public.products.fit_crowd_tags IS
  '适配体质/人群标签（宫寒量少/脾胃虚寒/高血压…），用于辨证标签展示与个性化匹配';
