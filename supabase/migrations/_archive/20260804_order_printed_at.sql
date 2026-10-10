-- 订单打印状态跟踪：用于"未打印"筛选 + 停电/断网漏单补打
-- printed_at 为 NULL 表示从未成功打印（待补打）；非 NULL 表示最近一次成功打印时间
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS printed_at timestamptz;

COMMENT ON COLUMN public.orders.printed_at IS
  '最近一次成功打印小票的时间；NULL = 从未打印（待补打）。用于商家端"未打印"筛选与批量补打。';
