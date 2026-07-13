-- =====================================================================
-- 情绪确权：特殊场景回退与修正算法
--   §5.1 订单退款 / 确权作废 —— 回滚本次贡献值(含上级裂变附加分)
--   §5.2 用户违规封禁 —— 个人贡献值清零 + 上级裂变分同步扣回
--   §5.3 算法规则迭代 —— 版本化，仅对生效后确权生效、历史不回溯、提前≥7天公示
--
-- 依赖：00052(emotion_claims) / 00053(emotion_assets) / 00001(profiles,orders)
-- 幂等：所有 ALTER 用 IF NOT EXISTS，函数用 CREATE OR REPLACE，种子用 ON CONFLICT
--
-- 粘贴到 Supabase Dashboard → SQL Editor 执行即可（纯 SQL，非 TS）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) emotion_claims 增补字段
--    （同时修复 grantEmotionClaim 长期存在的列名 bug：原代码写 tb_amount/
--      cv_amount/badge_code，但表只有 tongbao_amount 且无后两者 → 正常确权静默失败）
-- ---------------------------------------------------------------------
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS tb_amount       numeric(12,2) NOT NULL DEFAULT 0; -- 本次发放的通宝
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS cv_amount       numeric(12,4) NOT NULL DEFAULT 0; -- 本次新增【个人贡献值 CV】——回滚的唯一依据
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS badge_code      text;                            -- 关联徽章定义(emotion_badge_defs.code)
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l1       uuid;                            -- 直接推荐人(L1)用户ID
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l2       uuid;                            -- 间接推荐人(L2)用户ID
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l1_cv    numeric(12,4) NOT NULL DEFAULT 0; -- 给 L1 的裂变附加分
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l2_cv    numeric(12,4) NOT NULL DEFAULT 0; -- 给 L2 的裂变附加分
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'active'
   CHECK (status IN ('active','voided'));                                                     -- 作废标记
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS rule_version    text;                            -- 确权生效时的规则版本(§5.3)
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS voided_at       timestamptz;
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS voided_reason   text;
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS refund_ratio    numeric(5,4) NOT NULL DEFAULT 1  -- 作废时按退款比例回滚(1=全额)
   CHECK (refund_ratio BETWEEN 0 AND 1);

COMMENT ON COLUMN emotion_claims.cv_amount    IS '本次确权新增的个人贡献值(CV)，回滚的唯一依据';
COMMENT ON COLUMN emotion_claims.upline_l1_cv IS '因本次确权给直接推荐人(L1)的裂变附加分';
COMMENT ON COLUMN emotion_claims.upline_l2_cv IS '因本次确权给间接推荐人(L2)的裂变附加分';
COMMENT ON COLUMN emotion_claims.status       IS 'active=有效, voided=已作废(退款/封禁)';
COMMENT ON COLUMN emotion_claims.rule_version IS '确权时生效的规则版本，保证历史数据不回溯(§5.3)';

CREATE INDEX IF NOT EXISTS idx_emotion_claims_status     ON emotion_claims(status);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_rule_ver   ON emotion_claims(rule_version);

-- ---------------------------------------------------------------------
-- 2) profiles：违规封禁标记(§5.2)
-- ---------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at  timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
COMMENT ON COLUMN profiles.is_banned IS '违规封禁(§5.2)：封禁后贡献值清零且不计入全平台总贡献';

-- ---------------------------------------------------------------------
-- 3) orders：退款比例(§5.1 部分退款同比例扣减)
-- ---------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_ratio   numeric(5,4) NOT NULL DEFAULT 0
   CHECK (refund_ratio BETWEEN 0 AND 1);   -- 0=无退款, 1=全额退款
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount  numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN orders.refund_ratio IS '退款比例，触发确权按同比例回滚(§5.1)';

-- ---------------------------------------------------------------------
-- 4) emotion_rule_versions：规则版本表(§5.3)
--    const_json 保存该版本的算法常量；生效时间必须晚于公示时间≥7天
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emotion_rule_versions (
  version      text PRIMARY KEY,
  announced_at timestamptz NOT NULL,                 -- 公示时间
  effective_at timestamptz NOT NULL,                 -- 生效时间（必须 ≥ announced_at + 7天）
  const_json   jsonb NOT NULL,                       -- 该版本算法常量
  note         text,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_notice_7d CHECK (effective_at >= announced_at + interval '7 days')
);
COMMENT ON TABLE emotion_rule_versions IS '确权算法规则版本(§5.3)：调整仅对生效后确权生效、历史不回溯、需提前≥7天公示';

