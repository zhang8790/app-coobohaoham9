-- =============================================================================
-- 00131_relax_settle_status.sql
-- 放宽商家货款结算触发条件：与分销佣金口径对齐
-- -----------------------------------------------------------------------------
-- 背景：
--   分销佣金(distribute-commission)在 create-order 付款成功时即发放(含 pending 状态)，
--   但商家货款(fn_settle_order)原写死「仅 completed 才结算」，导致：
--   - 大量 pending_review / pending_pickup / pending_ship 等「已成交未收货」订单
--     商家货款长期挂账、未进 merchant_balance；
--   - 与分销佣金不对称，商家「有订单无收益」。
--
-- 本迁移：
--   1) fn_settle_order：入口校验由 `status='completed'` 放宽为
--      status IN (completed, pending_ship, pending_receive, pending_review, pending_pickup)
--      —— 即所有「已成交」状态均结算商家货款（退款时由 fn_reverse_settlement 回冲）。
--   2) trg_orders_settle：WHEN 条件同步放宽，订单进入任一「已成交」状态即自动结算。
--
-- 安全：仅 CREATE OR REPLACE 函数/触发器，不改动表结构/数据；可重复执行。
-- 幂等：fn_settle_order 内部已对「已结算」订单 return skipped，不会重复结算。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) fn_settle_order：放宽结算入口状态（其余逻辑与 00122 完全一致，含 LEAST 兜底）
-- -----------------------------------------------------------------------------
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

  -- 仅「已成交（含未收货）」才结算：与分销佣金口径对齐
  -- （completed / pending_ship / pending_receive / pending_review / pending_pickup）
  -- 退款/取消(after_sale/cancelled/pending_pay)等不结算；退款时由 fn_reverse_settlement 回冲。
  IF v_order.status NOT IN ('completed','pending_ship','pending_receive','pending_review','pending_pickup') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_active', 'status', v_order.status);
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

-- -----------------------------------------------------------------------------
-- 2) trg_orders_settle：WHEN 条件放宽，进入任一「已成交」状态即自动结算商家货款
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_settle_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 订单进入「已成交」状态即结算商家货款（与分销佣金口径对齐；退款时 fn_reverse_settlement 自动回冲）
  IF NEW.status IN ('completed','pending_ship','pending_receive','pending_review','pending_pickup')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- PERFORM 忽略返回；fn_settle_order 内部已吞掉异常，绝不阻断订单状态流转
    PERFORM public.fn_settle_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_settle ON public.orders;
CREATE TRIGGER trg_orders_settle
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status IN ('completed','pending_ship','pending_receive','pending_review','pending_pickup')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_settle_on_completed();

-- -----------------------------------------------------------------------------
-- 3) 诊断输出
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_settle_order'
  ) THEN
    RAISE NOTICE '[00131] fn_settle_order 已放宽：已成交(pending*/completed)订单均结算商家货款。';
  ELSE
    RAISE NOTICE '[00131] 警告：fn_settle_order 不存在，请先执行 00120/00122。';
  END IF;
END $$;
