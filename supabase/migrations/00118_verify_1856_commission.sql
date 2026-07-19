-- 00118 验证 1856 分佣到账（1870 下单后跑）
-- 1856 user_id = 03165ead-8fef-46c4-8f57-bc5a905ac716
-- 1870 user_id = d6b38349-dded-4879-9eac-3165a646436a

-- ============ 1) 1856 作为 beneficiary 的佣金流水 ============
SELECT c.level,
       c.rank_at_time,
       c.ratio,
       c.commission_amount                                   AS net_amount,  -- commissions 无 net_amount 列，commission_amount 即净额
       c.status,
       c.created_at,
       o.order_no,
       o.total_amount                                        AS order_total,
       op.phone                                              AS payer_phone
FROM commissions c
LEFT JOIN orders o   ON o.id = c.order_id
LEFT JOIN profiles op ON op.id = c.payer_id
WHERE c.beneficiary_id = '03165ead-8fef-46c4-8f57-bc5a905ac716'
ORDER BY c.created_at DESC;

-- ============ 2) 1856 佣金余额 + 情绪豆余额 ============
SELECT phone,
       commission_balance,
       tb_balance,
       referral_code
FROM profiles
WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- ============ 3) 1856 的分佣类通知 ============
SELECT type, title, body, read_at, created_at
FROM notifications
WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716'
  AND (type ILIKE '%commission%' OR type ILIKE '%income%'
       OR type ILIKE '%refer%' OR title ILIKE '%佣%' OR body ILIKE '%佣%')
ORDER BY created_at DESC
LIMIT 30;

-- ============ 4) 核对：1870 自己下的订单 + 分佣标记 ============
SELECT id, order_no, status, total_amount, payment_method,
       referrer_id, commission_distributed, l1_commission, created_at
FROM orders
WHERE user_id = 'd6b38349-dded-4879-9eac-3165a646436a'
ORDER BY created_at DESC;
