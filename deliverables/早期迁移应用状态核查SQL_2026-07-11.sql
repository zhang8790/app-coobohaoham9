-- ============================================================
-- 早期迁移应用状态核查（2026-07-11）
-- 用法：整段粘进 Supabase SQL Editor → Run
-- 每段返回 OK / MISSING，一眼看出哪些迁移还没应用
-- 说明：用户曾用 Dashboard SQL Editor 手动跑过部分迁移，
--       故查 supabase_migrations 不可靠，这里直接查「实际 schema 对象」。
-- ============================================================

-- ---------- 00054：emotion_claims 扩展列 + 治理 RPC ----------
SELECT '00054 emotion_claims 12列' AS 检查项,
  CASE WHEN COUNT(*)=12 THEN 'OK ✅' ELSE 'MISSING('||COUNT(*)||'/12) ❌' END AS 状态
FROM information_schema.columns
WHERE table_name='emotion_claims'
  AND column_name IN ('tb_amount','cv_amount','badge_code','upline_l1','upline_l2',
                      'upline_l1_cv','upline_l2_cv','status','rule_version',
                      'voided_at','voided_reason','refund_ratio');

SELECT '00054 emotion_rule_versions 表' AS 检查项,
  CASE WHEN to_regclass('public.emotion_rule_versions') IS NOT NULL THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态;

SELECT '00054 profiles.is_banned' AS 检查项,
  CASE WHEN COUNT(*)=1 THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态
FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_banned';

SELECT '00054 orders.refund_ratio' AS 检查项,
  CASE WHEN COUNT(*)=1 THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态
FROM information_schema.columns WHERE table_name='orders' AND column_name='refund_ratio';

SELECT '00054 fn_void_emotion_claim' AS 检查项,
  CASE WHEN COUNT(*)>0 THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态
FROM pg_proc WHERE proname='fn_void_emotion_claim';

SELECT '00054 fn_ban_user_rollback' AS 检查项,
  CASE WHEN COUNT(*)>0 THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态
FROM pg_proc WHERE proname='fn_ban_user_rollback';

SELECT '00054 fn_total_cv' AS 检查项,
  CASE WHEN COUNT(*)>0 THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态
FROM pg_proc WHERE proname='fn_total_cv';

-- ---------- 00072：emotion_* 5 表 RLS 必须关闭（测试期）----------
SELECT relname AS 表名,
  CASE relrowsecurity WHEN false THEN 'OK ✅ 已关闭' ELSE '❌ 仍开启RLS' END AS 状态
FROM pg_class
WHERE relname IN ('emotion_claims','emotion_assets','emotion_tongbao_logs',
                  'emotion_badge_defs','emotion_badge_grants')
ORDER BY relname;

-- ---------- 00073：emo 徽章种子 ----------
SELECT '00073 emotion_badge_defs 行数' AS 检查项,
  COUNT(*)::text || CASE WHEN COUNT(*) >= 9 THEN '  OK ✅' ELSE '  ❌ 不足' END AS 状态
FROM emotion_badge_defs;

-- ---------- 00074：body_templates 列 + 非空种子 ----------
SELECT '00074 category_emotion_profiles.body_templates 列' AS 检查项,
  CASE WHEN COUNT(*)=1 THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态
FROM information_schema.columns
WHERE table_name='category_emotion_profiles' AND column_name='body_templates';

SELECT '00074 body_templates 非空行数' AS 检查项,
  COUNT(*)::text || CASE WHEN COUNT(*) > 0 THEN '  OK ✅' ELSE '  ❌ 全空' END AS 状态
FROM category_emotion_profiles
WHERE jsonb_array_length(COALESCE(body_templates,'[]'::jsonb)) > 0;

-- ---------- 00076：gold_bean_logs 表 ----------
SELECT '00076 gold_bean_logs 表' AS 检查项,
  CASE WHEN to_regclass('public.gold_bean_logs') IS NOT NULL THEN 'OK ✅' ELSE 'MISSING ❌' END AS 状态;

-- ---------- 00077：withdrawals 真实姓名/身份证 ----------
SELECT '00077 withdrawals real_name/id_card' AS 检查项,
  CASE WHEN COUNT(*)=2 THEN 'OK ✅' ELSE 'MISSING('||COUNT(*)||'/2) ❌' END AS 状态
FROM information_schema.columns
WHERE table_name='withdrawals' AND column_name IN ('real_name','id_card');

-- ---------- 00078：tongbao_amount 改 numeric + gold_bean_logs 再关 RLS ----------
SELECT '00078 emotion_claims.tongbao_amount 类型' AS 检查项,
  COALESCE(data_type,'MISSING ❌') || CASE WHEN data_type='numeric' THEN '  OK ✅' ELSE '  ❌ 非numeric' END AS 状态
FROM information_schema.columns
WHERE table_name='emotion_claims' AND column_name='tongbao_amount';

SELECT '00078 gold_bean_logs RLS' AS 检查项,
  CASE relrowsecurity WHEN false THEN 'OK ✅ 已关闭' ELSE '❌ 仍开启RLS' END AS 状态
FROM pg_class WHERE relname='gold_bean_logs';
