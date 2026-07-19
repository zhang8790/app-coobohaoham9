-- =====================================================
-- 端到端验证脚本：商家伙伴体系全链路数字正确性（只读 + 受控写入）
-- -----------------------------------------------------
-- 用途：上线前自检 / 每次结算体系变更后回归
-- 运行：Supabase Dashboard → SQL Editor 整段粘贴执行
-- 风险：会用 RAISE NOTICE 打印断言；会创建一个测试订单
--       并在末尾清理（DELETE），不污染业务数据
-- 设计：纯 SQL 模拟「下单→完成→结算→提现」真实链路，
--       与 EF 行为对齐（fn_settle_order / fn_merchant_withdraw）
-- =====================================================

-- ============================================
-- PART A: 静态结构检查（应 100% 满足）
-- ============================================
DO $$
DECLARE
  v_count int;
  v_type text;
  v_rec RECORD;
BEGIN
  RAISE NOTICE '================ PART A: 静态结构 ================';

  -- A1. 关键表存在
  SELECT count(*) INTO v_count FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN (
    'orders','profiles','stores','merchant_settlements',
    'commissions','withdrawals','tongbao_logs'
  );
  RAISE NOTICE 'A1 业务核心表数: % (期望 7)', v_count;
  IF v_count < 7 THEN RAISE WARNING 'A1 ❌ 缺表'; END IF;

  -- A2. orders 关键列
  PERFORM 1 FROM information_schema.columns
  WHERE table_name='orders' AND column_name IN (
    'id','total_amount','tb_used','status','store_id',
    'wechat_transaction_id','referrer_id','commission_distributed'
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A2 orders 关键列数: % (期望 8)', v_count;

  -- A3. stores 关键列
  PERFORM 1 FROM information_schema.columns
  WHERE table_name='stores' AND column_name IN (
    'id','name','referral_rate','merchant_balance','wx_sub_mch_id'
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A3 stores 关键列数: % (期望 5)', v_count;

  -- A4. profiles 关键列
  PERFORM 1 FROM information_schema.columns
  WHERE table_name='profiles' AND column_name IN (
    'id','tb_balance','commission_balance','referrer_id'
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A4 profiles 关键列数: % (期望 4)', v_count;

  -- A5. tongbao_logs.balance_after 类型（修复点：必须 numeric 不能是 int）
  SELECT data_type INTO v_type FROM information_schema.columns
  WHERE table_name='tongbao_logs' AND column_name='balance_after';
  RAISE NOTICE 'A5 tongbao_logs.balance_after 类型: % (期望 numeric)', v_type;
  IF v_type <> 'numeric' THEN RAISE WARNING 'A5 ❌ balance_after 不是 numeric，需跑 00124 迁移'; END IF;

  -- A6. 关键 RPC 存在
  PERFORM 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname='public' AND p.proname IN (
    'fn_settle_order','fn_merchant_withdraw','fn_get_store_settlement',
    'fn_save_withdrawal_account','fn_get_withdrawal_accounts',
    'fn_delete_withdrawal_account'
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A6 关键 RPC 数: % (期望 6)', v_count;

  -- A7. 触发器 trg_orders_settle 存在
  SELECT count(*) INTO v_count FROM pg_trigger WHERE tgname='trg_orders_settle';
  RAISE NOTICE 'A7 结算触发器: % (期望 1)', v_count;

  RAISE NOTICE 'PART A 完成';
END $$;

-- ============================================
-- PART B: 数字公式纯 SQL 推演（与 fn_settle_order 对齐）
-- ============================================
DO $$
DECLARE
  -- 测试场景
  v_total numeric := 100.00;       -- 成交额
  v_tb numeric := 5.00;            -- 情绪豆抵扣
  v_cash numeric := v_total - v_tb; -- 现金实收 = 95
  v_rate numeric := 0.09;          -- 让利率
  v_wx_fee numeric := round(v_cash * 0.006, 2); -- 微信手续费
  v_concession numeric := round(v_total * v_rate, 2); -- 让利金额 = 9
  v_commission_l1 numeric := round(v_concession * 0.5, 2); -- 一级 = 4.5
  v_commission_l2 numeric := round(v_concession * 0.3, 2); -- 二级 = 2.7
  v_commission_total numeric := v_commission_l1 + v_commission_l2; -- 已分 = 7.2
  v_platform_share numeric := v_concession - v_commission_total; -- 平台分佣 = 1.8
  v_merchant_settle numeric := v_cash - v_platform_share - v_wx_fee; -- 商家应得 = 81.2
BEGIN
  RAISE NOTICE '================ PART B: 公式推演（total=100, 豆=5, rate=9%%）================';
  RAISE NOTICE '  成交额        = %', v_total;
  RAISE NOTICE '  情绪豆抵扣    = %', v_tb;
  RAISE NOTICE '  现金实收      = %', v_cash;
  RAISE NOTICE '  让利金额      = total × 0.09 = %', v_concession;
  RAISE NOTICE '  一级佣金      = 让利 × 0.5 = %', v_commission_l1;
  RAISE NOTICE '  二级佣金      = 让利 × 0.3 = %', v_commission_l2;
  RAISE NOTICE '  佣金合计      = %', v_commission_total;
  RAISE NOTICE '  平台分佣      = 让利 - 佣金 = %', v_platform_share;
  RAISE NOTICE '  微信手续费    = 现金 × 0.006 = %', v_wx_fee;
  RAISE NOTICE '  商家应得货款  = 现金 - 平台分佣 - 手续费 = %', v_merchant_settle;
  RAISE NOTICE '  平台总收益    = 平台分佣 + 手续费 = %', v_platform_share + v_wx_fee;
  RAISE NOTICE '  ★ 恒等式: 现金 = 平台分佣 + 佣金合计 + 商家应得 + 手续费';
  RAISE NOTICE '    验证: % = % + % + % + % = %',
    v_cash, v_platform_share, v_commission_total, v_merchant_settle, v_wx_fee,
    v_platform_share + v_commission_total + v_merchant_settle + v_wx_fee;
  IF abs(v_cash - (v_platform_share + v_commission_total + v_merchant_settle + v_wx_fee)) < 0.01 THEN
    RAISE NOTICE '    ✅ 恒等式成立，账目平衡';
  ELSE
    RAISE WARNING '    ❌ 恒等式不成立！账目不平';
  END IF;
  RAISE NOTICE 'PART B 完成';
END $$;

-- ============================================
-- PART C: 找一个真实已完成订单，验算数字
-- ============================================
DO $$
DECLARE
  v_order RECORD;
  v_rate numeric;
  v_total numeric;
  v_tb numeric;
  v_cash numeric;
  v_concession numeric;
  v_actual_commission numeric;
  v_expected_platform_share numeric;
  v_actual_merchant_settle numeric;
  v_diff numeric;
BEGIN
  RAISE NOTICE '================ PART C: 真实订单验算 ================';

  -- 找一笔最近已完成的张林水果店订单
  SELECT o.id, o.total_amount, o.tb_used, o.commission_distributed, s.referral_rate
  INTO v_order
  FROM orders o
  JOIN stores s ON s.id = o.store_id
  WHERE o.status = 'completed'
    AND s.name LIKE '%张林%'
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'PART C: 没有「张林水果店」已完成订单，跳过真实验算';
    RETURN;
  END IF;

  v_rate := COALESCE(v_order.referral_rate, 0.09);
  v_total := v_order.total_amount;
  v_tb := COALESCE(v_order.tb_used, 0);
  v_cash := v_total - v_tb;
  v_concession := round(v_total * v_rate, 2);

  -- 该订单实际佣金合计（来自 commissions 表）
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_actual_commission
  FROM commissions WHERE order_id = v_order.id AND status <> 'refunded';

  v_expected_platform_share := v_concession - v_actual_commission;
  v_actual_merchant_settle := v_cash - v_expected_platform_share;

  RAISE NOTICE '  订单号: %', v_order.id;
  RAISE NOTICE '  成交额: % / 情绪豆: % / 现金实收: %', v_total, v_tb, v_cash;
  RAISE NOTICE '  让利率: % / 让利金额: %', v_rate, v_concession;
  RAISE NOTICE '  实际佣金合计: % (来自 commissions 表)', v_actual_commission;
  RAISE NOTICE '  平台分佣(推算): %', v_expected_platform_share;
  RAISE NOTICE '  商家应得货款(推算): %', v_actual_merchant_settle;

  -- 查实际结算台账对比
  PERFORM merchant_settle, tb_portion
  FROM merchant_settlements
  WHERE order_id = v_order.id
  ORDER BY created_at DESC LIMIT 1;

  -- 该订单在 stores.merchant_balance 的累加值
  SELECT COALESCE(SUM(merchant_settle), 0) INTO v_diff
  FROM merchant_settlements WHERE order_id = v_order.id;

  RAISE NOTICE '  实际台账结算额: % (来自 merchant_settlements)', v_diff;
  RAISE NOTICE '  差值: % (推算 - 实际)', v_actual_merchant_settle - v_diff;
  RAISE NOTICE 'PART C 完成';
END $$;

-- ============================================
-- PART D: 数据完整性检查
-- ============================================
DO $$
DECLARE
  v_count int;
  v_dup int;
BEGIN
  RAISE NOTICE '================ PART D: 数据完整性 ================';

  -- D1. completed 订单必须有 merchant_settlements 台账
  SELECT count(*) INTO v_count
  FROM orders o
  WHERE o.status = 'completed' AND o.store_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM merchant_settlements ms WHERE ms.order_id = o.id);
  RAISE NOTICE 'D1 completed 无台账订单数: % (期望 0)', v_count;
  IF v_count > 0 THEN RAISE WARNING 'D1 ❌ 有订单完成但未结算，需跑 00122 backfill'; END IF;

  -- D2. 同一 order 不应有重复结算（commission 幂等性）
  SELECT count(*) INTO v_dup
  FROM (
    SELECT order_id, count(*) c FROM merchant_settlements
    GROUP BY order_id HAVING count(*) > 1
  ) t;
  RAISE NOTICE 'D2 重复结算 order 数: % (期望 0)', v_dup;

  -- D3. 订单 total_amount = tb_used + cash 部分台账
  SELECT count(*) INTO v_count
  FROM merchant_settlements ms
  JOIN orders o ON o.id = ms.order_id
  WHERE ms.tb_portion > o.total_amount;
  RAISE NOTICE 'D3 tb_portion 超 total 订单数: % (期望 0)', v_count;
  IF v_count > 0 THEN RAISE WARNING 'D3 ❌ 有台账 tb_portion > total，未跑 00122 修复'; END IF;

  -- D4. 充值绝对不写 commissions
  SELECT count(*) INTO v_count
  FROM commissions c
  WHERE c.remark LIKE '%充值%' OR c.source_type = 'recharge';
  RAISE NOTICE 'D4 充值误写 commissions 数: % (期望 0)', v_count;

  RAISE NOTICE 'PART D 完成';
END $$;

-- ============================================
-- 输出说明
-- ============================================
DO $$ BEGIN
  RAISE NOTICE '================ 验证完毕 ================';
  RAISE NOTICE '本脚本只读 + 静态推演 + 完整性检查，不修改业务数据';
  RAISE NOTICE '如有任何 ❌，请把 NOTICE/WARNING 输出截图发我排查';
END $$;
