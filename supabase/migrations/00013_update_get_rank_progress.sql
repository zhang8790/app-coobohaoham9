-- 更新 get_rank_progress 函数，返回 l1_ratio 和 l2_ratio
-- 日期：2026-07-02

CREATE OR REPLACE FUNCTION get_rank_progress(p_user_id UUID)
RETURNS TABLE (
  current_rank TEXT,
  next_rank TEXT,
  direct_count INTEGER,
  target_count INTEGER,
  progress NUMERIC,
  total_gmv NUMERIC,
  points INTEGER,
  balance NUMERIC,
  l1_ratio INTEGER,
  l2_ratio INTEGER,
  next_l1_ratio INTEGER,
  next_l2_ratio INTEGER
) AS $$
DECLARE
  v_referral_code TEXT;
  v_direct_count INTEGER := 0;
  v_total_gmv NUMERIC := 0;
  v_points INTEGER := 0;
  v_balance NUMERIC := 0;
  v_current_rank TEXT := '江湖散修';
  v_next_rank TEXT := '外门弟子';
  v_target_count INTEGER := 1;
  v_progress NUMERIC := 0;
  v_l1_ratio INTEGER := 15;
  v_l2_ratio INTEGER := 6;
  v_next_l1_ratio INTEGER := 18;
  v_next_l2_ratio INTEGER := 8;
BEGIN
  -- 获取用户推广码
  SELECT referral_code INTO v_referral_code
  FROM profiles
  WHERE id = p_user_id;

  IF v_referral_code IS NULL THEN
    -- 用户不存在或无推广码
    RETURN QUERY SELECT
      v_current_rank::TEXT,
      v_next_rank::TEXT,
      v_direct_count,
      v_target_count,
      v_progress,
      v_total_gmv,
      v_points,
      v_balance,
      v_l1_ratio,
      v_l2_ratio,
      v_next_l1_ratio,
      v_next_l2_ratio;
    RETURN;
  END IF;

  -- 统计一级下线数量
  SELECT COUNT(*) INTO v_direct_count
  FROM profiles
  WHERE referrer_id = p_user_id;

  -- 统计累计GMV（简化：从orders表统计）
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_gmv
  FROM orders
  WHERE user_id = p_user_id
    AND status IN ('pending_ship', 'pending_receive', 'pending_review', 'completed');

  -- 获取积分和余额
  SELECT COALESCE(points, 0), COALESCE(balance, 0)
  INTO v_points, v_balance
  FROM profiles
  WHERE id = p_user_id;

  -- 根据直推数量判定段位（简化版，实际应该用V4算法）
  -- 这里返回硬编码的段位配置，前端应该从V4算法读取
  -- 为了兼容性，这里先返回默认值

  -- 返回结果
  RETURN QUERY SELECT
    v_current_rank::TEXT,
    v_next_rank::TEXT,
    v_direct_count,
    v_target_count,
    v_progress,
    v_total_gmv,
    v_points,
    v_balance,
    v_l1_ratio,
    v_l2_ratio,
    v_next_l1_ratio,
    v_next_l2_ratio;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
