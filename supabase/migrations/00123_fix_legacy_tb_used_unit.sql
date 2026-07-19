-- 热修：将历史「豆数口径」tb_used 转为「元口径」，并重建约束
-- 根因：00096 金豆→情绪豆合并前，tb_used 以「豆数」存储（1 豆 = 0.01 元）；
--       合并后全库统一为「元」口径（1 豆 = 1 元，与 tb_balance 一致）。
--       遗留订单 tb_used 仍为豆数（如 10.00 豆 = ¥0.10），而 total_amount = ¥0.10，
--       导致 tb_used(10.00) > total_amount(0.10) 触发 chk_orders_tb_used_not_exceed_total。
-- 背景：00097 第 4 步曾因 tongbao_logs 约束报 23514 中断，第 5 步(数据修正)与第 6 步(加约束)未执行，
--       故本迁移：先卸约束 → 修正遗留数据 → 重建约束，可独立、幂等运行。
--
-- 数据修正判定（仅对 tb_used > total_amount 的异常行）：
--   豆数口径遗留行：tb_used 远大于 total（约百倍，ratio >= 2）→ ×0.01 转元（精确还原真实抵扣）
--   现代超额抵扣（原 00097 目标）：tb_used 仅略大于 total（ratio < 2）→ 封顶为 total_amount

-- 0) 幂等：先卸掉约束，避免 ADD 时因遗留脏数据报 23514
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_tb_used_not_exceed_total;

-- 1) 修正遗留 tb_used（仅对 tb_used > total_amount 的异常行）
UPDATE public.orders
SET tb_used = CASE
    WHEN tb_used >= total_amount * 2 THEN ROUND(tb_used * 0.01, 2)   -- 旧豆数口径：×0.01 精确还原
    ELSE total_amount                                                  -- 现代超额抵扣：封顶为成交额
  END
WHERE tb_used > total_amount
  AND total_amount > 0
  AND (refund_status IS NULL OR refund_status = 'none');

-- 2) 重建约束（幂等）
ALTER TABLE public.orders
ADD CONSTRAINT chk_orders_tb_used_not_exceed_total
CHECK (tb_used IS NULL OR total_amount IS NULL OR tb_used <= total_amount);

-- 3) 同步重建 tb_used_capped 计算列（若存在则先卸）
ALTER TABLE public.orders DROP COLUMN IF EXISTS tb_used_capped;
ALTER TABLE public.orders
ADD COLUMN tb_used_capped numeric(12,2) GENERATED ALWAYS AS (
  COALESCE(LEAST(COALESCE(tb_used, 0), COALESCE(total_amount, 0)), 0)
) STORED;

SELECT '✅ 遗留 tb_used 豆数口径已转为元，约束与计算列已重建' AS result;
