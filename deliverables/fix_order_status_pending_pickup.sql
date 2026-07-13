-- 修复：金豆(纯豆)自取/堂食下单创建订单失败
-- 根因：orders.status 是枚举 public.order_status，代码写 'pending_pickup'(api.ts:870)，
--       但 00001 枚举只有 pending_pay/pending_ship/pending_receive/pending_review/completed/after_sale/cancelled，缺 pending_pickup
--       → 插入报 22P02 invalid input value for enum order_status → "创建订单失败"
-- 注意：必须作为【独立语句】在 Supabase SQL Editor 执行（编辑器默认 autocommit，不在事务块内）。
--       DO 块 / 事务块内执行 ALTER TYPE ADD VALUE 会报 "cannot run inside a transaction block" 而回滚。

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending_pickup';
