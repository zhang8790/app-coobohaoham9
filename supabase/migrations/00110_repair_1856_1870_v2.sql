-- 00110_v2 修复：绑定 1870→真实 1856 + 补发 L1 佣金/流水/通知
-- 前置：先跑 00109_v2，确认真实 1856 的 id（可能是 profiles 里的 id，也可能是 auth.users 的 id）。
-- 本脚本幂等，可重复执行。
-- 它会：
--   1) 找到 1870 的真实 id
--   2) 找到真实 1856 的 id（优先 profiles.phone，再 auth.users 兜底）
--   3) 若 1856 的 profiles 行缺失但 auth 存在，则重建 profiles 行
--   4) 把 1870.referrer_id 修正为真实 1856.id
--   5) 为 1870 已支付且尚无 1856 L1 佣金的订单补发：流水、余额、通知、订单标记
-- 注意：仅补 L1（1856 作为 1870 的上级）。1856 自己的 L2 不在此范围。

DO $$
DECLARE
  v_sub_id uuid;
  v_sup_id uuid;
  v_sup_auth_id uuid;
  v_sup_phone text;
  v_order RECORD;
  v_rolling numeric := 0;
  v_rank text; v_l1_ratio numeric;
  v_pool numeric; v_comm_pool numeric; v_l1 numeric; v_net numeric;
  v_referral_rate numeric;
  v_count int := 0;
BEGIN
  -- 1) 找 1870
  SELECT id INTO v_sub_id FROM profiles WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a' LIMIT 1;
  IF v_sub_id IS NULL THEN
    SELECT id INTO v_sub_id FROM profiles WHERE phone = '18701410500' LIMIT 1;
  END IF;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION '1870 账号未找到（profiles 中无 id 也无手机号 18701410500）';
  END IF;

  -- 2) 找真实 1856（先 profiles.phone，再 auth.users 兜底）
  SELECT id, phone INTO v_sup_id, v_sup_phone
  FROM profiles
  WHERE phone IN ('18565613635', '+8618565613635', '18565613635 ')
  LIMIT 1;

  IF v_sup_id IS NULL THEN
    SELECT id, email INTO v_sup_auth_id, v_sup_phone
    FROM auth.users
    WHERE phone IN ('18565613635', '+8618565613635')
       OR email ILIKE '%1856%'
    LIMIT 1;

    IF v_sup_auth_id IS NOT NULL THEN
      -- 尝试拿已存在的 profiles 行（可能是同一个 id）
      SELECT id, phone INTO v_sup_id, v_sup_phone FROM profiles WHERE id = v_sup_auth_id;

      -- 还是不存在，则重建 profiles 行（最小必要字段）
      IF v_sup_id IS NULL THEN
        INSERT INTO profiles (id, phone, role, is_active, created_at, updated_at, avatar_url, nickname)
        VALUES (v_sup_auth_id,
                COALESCE((SELECT phone FROM auth.users WHERE id = v_sup_auth_id), '18565613635'),
                'user', true, now(), now(), NULL, '无名');
        v_sup_id := v_sup_auth_id;
        RAISE NOTICE '重建 1856 profiles 行: id=%', v_sup_id;
      END IF;
    END IF;
  END IF;

  IF v_sup_id IS NULL THEN
    RAISE EXCEPTION '1856 账号未找到（profiles 和 auth.users 都查不到）';
  END IF;

  RAISE NOTICE '1856 真实 id=% phone=%', v_sup_id, v_sup_phone;
  RAISE NOTICE '1870 真实 id=%', v_sub_id;

  -- 3) 修正绑定：让 1870 明确指向真实 1856
  UPDATE profiles
  SET referrer_id = v_sup_id
  WHERE id = v_sub_id
    AND (referrer_id IS DISTINCT FROM v_sup_id);

  IF FOUND THEN
    RAISE NOTICE '已修正 1870.referrer_id -> %', v_sup_id;
  ELSE
    RAISE NOTICE '1870.referrer_id 已经是 %，无需修改', v_sup_id;
  END IF;

  -- 4) 1856 当前滚动段位（决定 L1 比例）
  SELECT COALESCE(SUM(o.total_amount), 0)
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

  -- 5) 遍历 1870 已支付且尚无 1856 L1 佣金的订单，补发
  FOR v_order IN
    SELECT o.id, o.order_no, o.total_amount, o.payment_method,
           COALESCE(s.referral_rate, 0.09) AS referral_rate
    FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    WHERE o.payer_id = v_sub_id
      AND o.status IN ('paid', 'completed', 'used')
      AND NOT EXISTS (
        SELECT 1 FROM commissions c
        WHERE c.order_id = o.id AND c.beneficiary_id = v_sup_id AND c.level = 1)
  LOOP
    v_referral_rate := COALESCE(v_order.referral_rate, 0.09);
    v_pool          := ROUND((v_order.total_amount * v_referral_rate)::numeric, 4);
    v_comm_pool     := ROUND((v_pool * 0.90)::numeric, 4);   -- 平台抽 10%
    v_l1            := ROUND((v_comm_pool * v_l1_ratio)::numeric, 4);

    -- 净额：微信/混合订单扣 0.6% 通道费；纯情绪豆订单通道费 0
    IF v_order.payment_method IN ('wechat', 'mix', 'mixed') THEN
      v_net := ROUND((v_l1 * (1 - 0.006))::numeric, 4);
    ELSE
      v_net := v_l1;
    END IF;

    INSERT INTO commissions (order_id, order_no, beneficiary_id, payer_id,
                             level, rank_at_time, ratio, pool_amount,
                             commission_amount, b_coef, status, net_amount, channel_fee, tax_withheld)
    VALUES (v_order.id, v_order.order_no, v_sup_id, v_sub_id,
            1, v_rank, v_l1_ratio, v_pool,
            v_l1, 1.0, 'pending', v_net,
            CASE WHEN v_order.payment_method IN ('wechat', 'mix', 'mixed') THEN ROUND((v_l1 * 0.006)::numeric, 4) ELSE 0 END,
            0);

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

    v_count := v_count + 1;
    RAISE NOTICE '补发 1856 L1 佣金: order_no=% 段位=% 佣金=% 净额=%', v_order.order_no, v_rank, v_l1, v_net;
  END LOOP;

  RAISE NOTICE '===== 修复完成，共补发 % 笔 =====', v_count;
END $$;
