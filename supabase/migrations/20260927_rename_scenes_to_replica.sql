-- 20260927 八大场景命名对齐首页 UI 复刻（replica）
-- 5 个场景名由「库锁定旧名」改为「截图新名」，使首页金刚区/落地页/好物页左栏与截图一致。
-- 前端常量已同步：CategoryGrid.CAT_EMOJI / NEED_MAP(need-find) / SCENE_BY_CROWD(food) / QUICK_BODY_PRESETS(crowd-nlu)。
-- 首页 CategoryGrid 暂用 SCENE_ALIAS 桥接旧名→新名，本迁移执行后桥接自动失效。

UPDATE public.store_categories SET name = '老年养生' WHERE name = '银发呵护';
UPDATE public.store_categories SET name = '舒心食养' WHERE name = '睡前安适';
UPDATE public.store_categories SET name = '温润食养' WHERE name = '体虚调理';
UPDATE public.store_categories SET name = '肠胃食养' WHERE name = '肠胃养护';
UPDATE public.store_categories SET name = '熬夜加餐' WHERE name = '熬夜党';

-- 名称已改，按新名补图标（幂等：仅当 icon 为空时写回，避免覆盖后台自定义 emoji）
UPDATE public.store_categories SET icon = '👵' WHERE name = '老年养生' AND icon IS NULL;
UPDATE public.store_categories SET icon = '🌙' WHERE name = '舒心食养' AND icon IS NULL;
UPDATE public.store_categories SET icon = '💪' WHERE name = '温润食养' AND icon IS NULL;
UPDATE public.store_categories SET icon = '🥣' WHERE name = '肠胃食养' AND icon IS NULL;
UPDATE public.store_categories SET icon = '⚡' WHERE name = '熬夜加餐'  AND icon IS NULL;
