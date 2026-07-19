-- 00110 修复：绑定 1870→1856 + 为 1870 已支付订单补发 1856 的 L1 佣金/流水/通知
-- 前置：先跑 00109 确认现状。本脚本幂等，可重复执行。
-- 说明：
--   1) 按 phone 重新绑定 1870.referrer_id = 1856.id（若此前因 1856 身份修复导致 id 漂移/绑定丢失，这里修好）
--   2) 遍历 1870 已支付、且尚无 1856 L1 佣金记录的订单，按 V5 公式补发：
--      让利池 = 订单额 × 商家让利率
--      剩余池 = 让利池 × (1 - 0.10 平台抽成)
--      L1   = 剩余池 × 1856 段位比例 × 活跃(1) × 拓新(1)
--      纯情绪豆/测试场景：通道费 0、个税 ≤800 免征 → 净到手 = L1
--   3) 写 commissions（流水）+ 累加 commission_balance（可提现余额）+ 写 notifications（消息）
--   4) 标记订单 commission_distributed=true（无论之前 flag 真假，现在确实发了）
-- 注意：仅补 L1（1856 作为 1870 的上级）。若 1856 自身还有上级(L2)，那笔 L2 不在此脚本范围。

DO $$
DECLARE
  v_sup_id uuid; v_sub_id uuid;
  v_order RECORD;
  v_rolling numeric := 0;
  v_l1_ratio numeric; v_rank text;
  v_discount_pool numeric; v_comm_pool numeric; v_l1 numeric; v_net numeric;
BEGIN
  SELECT id INTO v_sup_id FROM profiles WHERE phone = '18565613635' LIMIT 1;
  SELECT id INTO v_sub_id FROM profiles WHERE phone = '18701410500' LIMIT 1;
  IF v_sup_id IS NULL OR v_sub_id IS NULL THEN
    RAISE EXCEPTION '账号未找到：1856=% 1870=%', v_sup_id, v_sub_id;
  END IF;

  -- 1) 重新绑定（若不一致才改）
  UPDATE profiles SET referrer_id = v_sup_id
  WHERE id = v_sub_id AND (referrer_id IS DISTINCT FROM v_sup_id);

  -- 2) 1856 近 6 月滚动消费（决定 1856 段位 → L1 比例，与 RANK_CONFIG_TABLE_V5 一致）
  SELECT COALESCE(SUM(CASE WHEN o.net_amount > 0 THEN o.net_amount ELSE o.total_amount END), 0)
    INTO v_rolling
  FROM orders o
  WHERE o.payer_id = v_sup_id
    AND o.status IN ('paid', 'completed', 'used')
    AND o.created_at >= now() - interval '6 months';

  v_rank := CASE
    WHEN v_rolling >= 20000 THEN '无心境'
    WHEN v_rolling >= 6000  THEN '悟心'
    WHEN v_rolling >= 2000  THEN '静心'
    WHEN v_rolling >= 800   THEN '明心'
    WHEN v_rolling >= 200   THEN '初心'
    ELSE '凡心' END;
  v_l1_ratio := CASE v_rank
    WHEN '无心境' THEN 0.50 WHEN '悟心' THEN 0.48 WHEN '静心' THEN 0.46
    WHEN '明心' THEN 0.44 WHEN '初心' THEN 0.42 ELSE 0.40 END;

  RAISE NOTICE '1856 滚动消费=% 段位=% L1比例=%', v_rolling, v_rank, v_l1_ratio;

  -- 3) 遍历 1870 已支付、且尚无 1856 L1 佣金的订单（覆盖「已误标 distributed 但没发」与「未分发」两种情况）
  FOR v_order IN
    SELECT o.id, o.order_no, o.total_amount,
           COALESCE(s.referral_rate, 0.09) AS referral_rate
    FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    WHERE o.payer_id = v_sub_id
      AND o.status IN ('paid', 'completed', 'used')
      AND NOT EXISTS (
        SELECT 1 FROM commissions c
        WHERE c.order_id = o.id AND c.beneficiary_id = v_sup_id AND c.level = 1)
  LOOP
    v_discount_pool := ROUND((v_order.total_amount * v_order.referral_rate)::numeric, 4);
    v_comm_pool      := ROUND((v_discount_pool * 0.90)::numeric, 4);   -- 平台抽 10%
    v_l1             := ROUND((v_comm_pool * v_l1_ratio)::numeric, 4);  -- 活跃/拓新系数均按 1（本次 1870 即 1856 的首单推荐成交）
    v_net            := v_l1;  -- 测试/纯情绪豆：通道费 0 + 个税 ≤800 免征

    INSERT INTO commissions (order_id, order_no, beneficiary_id, payer_id,
                             level, rank_at_time, ratio, pool_amount,
                             commission_amount, b_coef, status, net_amount, channel_fee, tax_withheld)
    VALUES (v_order.id, v_order.order_no, v_sup_id, v_sub_id,
            1, v_rank, v_l1_ratio, v_discount_pool,
            v_l1, 1.0, 'pending', v_net, 0, 0);

    UPDATE profiles
    SET commission_balance = ROUND((COALESCE(commission_balance, 0) + v_net)::numeric, 2)
    WHERE id = v_sup_id;

    INSERT INTO notifications (user_id, type, title, body, order_id, payload)
    VALUES (v_sup_id, 'commission_arrived', '佣金到账',
            '订单 ' || v_order.order_no || ' 的佣金 ¥' || v_net || ' 已到账，可前往「我的推广」查看',
            v_order.id,
            jsonb_build_object('order_no', v_order.order_no, 'net_amount', v_net,
                               'arrived_at', now(), 'remark', '佣金到账',
                               'page', 'pages/my-promotion/index'));

    UPDATE orders
    SET commission_distributed = true, commission_calculated = true, l1_commission = v_l1
    WHERE id = v_order.id;

    RAISE NOTICE '补发 1856 佣金: order_no=% rank=% L1=¥%', v_order.order_no, v_rank, v_l1;
  END LOOP;

  RAISE NOTICE '===== 修复完成 =====';
END $$;
