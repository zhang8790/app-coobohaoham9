-- =============================================================================
-- diagnose-merchant-balance.sql
-- 诊断「商家中心看不到可结算货款」的原因（纯只读，零风险）
-- 在 Supabase Dashboard → SQL Editor 粘贴整段执行。
-- 适用：张林的水果店等任何商家「明明有订单却看不到货款 / 余额是 0」。
-- =============================================================================

-- ① 结构是否就绪：迁移 00120 / 121 / 122 是否跑过
--    若任意一项 = 0，说明结算体系根本没建起来 → 余额永远 0。
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='merchant_settlements')                       AS tbl_merchant_settlements,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='stores' AND column_name='merchant_balance') AS col_merchant_balance,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_get_store_settlement')                        AS rpc_fn_get_store_settlement,
  (SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='orders' AND t.tgname='trg_orders_settle')                               AS trigger_trg_orders_settle;

-- ② 各门店：货款余额 + 订单状态分布（找到「张林的水果店」那一行）
--    merchant_balance=0 且 settled_rows=0 → 没结算过；
--    orders_completed 多但 settled_rows 少 → 订单完成了但没触发结算。
SELECT
  s.id,
  s.name,
  COALESCE(s.merchant_balance, 0)                                            AS merchant_balance,
  COALESCE(s.wx_sub_mch_id, '未配置子商户号')                                AS wx_sub_mch_id,
  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id)                    AS orders_total,
  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.status='completed')      AS orders_completed,
  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.status='pending_review') AS orders_pending_review,
  (SELECT COUNT(*) FROM merchant_settlements ms WHERE ms.store_id = s.id AND ms.status='settled') AS settled_rows
FROM stores s
ORDER BY s.name;

-- ③ 已完成但未结算的订单（"补结算缺口"）
--    这是「有订单却看不到货款」最常见的原因：订单到了 completed，但
--    触发器当时没建 / 或这批是历史订单（迁移前就完成了，触发器来不及触发）。
SELECT
  o.id         AS order_id,
  o.order_no,
  o.status,
  o.total_amount,
  o.tb_used,
  (SELECT name FROM stores s WHERE s.id = o.store_id) AS store_name,
  o.created_at
FROM orders o
WHERE o.status = 'completed'
  AND o.store_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM merchant_settlements ms WHERE ms.order_id = o.id)
ORDER BY o.created_at DESC
LIMIT 50;

-- ④ 卡在 pending_review / pending_receive 的订单（需要商家「确认完成」或超时自动完成才会结算）
--    如果 ② 里 orders_pending_review 很多、orders_completed 很少，看这里。
SELECT
  o.id AS order_id, o.order_no, o.status, o.total_amount,
  (SELECT name FROM stores s WHERE s.id = o.store_id) AS store_name,
  o.verified_at, o.created_at
FROM orders o
WHERE o.status IN ('pending_review', 'pending_receive', 'pending_pickup')
  AND o.store_id IS NOT NULL
ORDER BY o.created_at DESC
LIMIT 50;
