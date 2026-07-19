-- =============================================================================
-- fix-merchant-settlement-balance.sql
-- 「商家中心 → 可结算货款」看不到 / 显示 ¥0.00 的排查 + 一键修复
-- 在 Supabase Dashboard → SQL Editor 粘贴执行。
--
-- 用法：先整段跑（①②是只读自检，零风险）→ 看结论 → 再按需取消注释 ③④ 执行。
-- =============================================================================

-- ① 结构自检：迁移 00120 / 00121 / 00122 是否跑过
--    任意一项 = 0 → 结算体系没建起来，必须先去跑 migrations/00120、00121、00122。
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
--    merchant_balance=0 且 settled_rows=0        → 从没结算过（看 ③④）
--    orders_completed 多但 settled_rows 少        → 订单完成了但没触发结算（跑 ③）
--    orders_pending_review 多、completed 少       → 订单卡在"待确认"没完成（跑 ④ 或去后台点"确认完成"）
SELECT
  s.id,
  s.name,
  COALESCE(s.merchant_balance, 0)                                            AS merchant_balance,
  COALESCE(s.wx_sub_mch_id, '未配置子商户号')                                AS wx_sub_mch_id,
  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id)                                              AS orders_total,
  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.status='completed')      AS orders_completed,
  (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.status='pending_review') AS orders_pending_review,
  (SELECT COUNT(*) FROM merchant_settlements ms WHERE ms.store_id = s.id AND ms.status='settled') AS settled_rows
FROM stores s
ORDER BY s.name;

-- ③ 一键回填：把所有「已完成但未结算」的订单结算进余额（幂等，可重复跑）
--    —— 这正是"有订单却看不到货款"的主因（历史单 / 触发器晚建）。
--    取消下面三行注释后执行：
-- SELECT public.fn_settle_order(id) AS result
-- FROM orders o
-- WHERE o.status = 'completed' AND o.store_id IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM merchant_settlements ms WHERE ms.order_id = o.id);

-- ④ 卡在 pending_review 的老订单：强制置 completed 并结算（模拟"超时自动完成"）
--    仅当你确认这些订单确实已完成、且不想一笔笔点"确认完成"时用。
--    取消下面注释执行（默认只处理 7 天前的，与 auto-complete-orders EF 一致）：
-- UPDATE orders
--   SET status = 'completed', paid_at = COALESCE(paid_at, now())
-- WHERE status = 'pending_review'
--   AND store_id IS NOT NULL
--   AND verified_at < now() - interval '7 days';
-- 然后紧接着再跑一次 ③ 的回填，把刚完成的订单也结算掉。

-- ⑤ 回填后复核：重跑 ②，看张林的水果店 merchant_balance 是否已 > 0
