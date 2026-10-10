-- 00208_drop_junk_objects
-- 清理两类确认无用的数据库对象（已核验零引用 + 数据可安全丢弃）
--
-- 1) 表名是 Windows 绝对路径的怪表
--    C:\Users\zhanglin\Desktop\app-coobohaoham9\supabase\cloud_init.
--    成因：某次执行把文件路径当成了表名。仅 id / created_at 两列，代码零引用。
--    注：表名含反斜杠，静态 SQL 会被客户端转义，必须用 format() + regclass 动态执行。
--
-- 2) oic_bk_20260730
--    order_item_commissions 的 2026-07-30 备份（37 列，与主表完全一致）。
--    核验：164 行，与主表按 id 比对「独有行 = 0」→ 完全是主表 438 行的子集，可安全丢弃。
--
-- 幂等：DROP 前先判断存在性，重复执行无副作用。

BEGIN;

-- ---------- 1. 怪表（动态 SQL，因表名含反斜杠）----------
DO $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tn, c.relname AS nm
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relname LIKE '%cloud_init%'
      AND c.relname LIKE '%:%'          -- 只命中含盘符的异常名，避免误伤正常表
  LOOP
    EXECUTE format('SELECT count(*) FROM %s', r.tn) INTO n;
    EXECUTE format('DROP TABLE %s CASCADE', r.tn);
    RAISE NOTICE '[00208] dropped junk table "%" (rows=%)', r.nm, n;
  END LOOP;
END $$;

-- ---------- 2. 佣金备份表 ----------
DROP TABLE IF EXISTS public."oic_bk_20260730";

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public'
--   AND (table_name LIKE '%cloud_init%' OR table_name LIKE 'oic_bk%');
-- 预期：0 行
