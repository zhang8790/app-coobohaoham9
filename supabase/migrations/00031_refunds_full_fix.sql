-- ============================================================
-- 00031: refunds 表 - 补全 applyRefund 所需的所有字段
-- 执行时间: 2026-07-04
-- 说明: 彻底解决 "Could not find column" 错误
-- ============================================================

-- refunds 表：补全所有字段
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_no VARCHAR(64);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS order_no VARCHAR(64);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS item_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending_review';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS wechat_refund_id VARCHAR(128);

-- 关闭 RLS（测试阶段）
ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;

-- 验证
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'refunds' 
ORDER BY ordinal_position;
