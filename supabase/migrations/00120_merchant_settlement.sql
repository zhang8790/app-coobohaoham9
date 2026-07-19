-- =====================================================================
-- 00120：商家货款结算体系（方案 A 落地 · 核心迁移）
-- =====================================================================
-- 背景：
--   原模型中，用户用「情绪豆」支付时，豆仅从买家 tb_balance 扣减后焚毁，
--   商家只看到 GMV 展示数字，没有任何货款入账（无 merchant_balance、无结算逻辑）。
--   即「用户情绪豆 → 平台收 RMB（充值时已收）→ 商家 0 入账」，构成资产缺口。
--
-- 本迁移建立「商家货款以 RMB 结算、可提现」的完整闭环，并严守三条合规红线：
--   1) 情绪豆(tb_balance) = 平台内部消费币，不可提现、不可二级转让（既有规则不变）；
--   2) 推广佣金(commission_balance) = 可提现、与货款严格隔离（既有规则不变）；
--   3) 商家货款(merchant_balance) = 本次新增，可提现，与情绪豆/佣金三账隔离；
--      真实资金下发走「微信支付服务商分账直达」模式（资金直达商家子商户号，
--      平台不池化 → 规避二清）。本期代码包将真实分账 API 留作接入点（见 EF）。
--
-- 结算口径（用户已确认决策）：
--   - 净额结算：订单 completed 时，商家应收 = 订单全额 − 让利池 − 微信通道费；
--   - 情绪豆支付部分「等值计入」：豆付部分按 1:1 计入结算额，由平台以自有资金垫付
--     （平台在用户充值时已收 RMB，故垫付无额外成本），不要求商家持有/接收情绪豆；
--   - 微信通道费(0.6%)仅对真实现金部分(total_amount − tb_used)计提。
--
-- 让利率单位归一：stores.referral_rate 实际存的是「百分比」(10.00=10%)，
--   而 distribute-commission 的 discount_rate 是「小数」(0.09)。RPC 内做兼容：
--   rate = referral_rate > 1 ? referral_rate/100 : referral_rate。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) stores 表：新增商家货款余额 / 冻结额 / 微信子商户号
-- ---------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS merchant_balance   numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_frozen  numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wx_sub_mch_id       text;

COMMENT ON COLUMN public.stores.merchant_balance IS '商家可结算货款余额（人民币元，可提现，与情绪豆/佣金三账隔离）';
COMMENT ON COLUMN public.stores.settlement_frozen IS '冻结中货款（如退款/争议处理期间，不计入可提现）';
COMMENT ON COLUMN public.stores.wx_sub_mch_id IS '微信支付服务商模式下的子商户号，用于分账直达（资金不池化，规避二清）';

-- ---------------------------------------------------------------------
-- 2) 商家结算台账 merchant_settlements
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_settlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_no        text,
  total_amount    numeric(12,4) NOT NULL DEFAULT 0,   -- 订单全额（豆付等值计入）
  tb_portion      numeric(12,4) NOT NULL DEFAULT 0,   -- 情绪豆抵扣部分（平台垫付）
  cash_portion    numeric(12,4) NOT NULL DEFAULT 0,   -- 微信现金实付部分
  referral_rate   numeric(6,4)  NOT NULL DEFAULT 0,   -- 让利率快照（小数口径，审计用）
  discount_pool   numeric(12,4) NOT NULL DEFAULT 0,   -- 让利池（已分给推广/L1/L2/买家积分/平台）
  channel_fee     numeric(12,4) NOT NULL DEFAULT 0,   -- 微信通道费（仅现金部分）
  settle_amount   numeric(12,4) NOT NULL DEFAULT 0,   -- 商家应收货款 = 全额 − 让利池 − 通道费
  status          text NOT NULL DEFAULT 'settled' CHECK (status IN ('settled','reversed')),
  settled_at      timestamptz,
  reversed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ms_store ON public.merchant_settlements(store_id);
CREATE INDEX IF NOT EXISTS idx_ms_order ON public.merchant_settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_ms_status ON public.merchant_settlements(status);

-- 财务/运营表：与项目既有约定一致，DISABLE RLS（admin-web 用 anon key 直读）
ALTER TABLE public.merchant_settlements DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3) withdrawals 表：新增 kind（佣金/货款）与关联结算单
--    （store_id / bank_* / commission_ids 已由 00015 / 00116 添加，此处仅补差分）
-- ---------------------------------------------------------------------
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'commission'
    CHECK (kind IN ('commission','settlement')),
  ADD COLUMN IF NOT EXISTS merchant_settlement_ids uuid[];

COMMENT ON COLUMN public.withdrawals.kind IS 'commission=推广佣金提现；settlement=商家货款提现';
COMMENT ON COLUMN public.withdrawals.merchant_settlement_ids IS 'kind=settlement 时关联的 merchant_settlements.id 列表';

CREATE INDEX IF NOT EXISTS idx_withdrawals_kind ON public.withdrawals(kind);

