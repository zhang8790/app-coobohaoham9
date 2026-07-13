-- 补齐 order_status 枚举值：纯金豆支付 / 堂食·自取场景使用 'pending_pickup'(待核销)
-- 代码引用：src/db/api.ts:870（dine_in / self_pickup 走 pending_pickup）
-- 原 00001 枚举缺失该值，导致下单报 400 (22P02: invalid input value for enum order_status)
-- 注意：PG 的 `ALTER TYPE ... ADD VALUE` 不支持 IF NOT EXISTS 语法（会报语法错导致整段回滚），
--       改用 DO 块包裹并在 EXCEPTION 中吞掉 duplicate_object，保证幂等、可重复执行。
DO $$
BEGIN
  ALTER TYPE public.order_status ADD VALUE 'pending_pickup';
EXCEPTION
  WHEN duplicate_object THEN NULL; -- 已存在则忽略
END $$;
