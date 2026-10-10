-- 回滚：移除 store_categories.icon 列（场景图标恢复前端硬编码兜底）
ALTER TABLE public.store_categories DROP COLUMN IF EXISTS icon;
