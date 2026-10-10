-- 00077 提现实名信息补全：真实姓名 + 身份证号
-- 背景：总后台佣金兑付审核页需核对 真实姓名 / 身份证 / 开户行 / 账号 才能打款，
--       原 withdrawals 表仅有 bank_holder（仅银行卡方式填写），缺少统一真实姓名与身份证。
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS real_name TEXT,
  ADD COLUMN IF NOT EXISTS id_card  TEXT;

-- 索引：按身份证/姓名检索（审核与合规核对用）
CREATE INDEX IF NOT EXISTS idx_withdrawals_real_name ON withdrawals(real_name) WHERE real_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_id_card  ON withdrawals(id_card)  WHERE id_card  IS NOT NULL;