-- 种子：当前上线版本 v1.0（announced 与 effective 都已过去且间隔≥7天，满足约束）
INSERT INTO emotion_rule_versions (version, announced_at, effective_at, const_json, note, is_active)
VALUES (
  '1.0',
  '2026-06-01 00:00:00+08',
  '2026-06-08 00:00:00+08',
  '{
    "EMOTION_TB_PER_CLAIM": 10,
    "R_TB": 0.15,
    "R_DIV": 0.30,
    "M_MIN": 10,
    "P_BASE": 100,
    "W_BEH_MAX": 1.5,
    "EMOTION_CV_RATE": 0.12,
    "R_FISS_L1": 0.05,
    "R_FISS_L2": 0.02,
    "GROSS_MARGIN_FALLBACK": 0.15
  }'::jsonb,
  '初始上线版本',
  true
)
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) §5.1 退款/作废：原子回滚函数
--    回滚贡献值 = -(本次个人CV×比例 + L1裂变分×比例 + L2裂变分×比例)
--    全额退款比例=1；部分退款比例=refund_ratio（同比例扣减消费权重后扣差额）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_void_emotion_claim(
  p_claim_id     uuid,
  p_reason       text DEFAULT 'refund',
  p_refund_ratio numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          record;
  v_factor   numeric;
  v_cv_back  numeric;
  v_tb_back  numeric;
  v_l1_back  numeric;
  v_l2_back  numeric;
BEGIN
  -- 行锁，避免并发重复回滚
  SELECT * INTO v FROM emotion_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'claim not found');
  END IF;
  IF v.status = 'voided' THEN
    RETURN jsonb_build_object('ok', true, 'msg', 'already voided');
  END IF;

  v_factor := COALESCE(p_refund_ratio, 1);
  IF v_factor < 0 THEN v_factor := 0; END IF;
  IF v_factor > 1 THEN v_factor := 1; END IF;

  -- §5.1：仅回滚本次确权产生的所有贡献值（按退款比例同比例）
  v_cv_back := ROUND((v.cv_amount   * v_factor)::numeric, 4);
  v_l1_back := ROUND((v.upline_l1_cv * v_factor)::numeric, 4);
  v_l2_back := ROUND((v.upline_l2_cv * v_factor)::numeric, 4);
  v_tb_back := ROUND((v.tb_amount   * v_factor)::numeric, 2);

  -- 回滚本人：贡献值 + 通宝（不低于 0）
  UPDATE profiles
     SET cv_total   = GREATEST(0, ROUND((COALESCE(cv_total,0)   - v_cv_back)::numeric, 4)),
         tb_balance = GREATEST(0, ROUND((COALESCE(tb_balance,0) - v_tb_back)::numeric, 2))
   WHERE id = v.user_id;

  -- 回滚直接上级裂变附加分
  IF v_l1_back > 0 AND v.upline_l1 IS NOT NULL THEN
    UPDATE profiles
       SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - v_l1_back)::numeric, 4))
     WHERE id = v.upline_l1;
  END IF;

  -- 回滚间接上级裂变附加分
  IF v_l2_back > 0 AND v.upline_l2 IS NOT NULL THEN
    UPDATE profiles
       SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - v_l2_back)::numeric, 4))
     WHERE id = v.upline_l2;
  END IF;

  -- 标记作废（不影响历史其他确权）
  UPDATE emotion_claims
     SET status = 'voided',
         voided_at = now(),
         voided_reason = p_reason,
         refund_ratio = v_factor
   WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cv_back', v_cv_back, 'tb_back', v_tb_back,
    'l1_back', v_l1_back, 'l2_back', v_l2_back, 'factor', v_factor
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6) §5.2 违规封禁：原子清零 + 上级裂变分同步扣回
--    个人所有贡献值清零、不计入总贡献；其上级因该用户获得的裂变分全额扣回
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ban_user_rollback(
  p_user_id uuid,
  p_reason  text DEFAULT 'violation'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  tot_l1   numeric := 0;
  tot_l2   numeric := 0;
BEGIN
  -- 标记封禁 + 本人贡献值/通宝清零（清零即“不计入全平台总贡献值”）
  UPDATE profiles
     SET is_banned  = true,
         banned_at  = now(),
         ban_reason = p_reason,
         cv_total   = 0,
         tb_balance = 0
   WHERE id = p_user_id;

  -- 回滚其上级曾因该用户获得的裂变贡献值（全额扣回）
  FOR r IN
    SELECT upline_l1, upline_l2, upline_l1_cv, upline_l2_cv
      FROM emotion_claims
     WHERE user_id = p_user_id AND status = 'active'
  LOOP
    IF r.upline_l1 IS NOT NULL AND r.upline_l1_cv > 0 THEN
      UPDATE profiles
         SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - r.upline_l1_cv)::numeric, 4))
       WHERE id = r.upline_l1;
      tot_l1 := tot_l1 + r.upline_l1_cv;
    END IF;
    IF r.upline_l2 IS NOT NULL AND r.upline_l2_cv > 0 THEN
      UPDATE profiles
         SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - r.upline_l2_cv)::numeric, 4))
       WHERE id = r.upline_l2;
      tot_l2 := tot_l2 + r.upline_l2_cv;
    END IF;
  END LOOP;

  -- 该用户所有有效确权标记作废（避免被重新计入总贡献）
  UPDATE emotion_claims
     SET status = 'voided', voided_at = now(), voided_reason = 'ban:' || p_reason
   WHERE user_id = p_user_id AND status = 'active';

  RETURN jsonb_build_object(
    'ok', true,
    'upline_l1_back', ROUND(tot_l1, 4),
    'upline_l2_back', ROUND(tot_l2, 4)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7) 全平台总贡献值（排除封禁用户 & 已作废确权已各自扣减）
--    供 getPlatformMetrics 回退使用，保证占比分母实时准确(§5.2 不计入)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_total_cv() RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cv_total), 0)::numeric
    FROM profiles
   WHERE NOT is_banned;
$$;

-- ---------------------------------------------------------------------
-- 8) 权限：函数可被 anon/authenticated 调用（本项目 anon 受信任；
--    生产环境建议改为仅 service_role / admin 角色调用）
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_void_emotion_claim(uuid, text, numeric)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_ban_user_rollback(uuid, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_total_cv()                                TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) emotion_rule_versions 行级安全：规则版本属公开配置，允许只读
-- ---------------------------------------------------------------------
ALTER TABLE emotion_rule_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rule_versions_public_read" ON emotion_rule_versions;
CREATE POLICY "rule_versions_public_read" ON emotion_rule_versions
  FOR SELECT USING (true);
GRANT SELECT ON emotion_rule_versions TO anon, authenticated;
