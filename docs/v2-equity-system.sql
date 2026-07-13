-- ============================================================
-- V2 共建股权版 · 情绪确权系统 数据模型迁移
-- 在 Supabase Dashboard → SQL Editor 全量粘贴执行（幂等）
-- ============================================================

-- 1) profiles 增加「滋养通宝」与「共建贡献值」两列
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tb_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cv_total   numeric NOT NULL DEFAULT 0;

-- 2) emotion_claims 增加发放明细（滋养通宝 / 共建贡献值 / 徽章 code）
ALTER TABLE emotion_claims
  ADD COLUMN IF NOT EXISTS tb_amount  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cv_amount  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_code text;

-- 3) 平台月度指标聚合函数（security definer 绕过 RLS，供小程序端计算股权占比/分红）
--    返回：total_cv(全平台共建贡献值之和) / gmv_total(已成交 GMV) / new_users_month(本月新增用户)
CREATE OR REPLACE FUNCTION get_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_cv      numeric := 0;
  v_gmv           numeric := 0;
  v_new_users     integer := 0;
  v_month_start   timestamptz := date_trunc('month', now());
BEGIN
  SELECT COALESCE(SUM(cv_total), 0) INTO v_total_cv FROM profiles;
  SELECT COALESCE(SUM(total_amount), 0) INTO v_gmv
    FROM orders WHERE status IN ('paid', 'pending_review', 'completed');
  SELECT COUNT(*) INTO v_new_users FROM profiles WHERE created_at >= v_month_start;
  RETURN jsonb_build_object(
    'total_cv',        v_total_cv,
    'gmv_total',       v_gmv,
    'new_users_month', v_new_users
  );
END;
$$;

-- 4) （可选）情绪徽章种子数据：前端确权时按所选情绪映射发放，
--    即使未插入，grants 表仍会记录 code；此处仅补全「徽章字典」展示用。
INSERT INTO emotion_badge_defs (code, name, description, icon, rarity, unlock_hint, sort_order, is_active)
VALUES
  ('emo_relax', '松弛时刻', '在紧绷的生活里，给自己一段松弛', '🌿', 'common', '确权时选择「松弛」类情绪', 100, true),
  ('emo_heal',  '治愈微光', '被温柔接住的那一刻',           '✨', 'common', '确权时选择「治愈」类情绪', 101, true),
  ('emo_calm',  '安宁片刻', '心静下来的片刻安宁',           '🍃', 'common', '确权时选择「平静」类情绪', 102, true),
  ('emo_brave', '勇敢一刻', '承认脆弱也是一种勇敢',         '🔥', 'rare',   '确权时选择「勇敢」类情绪', 103, true),
  ('emo_warm',  '温暖相伴', '被陪伴的暖意',                 '☀️', 'common', '确权时选择「温暖」类情绪', 104, true),
  ('emo_miss',  '思念悠悠', '藏不住的思念',                 '🌙', 'rare',   '确权时选择「思念」类情绪', 105, true),
  ('emo_joy',   '喜悦绽放', '值得记录的微小喜悦',           '🌸', 'common', '确权时选择「喜悦」类情绪', 106, true),
  ('emo_free',  '自由之心', '不被定义的自由',               '🕊️', 'rare',   '确权时选择「自由」类情绪', 107, true)
ON CONFLICT (badge_code) DO NOTHING;

-- 5) 验证
-- SELECT * FROM get_platform_metrics();
-- SELECT tb_balance, cv_total FROM profiles WHERE id = '你的user_id';
