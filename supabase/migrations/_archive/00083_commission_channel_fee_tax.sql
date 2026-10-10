-- 00083: 代扣税费 + 佣金净额字段
-- 背景：支付通道费(微信收单成本)与代扣个税均由「用户(佣金受益人)」承担，不从平台/商家出。
--       因此需要在佣金行上记录分摊到的通道费、代扣税与净额，并在订单上记录合计代扣税。
-- 幂等：全部使用 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS，重复执行安全。

-- 1) commissions：每行佣金分摊的通道费、代扣税、净额
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS channel_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_withheld numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN commissions.channel_fee IS '该笔佣金分摊的支付通道费（由用户承担，从佣金扣除）';
COMMENT ON COLUMN commissions.tax_withheld IS '该笔佣金代扣的个人所得税（由用户承担，从佣金扣除）';
COMMENT ON COLUMN commissions.net_amount IS '用户净到手 = commission_amount - channel_fee - tax_withheld';

-- 2) orders：订单佣金合计代扣个税（通道费已在 00082 落 channel_fee）
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tax_withheld numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.tax_withheld IS '本订单佣金合计代扣个税（由用户承担）';

-- 3) 历史数据回填：net_amount 默认为 0，旧佣金未含费税，保持 0（历史不追溯扣）。
--    如需对历史已发佣金补扣，可后续单独跑 UPDATE（本迁移不自动追溯，避免影响已提现数据）。
