-- 00109 诊断：1856(上级) / 1870(下级) 分佣断点
-- 用途：先跑这个，确认「到底卡在哪一步」，再决定要不要跑 00110 修复。
-- 在 Supabase SQL Editor 运行，看结果面板（含 NOTICE 与三个 SELECT 结果集）。

DO $$
DECLARE
  v_sup_id uuid; v_sub_id uuid;
  v_sup_ref uuid; v_sub_ref uuid;
  v_sup_bal numeric; v_sub_bal numeric;
BEGIN
  SELECT id, referrer_id, commission_balance
    INTO v_sup_id, v_sup_ref, v_sup_bal
  FROM profiles WHERE phone = '18565613635' LIMIT 1;

  SELECT id, referrer_id, commission_balance
    INTO v_sub_id, v_sub_ref, v_sub_bal
  FROM profiles WHERE phone = '18701410500' LIMIT 1;

  RAISE NOTICE '===== 账号关系 =====';
  RAISE NOTICE '1856 id=%  referrer_id=%  commission_balance=%', v_sup_id, v_sup_ref, v_sup_bal;
  RAISE NOTICE '1870 id=%  referrer_id=%  commission_balance=%', v_sub_id, v_sub_ref, v_sub_bal;
  RAISE NOTICE '1870.referrer_id == 1856.id ? %  （false=绑定断，1856 永远拿不到 L1）',
               (v_sub_ref IS NOT DISTINCT FROM v_sup_id);
END $$;

-- 1870 的订单：看是否支付成功、referrer_id 有没有带上、分佣标记状态
SELECT id, order_no, status, payment_method,
       referrer_id, commission_distributed, commission_calculated,
       total_amount, net_amount, l1_commission, l2_commission
FROM orders
WHERE payer_id = (SELECT id FROM profiles WHERE phone = '18701410500')
ORDER BY created_at DESC
LIMIT 10;

-- 1856 的佣金流水：有没有记录
SELECT id, order_id, order_no, level, rank_at_time, ratio,
       commission_amount, net_amount, status, created_at
FROM commissions
WHERE beneficiary_id = (SELECT id FROM profiles WHERE phone = '18565613635')
ORDER BY created_at DESC
LIMIT 10;

-- 1856 的通知：有没有「佣金到账」
SELECT id, type, title, body, read_at, sent_at, created_at
FROM notifications
WHERE user_id = (SELECT id FROM profiles WHERE phone = '18565613635')
ORDER BY created_at DESC
LIMIT 10;
