-- 00082: 订单增加支付通道费字段（微信支付收单成本，用于财务对账）
-- 通道费 = 现金基数 × 通道费率，由平台承担，不侵蚀用户分账。
-- 幂等：使用 IF NOT EXISTS，重复执行安全。

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_fee_rate numeric(5,4) NOT NULL DEFAULT 0.006;

COMMENT ON COLUMN orders.channel_fee IS '本笔订单微信支付通道费（平台收单成本，按现金基数×费率计提）';
COMMENT ON COLUMN orders.channel_fee_rate IS '本笔订单实际通道费率（默认0.006=0.6%，可随微信商户类目配置）';

-- 便于按通道费对账的索引（轻量，可选）
CREATE INDEX IF NOT EXISTS idx_orders_channel_fee ON orders (channel_fee) WHERE channel_fee > 0;
