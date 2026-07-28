-- 00215 扩展 stock_batches.decided_by 的 CHECK 约束
-- 背景：00213 加列时约束为 IN ('rule','ai')，但手机端商家中心「临期预警管理」
--       保存折扣时写 decided_by='merchant_manual'，被 CHECK 拒绝（23514），
--       导致小程序端「保存折扣」必失败。
-- 修复：扩展枚举值，允许商家手机端手动决策标记，与管理后台手动覆盖语义统一。
-- 幂等：DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT。

ALTER TABLE public.stock_batches
  DROP CONSTRAINT IF EXISTS stock_batches_decided_by_check;

ALTER TABLE public.stock_batches
  ADD CONSTRAINT stock_batches_decided_by_check
  CHECK (decided_by IN ('rule', 'ai', 'merchant_manual'));

COMMENT ON COLUMN public.stock_batches.decided_by IS
  '本次 auto_discount_rate 由谁决定：rule=引擎规则 / ai=AI决策 / merchant_manual=商家手动覆盖';
