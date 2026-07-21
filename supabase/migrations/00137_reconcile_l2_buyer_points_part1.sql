-- 00137: 修正 00135 兜底补发遗留的二级佣金与购买者确权积分缺失
-- 背景：
--   00135 仅补发了 L1 佣金，未补 L2 与买家积分；00136 去重回收后，两单仍缺失 L2/积分。
--   本迁移先把 00135 旧记录与 v5 重跑产生的 mixed 记录清掉，按当前 distribute-commission v5
--   重新完整分佣，并回写 orders.l1_commission/l2_commission/buyer_points/platform_income。

BEGIN;

-- 1) 清理这两单的佣金/金豆流水（保留 00136 的 commission_revoke 审计行）
DELETE FROM public.commissions WHERE order_id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);
DELETE FROM public.tongbao_logs WHERE order_id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
) AND type <> 'commission_revoke';
DELETE FROM public.points_logs WHERE related_order_id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);

-- 2) 重置订单分佣状态，便于外部 EF 重新分发
UPDATE public.orders
SET
  commission_distributed = false,
  l1_commission = 0,
  l2_commission = 0,
  buyer_points = 0,
  platform_income = 0
WHERE id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);

COMMIT;

-- 说明：下一步在沙箱/CLI 执行 scripts/retry-distribute.mjs，调用 distribute-commission EF
-- 对这两单重新完整分佣。之后运行下面的 00137_part2.sql 回写订单字段与积分日志。
