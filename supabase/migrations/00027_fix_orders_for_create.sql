-- ============================================================
-- 00027: 修复 orders 表 — 确保 create-order Edge Function 能正常插入
-- 根因：多个迁移文件（00015/00017/00019 等）可能未全部执行到云端 DB
-- ============================================================

BEGIN;

-- ==================== orders 表：补全所有字段 ====================

-- 基础字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_no VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending_pay';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 幂等/跨门店
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128) UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_no VARCHAR(128);

-- 地址/物流
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_json JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(128);

-- 退款
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'none';

-- 佣金/分润
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_income NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT false;

-- 推荐人/员工
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id UUID;

-- 索引
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);

-- ==================== order_items 表：补全字段 ====================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ==================== 验证 ====================
SELECT
  'orders 表字段验证' AS check_type,
  CASE WHEN count(*) > 0 THEN '✅ 字段存在' ELSE '❌ 缺失关键字段' END AS result
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('store_id', 'order_no', 'user_id', 'total_amount', 'status',
                     'payment_method', 'gold_beans_used', 'idempotency_key', 'parent_order_no')
GROUP BY check_type;

SELECT
  'orders 关键字段列表' AS info,
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

COMMIT;
