-- =====================================================
-- 00096: 金豆(balance) 合并为情绪豆(tb_balance)，统一为平台唯一内部货币
-- -----------------------------------------------------
-- 决策（用户确认）：
--   1. 合并为单一货币：删除金豆账户，tb_balance(情绪豆) 成为唯一可充值/可支付货币
--   2. 存量金豆并入情绪豆（balance -> tb_balance，用户资产不丢失）
--   3. 确权发豆保留为忠诚度返利（花情绪豆买 -> 确权又得情绪豆）
-- 注意：
--   - gold_beans 列是历史遗留(已并入佣金_balance)，不在此迁移范围
--   - balance 才是「当前金豆消费币」，本次并入 tb_balance 后弃用
--   - 本迁移幂等，可重复执行；沙箱无 SQL 权限，需本机 Supabase SQL Editor 执行
-- =====================================================

-- 1) 存量金豆并入情绪豆（幂等：仅对 balance>0 的用户累加）
UPDATE public.profiles
SET tb_balance = COALESCE(tb_balance, 0) + COALESCE(balance, 0)
WHERE COALESCE(balance, 0) > 0;

-- 2) 弃用 balance 列：值已并入 tb_balance，此处清零，确保单一真相源为 tb_balance
--    （保留列不删，避免破坏尚未部署的代码；确认所有代码改为 tb_balance 后可 DROP）
UPDATE public.profiles SET balance = 0 WHERE COALESCE(balance, 0) <> 0;

-- 3) orders: 新增 tb_used 列承接金豆抵扣额（gold_beans_used 弃用）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tb_used numeric(12,2) NOT NULL DEFAULT 0;
UPDATE public.orders
SET tb_used = COALESCE(gold_beans_used, 0)
WHERE COALESCE(gold_beans_used, 0) <> COALESCE(tb_used, 0);

-- 4) 先调整 orders.payment_method 的 CHECK 约束，允许 emotion_beans（并保持 gold_beans 合法，避免 UPDATE 期间旧行违反约束）
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN (''wxpay'',''gold_beans'',''emotion_beans''))';
END $$;

-- 5) payment_method 枚举值 gold_beans -> emotion_beans
UPDATE public.orders SET payment_method = 'emotion_beans' WHERE payment_method = 'gold_beans';

-- 6) 清理后收缩约束，仅保留 wxpay / emotion_beans（gold_beans 已不在使用）
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN (''wxpay'',''emotion_beans''))';
END $$;

-- 7) gold_bean_logs 改名 tongbao_logs（语义统一为情绪豆流水）
--    仅当表存在且未重命名时执行
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gold_bean_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tongbao_logs'
  ) THEN
    EXECUTE 'ALTER TABLE public.gold_bean_logs RENAME TO tongbao_logs';
  END IF;
END $$;

-- 8) 扩展 tongbao_logs 的 type 约束，纳入新增流水类型（purchase_earn / refund_deduct）
--     动态定位并重建 CHECK 约束，避免硬编码约束名导致失败
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.tongbao_logs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tongbao_logs DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.tongbao_logs ADD CONSTRAINT tongbao_logs_type_check CHECK (type IN (
    ''purchase_spend'',''refund_return'',''recharge'',''admin_grant'',''admin_deduct'',
    ''purchase_earn'',''refund_deduct''))';
END $$;

-- 9) 校验（执行后查看结果，确认迁移正确）
SELECT 'profiles_merged' AS step, COUNT(*) AS rows_with_tb_balance
FROM public.profiles WHERE COALESCE(tb_balance, 0) > 0;

SELECT 'orders_tb_used' AS step, COUNT(*) AS rows_with_tb_used
FROM public.orders WHERE COALESCE(tb_used, 0) > 0;

SELECT DISTINCT payment_method FROM public.orders ORDER BY 1;

SELECT 'table_renamed' AS step, COUNT(*) AS tongbao_logs_exists
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'tongbao_logs';
