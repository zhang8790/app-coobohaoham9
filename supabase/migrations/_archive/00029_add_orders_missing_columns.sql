-- ============================================================
-- 00029: 补全 orders 表缺失字段 — service_type 等
-- 根因：createOrderV2 插入时报 PGRT204: 找不到 service_type 列
-- ============================================================

BEGIN;

-- 订单服务类型（堂食/自取/外卖）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(32) DEFAULT 'self_pickup';

-- 支付时间戳
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 支付过期时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_expired_at TIMESTAMPTZ;

-- 验证
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN column_name = 'service_type' THEN '✅ 已添加'
    ELSE '已存在'
  END AS status
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('service_type', 'paid_at', 'pay_expired_at')
ORDER BY ordinal_position;

COMMIT;
