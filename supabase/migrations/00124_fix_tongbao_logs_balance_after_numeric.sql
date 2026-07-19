-- =====================================================
-- 00124: tongbao_logs.balance_after 改为 numeric(12,2)
-- -----------------------------------------------------
-- 背景：
--   - 00076 建 gold_bean_logs 时 balance_after 用了 int（旧设计：1 豆 = 1 元，整数语义）。
--   - 00096 改名 tongbao_logs 后列结构未改。
--   - 2026-07-19 上线后 admin-web 充值时遇到：
--       "流水写入失败：invalid input syntax for type integer: \"1015.33\""
--     根因：profiles.tb_balance 已是 numeric(12,2)（存了 15.33 这种小数余额，来自 #319 订单精确扣豆），
--           但 tongbao_logs.balance_after 是 int，cur(15.33) + amt(1000) = 1015.33 写不进 int。
--   - delta 保持 int（充值走 1 豆 = 1 元整数语义，与 commission_logs.delta 保持一致）。
--
-- 幂等：USING 表达式把旧 int 安全 cast 到 numeric，无副作用，可重复执行。
-- =====================================================

ALTER TABLE public.tongbao_logs
  ALTER COLUMN balance_after TYPE numeric(12,2) USING balance_after::numeric(12,2);

-- sanity check：列类型已切到 numeric
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tongbao_logs' AND column_name = 'balance_after';

  IF v_data_type = 'numeric' THEN
    RAISE NOTICE '[00124] tongbao_logs.balance_after 已为 numeric(12,2)，修复成功';
  ELSE
    RAISE WARNING '[00124] tongbao_logs.balance_after 类型异常，当前=%（期望 numeric）', v_data_type;
  END IF;
END $$;
