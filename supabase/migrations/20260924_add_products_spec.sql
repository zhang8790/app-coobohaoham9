-- 商品规格（净含量 / 包装文案）
--
-- 背景：products 表 65 列中不存在任何承载规格的列（无 spec / weight / net / unit / pack / size），
-- 而「食品选品种子_48SKU_2026-09-23.csv」第 7 列 spec_g（如 30 = 30g）早已设计好却从未入库。
-- 后果：商品卡只有「图 + 名 + 价」，缺了电商转化三件套里的规格，用户无法判断「这个价买到多少」。
--
-- 新增 spec 为一个纯展示字段（text），承载「30g」「100g × 2 袋」这类面向用户的规格文案。
-- 选填：无规格的商品前端不渲染该行，不受影响。

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS spec text;

COMMENT ON COLUMN public.products.spec IS '商品规格展示文案（如 30g / 100g × 2 袋），来源选品数据 spec_g，商品卡在商品名下方渲染';
