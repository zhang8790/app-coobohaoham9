-- 只读探查：门店相关三张表的 store_id 真实类型 + 外键指向
-- 直接整段复制到 Supabase 控制台 SQL Editor 运行，不会改动任何数据

-- 1) 三张表 store_id 的真实类型
SELECT
  'stores.id'                  AS col,
  data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='stores'          AND column_name='id'

UNION ALL
SELECT
  'user_campaign_claims.store_id',
  data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='user_campaign_claims' AND column_name='store_id'

UNION ALL
SELECT
  'user_store_relation.store_id',
  data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='user_store_relation'  AND column_name='store_id';

-- 2) 涉及 store_id 的外键究竟指向谁
SELECT
  tc.constraint_name,
  kcu.table_name  AS child_table,
  kcu.column_name AS child_col,
  ccu.table_name  AS parent_table,
  ccu.column_name AS parent_col
FROM information_schema.table_constraints  tc
JOIN information_schema.key_column_usage    kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'store_id'
  AND kcu.table_name IN ('user_campaign_claims','user_store_relation','products','orders','marketing_campaigns');
