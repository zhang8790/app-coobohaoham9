-- 历史订单补打标记回填：旧流程在"确认完成"时自动打印，
-- 这些终态订单（completed/after_sale）视为已打印，回填 printed_at，
-- 避免它们全部涌入"未打印"筛选造成噪音。pending_* 与 cancelled 保持 NULL（待补打/不打印）。
-- 幂等：仅回填 printed_at 仍为 NULL 的终态订单。
UPDATE public.orders
SET printed_at = COALESCE(paid_at, created_at)
WHERE printed_at IS NULL
  AND status IN ('completed', 'after_sale');
