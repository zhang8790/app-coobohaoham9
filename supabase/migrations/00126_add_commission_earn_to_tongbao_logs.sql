-- 00126_add_commission_earn_to_tongbao_logs.sql
-- 背景：2026-07-19 业务决策将推广佣金改发情绪豆(tb_balance)，
--       distribute-commission Edge Function 写入 tongbao_logs(type='commission_earn')。
--       但 00096 迁移的 type CHECK 约束未包含 commission_earn，会导致分佣流水插入失败。
-- 作用：在 tongbao_logs 的 type CHECK 约束中追加 'commission_earn'，幂等安全。

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
    ''purchase_earn'',''refund_deduct'',''commission_earn''))';
END $$;