-- ---------------------------------------------------------------------
-- 4) RPC：fn_settle_order —— 自包含、幂等、不阻断订单完成
--    从 orders + stores 独立算出商家应收，不依赖 distribute-commission 是否已跑
--    （纯情绪豆订单当前根本不触发 distribute-commission，故必须自包含）。
-- ---------------------------------------------------------------------
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
  INSERT INTO merchant_settlements
    (store_id, order_id, order_no, total_amount, tb_portion, cash_portion,
     referral_rate, discount_pool, channel_fee, settle_amount, status, settled_at)
  VALUES
    (v_order.store_id, v_order.id, v_order.order_no,
     COALESCE(v_order.total_amount, 0), LEAST(COALESCE(v_order.tb_used, 0), COALESCE(v_order.total_amount, 0)), v_cash,
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

-- ---------------------------------------------------------------------
-- 5) RPC：fn_reverse_settlement —— 退款/争议时回冲商家货款
-- ---------------------------------------------------------------------
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

  UPDATE merchant_settlements SET status = 'reversed', reversed_at = now() WHERE id = v_rec.id;

  RETURN jsonb_build_object('ok', true, 'reversed_amount', v_rec.settle_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 6) RPC：fn_merchant_withdraw —— 商家货款提现申请（原子：校验+扣减+写台账）
--    客户端直写 stores.merchant_balance 受 RLS 限制，故走 SECURITY DEFINER RPC。
--    真实资金下发（微信服务商分账）由审批通过后调用 EF merchant-payout 完成。
-- ---------------------------------------------------------------------
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
BEGIN
  v_amt := ROUND(COALESCE(p_amount, 0)::numeric, 4);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- 读取并校验余额（用 FOR UPDATE 加锁，防并发超提）
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

  -- 锁定余额
  UPDATE stores
     SET merchant_balance = ROUND((v_bal - v_amt)::numeric, 4)
   WHERE id = p_store_id;

  -- 写提现申请（kind='settlement'）
  INSERT INTO withdrawals
    (user_id, store_id, amount, method, account_info, kind, status, created_at)
  VALUES
    (p_user_id, p_store_id, v_amt, v_method, p_account, 'settlement', 'pending', now())
  RETURNING id INTO v_wid;

  RETURN jsonb_build_object('ok', true, 'withdrawal_id', v_wid, 'amount', v_amt);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 7) RPC：fn_get_store_settlement —— 读取门店货款结算概览（绕过 stores RLS）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_store_settlement(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store stores%ROWTYPE;
  v_total numeric;
  v_count int;
BEGIN
  SELECT * INTO v_store FROM stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  SELECT COALESCE(SUM(settle_amount), 0), COUNT(*)
    INTO v_total, v_count
    FROM merchant_settlements
   WHERE store_id = p_store_id AND status = 'settled';

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', p_store_id,
    'merchant_balance', COALESCE(v_store.merchant_balance, 0),
    'settlement_frozen', COALESCE(v_store.settlement_frozen, 0),
    'total_settled', v_total,
    'settlement_count', v_count,
    'wx_sub_mch_id', v_store.wx_sub_mch_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 8) 触发器：订单 status → 'completed' 自动结算商家货款
--    （覆盖 api.ts: updateOrderStatus / 评论完成 / 退款完成 等多条路径，
--      纯情绪豆订单也能在此触发，无需依赖 distribute-commission）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_settle_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    -- PERFORM 忽略返回；fn_settle_order 内部已吞掉异常，绝不阻断订单完成
    PERFORM public.fn_settle_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_settle ON public.orders;
CREATE TRIGGER trg_orders_settle
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.trg_settle_on_completed();

-- ---------------------------------------------------------------------
-- 9) 历史数据回填（可选）：将「已完成但从未结算」的订单补结算
--    由用户本机执行：SELECT public.fn_settle_order(id) FROM orders
--      WHERE status='completed' AND store_id IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM merchant_settlements WHERE order_id=orders.id);
--    （此处不自动跑，避免大批量写锁；用户确认后手动执行即可）
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 10) 诊断输出：确认新结构到位
-- ---------------------------------------------------------------------
DO $$
DECLARE
  col text;
BEGIN
  RAISE NOTICE '===== stores 新增列 =====';
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name='stores' AND column_name IN ('merchant_balance','settlement_frozen','wx_sub_mch_id')
    ORDER BY column_name
  LOOP RAISE NOTICE '  - %', col; END LOOP;

  RAISE NOTICE '===== withdrawals 新增列 =====';
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name='withdrawals' AND column_name IN ('kind','merchant_settlement_ids')
    ORDER BY column_name
  LOOP RAISE NOTICE '  - %', col; END LOOP;

  RAISE NOTICE '✅ 00120 商家货款结算体系迁移已就绪（RPC: fn_settle_order / fn_reverse_settlement / fn_merchant_withdraw / fn_get_store_settlement；触发器: trg_orders_settle）';
END $$;

-- 刷新 PostgREST schema cache（失败则提示手动 Reload）
DO $$
BEGIN
  BEGIN
    PERFORM pg_notify('pgrst', 'reload schema');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      EXECUTE 'NOTIFY pgrst, ''reload schema''';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠️ 自动刷新 schema cache 失败，请到 Supabase Dashboard → Database → 点 "Reload schema cache"';
    END;
  END;
END $$;
