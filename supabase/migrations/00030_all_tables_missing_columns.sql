-- ============================================================
-- 00030: 彻底补全所有表缺失字段（终极修复）
-- 根因：多次遇到 PGRT204 "Could not find column" 错误
-- 策略：逐表补全，确保 createOrderV2 / applyRefund 所有字段都存在
-- ============================================================

BEGIN;

-- ==================== orders 表 ====================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(32) DEFAULT 'self_pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_expired_at TIMESTAMPTZ;

-- ==================== order_items 表 ====================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ==================== refunds 表（重点！）====================
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_no VARCHAR(64);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending_review';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS wechat_refund_id VARCHAR(128);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ==================== profiles 表（金豆相关）====================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gold_beans INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ==================== 验证 ====================
SELECT
  'orders' AS tbl,
  COUNT(*) FILTER (WHERE column_name IN ('service_type','paid_at','pay_expired_at')) AS found,
  ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('service_type','paid_at','pay_expired_at')) AS cols
FROM information_schema.columns WHERE table_name = 'orders'
UNION ALL
SELECT
  'order_items', COUNT(*) FILTER (WHERE column_name IN ('store_name','product_image','created_at')),
  ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('store_name','product_image','created_at'))
FROM information_schema.columns WHERE table_name = 'order_items'
UNION ALL
SELECT
  'refunds', COUNT(*) FILTER (WHERE column_name IN ('refund_no','user_id','initiated_by','status',
    'refund_quantity','refund_amount','reason','description','version','completed_at','updated_at')),
  ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('refund_no','user_id','initiated_by','status',
    'refund_quantity','refund_amount','reason','description','version','completed_at','updated_at'))
FROM information_schema.columns WHERE table_name = 'refunds';

COMMIT;
