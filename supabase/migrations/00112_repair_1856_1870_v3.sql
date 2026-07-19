-- 00112 综合修复：自动补齐 1856 手机号 + 绑定 1870→1856 + 补发 L1 佣金
-- 场景：1856 的 profiles.phone 存得不全（少位/空格），精确匹配查不到。
-- 本脚本幂等，可重复执行。执行顺序：
--   1) 精确查 18565613635；查不到则模糊定位并 UPDATE 补齐 phone
--   2) 若 profiles 缺失且 auth.users 有，则重建 profiles 行
--   3) 绑定 1870.referrer_id = 真实 1856.id
--   4) 为 1870 已支付且尚无 1856 L1 佣金的订单补发：流水 + 余额 + 通知 + 订单标记

DO $$
DECLARE
  v_sub_id uuid;
  v_sup_id uuid;
  v_match_count int;
  v_sup_phone text;
  v_order RECORD;
  v_rolling numeric := 0;
  v_rank text; v_l1_ratio numeric;
  v_pool numeric; v_comm_pool numeric; v_l1 numeric; v_net numeric;
  v_referral_rate numeric;
  v_count int := 0;
BEGIN
  -- ===== 1) 定位真实 1856 =====
  SELECT id INTO v_sup_id FROM profiles WHERE phone = '18565613635' LIMIT 1;

  IF v_sup_id IS NULL THEN
    -- 模糊匹配：以 1856561363 开头（容错少末位/多空格），或包含完整串
    SELECT count(*) INTO v_match_count
    FROM profiles
    WHERE phone LIKE '1856561363%'
       OR phone LIKE '%18565613635%'
       OR phone LIKE '%8565613635%';

    IF v_match_count = 1 THEN
      -- 唯一匹配，安全补齐
      UPDATE profiles
      SET phone = '18565613635'
      WHERE phone LIKE '1856561363%'
         OR phone LIKE '%18565613635%'
         OR phone LIKE '%8565613635%'
      RETURNING id, phone INTO v_sup_id, v_sup_phone;
      RAISE NOTICE '✅ 已补齐 1856 手机号 -> %', v_sup_phone;
    ELSIF v_match_count > 1 THEN
      RAISE EXCEPTION '模糊匹配到 % 行含「1856」手机号，存在歧义，请先手动确认再执行', v_match_count;
    ELSE
      -- profiles 无，从 auth.users 兜底
      SELECT id INTO v_sup_id
      FROM auth.users
      WHERE phone LIKE '1856561363%'
         OR phone LIKE '%18565613635%'
         OR email ILIKE '%1856%'
      LIMIT 1;

      IF v_sup_id IS NOT NULL THEN
        INSERT INTO profiles (id, phone, role, is_active, created_at, updated_at, avatar_url, nickname)
        VALUES (v_sup_id, '18565613635', 'user', true, now(), now(), NULL, '无名')
        ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;
        RAISE NOTICE '✅ 从 auth.users 重建/补齐 1856 profiles 行: id=%', v_sup_id;
      ELSE
        RAISE EXCEPTION '1856 在 profiles 与 auth.users 都查不到（手机号不全且无兜底）';
      END IF;
    END IF;
  ELSE
    RAISE NOTICE '✅ 1856 精确匹配成功: id=%', v_sup_id;
  END IF;

  -- ===== 2) 定位 1870 =====
  SELECT id INTO v_sub_id FROM profiles WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a' LIMIT 1;
  IF v_sub_id IS NULL THEN
    SELECT id INTO v_sub_id FROM profiles WHERE phone = '18701410500' LIMIT 1;
  END IF;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION '1870 账号未找到（profiles 中既无 id 也无手机号 18701410500）';
  END IF;

  RAISE NOTICE '1870 id=%', v_sub_id;

  -- ===== 3) 绑定 1870.referrer_id -> 真实 1856 =====
  UPDATE profiles
  SET referrer_id = v_sup_id
  WHERE id = v_sub_id
    AND (referrer_id IS DISTINCT FROM v_sup_id);
  IF FOUND THEN
    RAISE NOTICE '✅ 已修正 1870.referrer_id -> %', v_sup_id;
  ELSE
    RAISE NOTICE 'ℹ️ 1870.referrer_id 已是 %，无需修改', v_sup_id;
  END IF;

  -- ===== 4) 1856 滚动段位（决定 L1 比例，与 RANK_CONFIG_TABLE_V5 一致）=====
  SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_rolling
  FROM orders o
  WHERE o.user_id = v_sup_id
    AND o.status IN ('completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup')
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

  -- ===== 5) 补发 L1 佣金 =====
  FOR v_order IN
    SELECT o.id, o.order_no, o.total_amount, o.payment_method,
           COALESCE(s.referral_rate, 0.09) AS referral_rate
    FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    WHERE o.user_id = v_sub_id
      AND o.status IN ('completed', 'pending_ship', 'pending_receive', 'pending_review', 'pending_pickup')
      AND NOT EXISTS (
        SELECT 1 FROM commissions c
        WHERE c.order_id = o.id AND c.beneficiary_id = v_sup_id AND c.level = 1)
  LOOP
    v_referral_rate := COALESCE(v_order.referral_rate, 0.09);
    v_pool      := ROUND((v_order.total_amount * v_referral_rate)::numeric, 4);
    v_comm_pool := ROUND((v_pool * 0.90)::numeric, 4);                  -- 平台抽 10%
    v_l1        := ROUND((v_comm_pool * v_l1_ratio)::numeric, 4);

    -- 净额：微信(wxpay)扣 0.6% 通道费；纯情绪豆(gold_beans)通道费 0
    -- ⚠️ payment_method 枚举仅 'wxpay'/'gold_beans'，不能写 'wechat'/'mix' 否则 22P02
    IF v_order.payment_method = 'wxpay' THEN
      v_net := ROUND((v_l1 * (1 - 0.006))::numeric, 4);
    ELSE
      v_net := v_l1;
    END IF;

    INSERT INTO commissions (order_id, order_no, beneficiary_id, payer_id,
                             level, rank_at_time, ratio, pool_amount,
                             commission_amount, b_coef, status)
    VALUES (v_order.id, v_order.order_no, v_sup_id, v_sub_id,
            1, v_rank, v_l1_ratio, v_pool,
            v_net, 1.0, 'pending');

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
    RAISE NOTICE '💰 补发 L1: order_no=% 段位=% 佣金=% 净额=%', v_order.order_no, v_rank, v_l1, v_net;
  END LOOP;

  RAISE NOTICE '===== 修复完成，共补发 % 笔 =====', v_count;
END $$;
