-- =====================================================================
-- 00121：修复商家货款分账链路（方案 A 补充迁移）
-- =====================================================================
-- 修复两个会阻断真实微信分账的硬伤：
--   1) merchant-payout EF 读取的是 `orders.transaction_id`，但真实列是
--      `orders.wechat_transaction_id`（wechat-payment-callback 落库），导致
--      永远读不到交易号，现金订单全部误判为「纯情绪豆垫付」。
--   2) fn_merchant_withdraw 未填充 withdrawals.merchant_settlement_ids，payout
--      只能按门店随机取一条结算记录，既可能取错订单，也无法做按订单分账。
--
-- 本迁移补充：
--   - merchant_settlements 增加 withdrawal_id 列，跟踪该结算行被哪笔提现单占用；
--   - 重写 fn_merchant_withdraw：创建货款提现时，按 FIFO 分配未提现的结算行，
--     并回填 withdrawals.merchant_settlement_ids；
--   - 重写 fn_reverse_settlement：回冲时一并清除 withdrawal_id。
-- =====================================================================

-- 1) 结算台账增加 withdrawal_id（允许 NULL，表示未提现）
ALTER TABLE public.merchant_settlements
  ADD COLUMN IF NOT EXISTS withdrawal_id uuid;

COMMENT ON COLUMN public.merchant_settlements.withdrawal_id IS '关联的货款提现单 ID，NULL 表示尚未被提现';

CREATE INDEX IF NOT EXISTS idx_ms_withdrawal ON public.merchant_settlements(withdrawal_id);

-- 2) 重写 fn_merchant_withdraw：创建提现时分配结算行，并回填 merchant_settlement_ids
--    原则：
--      - 商家货款余额来自 merchant_settlements.settle_amount，提现时必须从
--        「未被提现的结算行」中 FIFO 分配，保证后续微信分账能取到真实交易号；
--      - 余额校验与结算行分配均加 FOR UPDATE 锁，防并发超提/重复分配。
-- ----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_merchant_withdraw(uuid, uuid, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION public.fn_merchant_withdraw(
  p_store_id   uuid,
  p_user_id    uuid,
  p_amount     numeric,
  p_method     text,
  p_account    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal     numeric;
  v_amt     numeric;
  v_wid     uuid;
  v_method  text;
  v_ids     uuid[] := ARRAY[]::uuid[];
  v_alloc   numeric := 0;
  v_rec     record;
BEGIN
  v_amt := ROUND(COALESCE(p_amount, 0)::numeric, 4);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- 锁定门店余额（防并发超提）
  SELECT merchant_balance INTO v_bal
    FROM stores WHERE id = p_store_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  IF v_bal < v_amt THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_bal);
  END IF;

  -- method 归一
  v_method := COALESCE(p_method, 'bank');
  IF v_method NOT IN ('wechat','alipay','bank') THEN
    v_method := 'bank';
  END IF;

  -- 按 FIFO 分配未提现的结算台账行（同时加 FOR UPDATE 锁，防止并发分配）
  FOR v_rec IN
    SELECT id, settle_amount
      FROM merchant_settlements
     WHERE store_id = p_store_id
       AND status = 'settled'
       AND withdrawal_id IS NULL
     ORDER BY settled_at ASC, id ASC
     FOR UPDATE
  LOOP
    v_ids := array_append(v_ids, v_rec.id);
    v_alloc := v_alloc + v_rec.settle_amount;
    EXIT WHEN v_alloc >= v_amt;
  END LOOP;

  -- 安全兜底：如果余额够但可分配结算行总额不足（理论上不应发生），回滚拒绝
  IF v_alloc < v_amt THEN
    RETURN jsonb_build_object('ok', false, 'error', 'allocated_settlement_insufficient',
                              'allocated', v_alloc, 'requested', v_amt);
  END IF;

  -- 扣除门店货款余额
  UPDATE stores
     SET merchant_balance = ROUND((v_bal - v_amt)::numeric, 4)
   WHERE id = p_store_id;

  -- 创建货款提现单，并记录关联的结算行
  INSERT INTO withdrawals
    (user_id, store_id, amount, method, account_info, kind, status, merchant_settlement_ids, created_at)
  VALUES
    (p_user_id, p_store_id, v_amt, v_method, p_account, 'settlement', 'pending', v_ids, now())
  RETURNING id INTO v_wid;

  -- 标记这些结算行已被该提现单占用
  UPDATE merchant_settlements
     SET withdrawal_id = v_wid
   WHERE id = ANY(v_ids);

  RETURN jsonb_build_object('ok', true, 'withdrawal_id', v_wid, 'amount', v_amt, 'settlement_ids', v_ids);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 3) 重写 fn_reverse_settlement：回冲时清除 withdrawal_id，释放该结算行
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reverse_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec merchant_settlements%ROWTYPE;
BEGIN
  SELECT * INTO v_rec
    FROM merchant_settlements
   WHERE order_id = p_order_id AND status = 'settled'
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_active_settlement');
  END IF;

  -- 回冲门店余额（不允许负）
  UPDATE stores
     SET merchant_balance = GREATEST(0, ROUND((COALESCE(merchant_balance, 0) - v_rec.settle_amount)::numeric, 4))
   WHERE id = v_rec.store_id;

  UPDATE merchant_settlements
     SET status = 'reversed', reversed_at = now(), withdrawal_id = NULL
   WHERE id = v_rec.id;

  RETURN jsonb_build_object('ok', true, 'reversed_amount', v_rec.settle_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 4) 诊断输出
DO $$
BEGIN
  RAISE NOTICE '✅ 00121 已修复货款分账链路：merchant_settlements 增加 withdrawal_id，fn_merchant_withdraw 分配结算行，fn_reverse_settlement 回冲时释放。';
END;
$$;
