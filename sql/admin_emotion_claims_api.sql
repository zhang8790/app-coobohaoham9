-- =====================================================================
-- 总后台「确权治理」专用 API（SECURITY DEFINER，anon 可调用）
--   - 读：fn_admin_list_emotion_claims / fn_admin_emotion_stats
--     绕开 emotion_claims 的 RLS（若 enable_emotion_rls.sql 已执行，
--     admin-web 用 anon key 直接读会被策略拦截，故用 SECURITY DEFINER）。
--   - 写：复用 00054 已建函数 fn_void_emotion_claim / fn_ban_user_rollback。
--
-- 粘贴到 Supabase Dashboard → SQL Editor 执行即可（纯 SQL，非 TS）。
-- 幂等：函数用 CREATE OR REPLACE。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 总后台确权列表（带用户昵称/手机/封禁状态，SECURITY DEFINER 绕 RLS）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_admin_list_emotion_claims(
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
) RETURNS TABLE (
  id             uuid,
  user_id        uuid,
  order_no       text,
  product_id     uuid,
  store_id       uuid,
  selected_emotion text,
  badge_text     text,
  badge_code     text,
  tb_amount      numeric,
  cv_amount      numeric,
  upline_l1      uuid,
  upline_l2      uuid,
  upline_l1_cv   numeric,
  upline_l2_cv   numeric,
  status         text,
  rule_version   text,
  voided_at      timestamptz,
  voided_reason  text,
  refund_ratio   numeric,
  created_at     timestamptz,
  nickname       text,
  phone          text,
  user_is_banned boolean
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ec.id, ec.user_id, ec.order_no, ec.product_id, ec.store_id,
    ec.selected_emotion, ec.badge_text, ec.badge_code,
    ec.tb_amount, ec.cv_amount,
    ec.upline_l1, ec.upline_l2, ec.upline_l1_cv, ec.upline_l2_cv,
    ec.status, ec.rule_version, ec.voided_at, ec.voided_reason, ec.refund_ratio,
    ec.created_at,
    p.nickname, p.phone, COALESCE(p.is_banned, false)
  FROM emotion_claims ec
  LEFT JOIN profiles p ON p.id = ec.user_id
  WHERE (p_status IS NULL OR ec.status = p_status)
  ORDER BY ec.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) 总后台确权概览统计
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_admin_emotion_stats() RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total   int;
  v_active  int;
  v_voided  int;
  v_cv      numeric;
  v_tb      numeric;
  v_users   int;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'active'),
         COUNT(*) FILTER (WHERE status = 'voided')
    INTO v_total, v_active, v_voided
    FROM emotion_claims;

  SELECT COALESCE(SUM(cv_amount), 0), COALESCE(SUM(tb_amount), 0)
    INTO v_cv, v_tb
    FROM emotion_claims
   WHERE status = 'active';

  SELECT COUNT(*) INTO v_users FROM profiles WHERE NOT COALESCE(is_banned, false);

  RETURN jsonb_build_object(
    'total',        v_total,
    'active',       v_active,
    'voided',       v_voided,
    'active_cv',    ROUND(v_cv, 4),
    'active_tb',    ROUND(v_tb, 2),
    'active_users', v_users
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 3) 权限：anon / authenticated 可调用（本项目 anon 受信任；
--    生产建议改为仅 service_role / admin 角色）
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_admin_list_emotion_claims(text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_admin_emotion_stats()                       TO anon, authenticated;
