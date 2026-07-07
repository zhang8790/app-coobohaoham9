-- ============================================================
-- 诊断：云端是否还有残留引用 team_performance 的对象
-- 执行时间：2026-07-07
-- 用途：只读探查，不改任何数据。在 Supabase Dashboard → SQL Editor 运行
-- 背景：已执行 00049 删除 profiles.team_performance 列 + 重建 get_rank_progress，
--       但云端可能还有别的历史函数/视图/触发器源码里引用该列，需确认无残留。
-- ============================================================

-- 1) 是否还有任何表的列名叫 team_performance（全 schema 扫描）
SELECT
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE column_name ILIKE '%team_performance%'
ORDER BY table_schema, table_name;

-- 2) 函数源码里是否出现 team_performance（含触发器函数）
--    pg_get_functiondef 返回完整函数定义文本，用 ILIKE 搜关键词
SELECT
  n.nspname  AS schema_name,
  p.proname  AS function_name,
  pg_get_functiondef(p.oid) ILIKE '%team_performance%' AS has_ref
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%team_performance%'
ORDER BY schema_name, function_name;

-- 3) 视图定义里是否出现 team_performance
SELECT
  table_schema,
  table_name,
  view_definition ILIKE '%team_performance%' AS has_ref
FROM information_schema.views
WHERE view_definition ILIKE '%team_performance%'
ORDER BY table_schema, table_name;

-- 4) 触发器函数（被触发器调用的函数）逐一定位其源码是否引用（复用上面的函数扫描即可，
--    这里单独列出当前库所有触发器，便于人工核对触发器的函数源码）
SELECT
  t.tgname      AS trigger_name,
  c.relname     AS table_name,
  p.proname     AS trigger_function,
  n.nspname     AS function_schema
FROM pg_trigger t
JOIN pg_class c   ON c.oid = t.tgrelid
JOIN pg_proc p    ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE NOT t.tgisinternal
ORDER BY table_name, trigger_name;

-- ============================================================
-- 结果判读：
--   - 以上 4 段若都返回 0 行（仅表头）→ 云端已无任何对象引用 team_performance，清理彻底完成 ✅
--   - 若第1段有行 → 还有别的表带该列，需要补 DROP COLUMN
--   - 若第2/3段有行 → 对应函数/视图源码仍引用已删列，调用会 500；需用 DROP+CREATE 重建该函数/视图
--   - 第4段仅作人工核对清单，本身不直接报引用，需结合第2段函数名确认
-- ============================================================
