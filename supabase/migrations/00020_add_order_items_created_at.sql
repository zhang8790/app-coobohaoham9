-- 补全 order_items 表缺失的 created_at 字段
-- getMerchantOrders 按 created_at 排序，但该表初始 schema 未包含此列
-- 执行时间：2026-07-03

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 为已有数据回填 created_at（用关联订单的时间）
UPDATE public.order_items oi
SET created_at = COALESCE(o.created_at, NOW())
FROM public.orders o
WHERE oi.order_id = o.id AND oi.created_at IS NULL;

-- RLS 确认关闭（测试阶段）
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;

-- 索引
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

SELECT '✅ 00020 执行完成：order_items.created_at 已添加' as result;
