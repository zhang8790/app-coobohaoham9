-- =============================================================================
-- 00122_fix_settle_order_tb_portion.sql
-- 热修 fn_settle_order：台账 tb_portion 加 LEAST(tb_used, total_amount) 兜底
-- -----------------------------------------------------------------------------
-- 适用场景：
--   若你先部署了「未含 LEAST 兜底的旧版 00120」，再发现 0.1 元纯豆订单
--   台账「豆付+现金≠全额」的不一致，跑本迁移即可热修，无需重跑整张表/触发器。
--   若你尚未部署 00120，则 00120 本身已含 LEAST 修复，本文件等同一次无害重设。
-- 安全：仅 CREATE OR REPLACE 函数体，不改动表结构/数据/触发器，可重复执行。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_settle_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   orders%ROWTYPE;
  v_store   stores%ROWTYPE;
  v_rate    numeric;
  v_cash    numeric;
  v_pool    numeric;
  v_channel numeric;
  v_settle  numeric;
  v_exist   uuid;
BEGIN
  -- 读取订单
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- 仅「已完成」才结算
  IF v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_completed', 'status', v_order.status);
  END IF;

  -- 平台自营 / 无门店 不结算（避免平台自我结算）
  IF v_order.store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_store');
  END IF;

  -- 幂等：已结算则直接返回既有记录
  SELECT id INTO v_exist FROM merchant_settlements WHERE order_id = p_order_id LIMIT 1;
  IF v_exist IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'settlement_id', v_exist);
  END IF;

  -- 读取门店让利率
  SELECT * INTO v_store FROM stores WHERE id = v_order.store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  -- 让利率单位归一：>1 视为百分比，≤1 视为小数
  v_rate := CASE
              WHEN COALESCE(v_store.referral_rate, 0) > 1 THEN v_store.referral_rate / 100.0
              ELSE COALESCE(v_store.referral_rate, 0)
            END;

  -- 现金部分（微信实付）= 总额 − 情绪豆抵扣
  v_cash := GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.tb_used, 0));

  -- 让利池：按订单全额（豆付等值计入）计提
  v_pool := ROUND((COALESCE(v_order.total_amount, 0) * v_rate)::numeric, 4);

  -- 通道费：仅真实微信现金部分计提（0.6%）
  v_channel := ROUND((v_cash * 0.006)::numeric, 4);

  -- 商家应收货款 = 全额 − 让利池 − 微信通道费（豆付部分由平台垫付，等值计入）
  v_settle := ROUND((COALESCE(v_order.total_amount, 0) - v_pool - v_channel)::numeric, 4);
  v_settle := GREATEST(0, v_settle);

  -- 写入结算台账
  -- 关键修复：tb_portion 用 LEAST(tb_used, total_amount) 兜底，
  -- 保证「豆付 + 现金 = 全额」恒成立（避免纯豆订单 tb_used>total 时台账两列求和越界）。
  INSERT INTO merchant_settlements
    (store_id, order_id, order_no, total_amount, tb_portion, cash_portion,
     referral_rate, discount_pool, channel_fee, settle_amount, status, settled_at)
  VALUES
    (v_order.store_id, v_order.id, v_order.order_no,
     COALESCE(v_order.total_amount, 0),
     LEAST(COALESCE(v_order.tb_used, 0), COALESCE(v_order.total_amount, 0)),
     v_cash,
     v_rate, v_pool, v_channel, v_settle, 'settled', now())
  RETURNING id INTO v_exist;

  -- 累加门店「可结算货款余额」
  UPDATE stores
     SET merchant_balance = ROUND((COALESCE(merchant_balance, 0) + v_settle)::numeric, 4)
   WHERE id = v_order.store_id;

  RETURN jsonb_build_object('ok', true, 'settlement_id', v_exist, 'settle_amount', v_settle);
EXCEPTION WHEN OTHERS THEN
  -- 结算失败绝不应阻断订单完成：记录并放行
  RAISE WARNING 'fn_settle_order failed for %: %', p_order_id, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END;
$$;

-- 诊断输出：确认函数已重设且含 LEAST 兜底
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_settle_order'
  ) THEN
    RAISE NOTICE '[00122] fn_settle_order 已重设（含 tb_portion LEAST 兜底）。';
  ELSE
    RAISE NOTICE '[00122] 警告：fn_settle_order 不存在，请先执行 00120。';
  END IF;
END $$;
