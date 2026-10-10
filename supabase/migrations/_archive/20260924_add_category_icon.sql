-- 场景图标可后台更换：store_categories 加 icon 列（emoji 文本）
-- 执行位置：Supabase Dashboard → SQL Editor（沙箱无法跑 DDL，需手动执行）
-- 作用：金刚区图标不再硬编码在前端，改为读库内 icon，运营在「商品分类管理」后台可自由改。

ALTER TABLE public.store_categories ADD COLUMN IF NOT EXISTS icon text NULL;

-- 种子：把当前前端硬编码的 8 个场景 emoji 写回库（key 与 name 一致）。
-- 仅当 icon 为空时写入，避免覆盖运营已自定义的图标。
UPDATE public.store_categories SET icon = '🍼'  WHERE name = '宝宝零食'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🥕'  WHERE name = '孕产营养'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '👵'  WHERE name = '银发呵护'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🌙'  WHERE name = '睡前安适'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🥣'  WHERE name = '肠胃养护'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '💪'  WHERE name = '体虚调理'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🛡️' WHERE name = '敏感防护'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '⚡'  WHERE name = '熬夜党'    AND icon IS NULL;

COMMENT ON COLUMN public.store_categories.icon IS '场景图标（emoji 文本），金刚区与落地页读取；后台可编辑';
