-- =====================================================================
-- 执行 pending_migrations_2026-07-09.sql 之后，粘贴本文件到 SQL Editor 验证
-- 作用：确认关键表 / 列 / 函数已建好（迁移成功的标准）
-- =====================================================================

-- 1. 关键表（情绪系统 + 确权 + 通宝/徽章）
select table_name from information_schema.tables
where table_name in (
  'product_emotion',
  'emotion_funnel_events',
  'emotion_claims',
  'emotion_assets',
  'emotion_tongbao_logs',
  'emotion_badge_grants'
)
order by table_name;

-- 2. profiles 关键列（00058 commission_balance / 00060 cv_total,tb_balance）
select column_name, data_type from information_schema.columns
where table_name = 'profiles'
  and column_name in ('commission_balance', 'cv_total', 'tb_balance')
order by column_name;

-- 3. 关键函数（00054 回滚/封禁 + claim_campaign + 评分引擎）
select routine_name from information_schema.routines
where routine_name in (
  'fn_void_emotion_claim',
  'fn_ban_user_rollback',
  'fn_total_cv',
  'claim_campaign',
  'recommend_dimensions',
  'score_compilation'
)
order by routine_name;

-- 4. 完成标记
select '✅ verify done' as status;
