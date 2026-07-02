-- 添加 parent_order_no 字段，关联同一笔结算的多个子订单（跨门店结算）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_no TEXT;

-- 添加索引，方便按 parent_order_no 查询
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_no ON orders(parent_order_no);

-- 添加注释
COMMENT ON COLUMN orders.parent_order_no IS '父订单号，跨门店结算时多个子订单共享同一个父订单号';
