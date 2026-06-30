
-- 1. products 表加 barcode 字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- 2. withdrawals 提现表
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  alipay_account TEXT,
  withdraw_method TEXT NOT NULL DEFAULT 'bank' CHECK (withdraw_method IN ('bank','alipay','wechat')),
  reject_reason TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户只能查看自己的提现记录" ON withdrawals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "用户只能创建自己的提现申请" ON withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. 商家可查看其门店相关订单条目
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='order_items' AND policyname='商家可读取自己门店订单条目'
  ) THEN
    CREATE POLICY "商家可读取自己门店订单条目" ON order_items
      FOR SELECT USING (
        store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
      );
  END IF;
END $$;
