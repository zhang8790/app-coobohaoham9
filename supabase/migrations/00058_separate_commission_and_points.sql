-- =============================================================
-- 00058 账户分离：推广佣金账户 vs 消费积分账户
-- =============================================================
-- 背景（合规动因）
--   原 gold_beans 字段同时承担两个互斥角色：
--     ① 订单 1:1 抵扣（消费积分，api.createOrderV2 / refund-order）
--     ② 被 withdraw / admin-withdrawals 当作「可提现余额」读取并扣减
--   而真正的分销佣金流水实际写在 commissions 表 + profiles.total_commission / settled_commission，
--   且 withdrawals 表已有 commission_ids 字段本应绑定具体佣金。
--   => 代码把「消费积分」当「可提现平台代币」提现，观感上等同「平台发币可提现」（合规红线）。
--
-- 目标模型
--   gold_beans       = 【消费积分（金豆）】仅用于本平台订单 1:1 抵扣，不可提现、不可兑现金
--   commission_balance= 【推广佣金账户】由分销佣金流水驱动，可提现（代扣个税），与 gold_beans 完全隔离
--   withdrawals       = 仅可动 commission_balance，并通过 commission_ids 关联具体佣金明细
--
-- 执行方式：Supabase → SQL Editor 粘贴 → Run（纯 SQL，非 Edge Function）
-- =============================================================

BEGIN;

-- 1. 新增推广佣金账户（可提现，单位：元）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_balance numeric(12,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.commission_balance
  IS '推广佣金账户余额（即推广服务费，可提现并代扣个税）；由分销佣金流水驱动，与消费积分(gold_beans)完全隔离';

COMMENT ON COLUMN public.profiles.gold_beans
  IS '消费积分（金豆）：仅用于本平台订单 1:1 抵扣，不可提现、不可兑现金；与推广佣金账户(commission_balance)隔离';

-- 2. 存量数据回填（过渡口径，执行前请确认）
--    现状：历史上 withdraw / admin-withdrawals 从 gold_beans 提现；而佣金发放只写
--          total_commission / settled_commission，且发放时二者同额增加、提现却不扣 settled，
--          故 total_commission - settled_commission 对存量数据恒为 0 —— 原「减差」回填会得到 0，
--          导致存量用户提现归零。
--    决策：把用户「历史上实际可提现的余额」(gold_beans) 显式挂到 commission_balance，
--          gold_beans 本身保留不动（仍可作消费抵扣，不抹除任何权益）。
--          => commission_balance 与 gold_beans 各持一份，提现只消耗 commission_balance、
--             消费抵扣只消耗 gold_beans，二者独立不双花。
--    后续若 gold_beans 引入独立发放源（签到/活动），需重新界定两账户关系。
UPDATE public.profiles
SET commission_balance = GREATEST(0, COALESCE(gold_beans, 0))
WHERE COALESCE(gold_beans, 0) > 0;

-- 3. 约束：佣金账户、消费积分均不可为负（DO 块防历史脏数据导致 ALTER 失败）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_commission_balance_nonneg'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_commission_balance_nonneg CHECK (commission_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_gold_beans_nonneg'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_gold_beans_nonneg CHECK (gold_beans >= 0);
  END IF;
END $$;

COMMIT;

-- =============================================================
-- 配套代码改造（本迁移不自动改代码，详见《账户分离改造方案.md》）
--   必须同步执行，否则「提现仍读 gold_beans」的错乱不会消失：
--   A. 提现改为读 commission_balance：api.ts approveWithdrawal(2214) / getMyBalance(1931) /
--      pages/withdraw/index.tsx(47) / pages/admin-withdrawals / pages/my-promotion(70,86,111)
--   B. 佣金发放维护 commission_balance：api.ts distributeCommissionV4(999-1024) 发放时 +=，
--      且退款须同步回滚 commission_balance（当前 refund 只回滚 gold_beans，未回滚佣金，存在资损）
--   C. 订单/退款的 gold_beans 保持「仅消费抵扣」语义，注释澄清，绝不与提现混用
--   D. types.ts：Profile 新增 commission_balance:number；gold_beans 注释改为「消费积分，不可提现」
-- =============================================================
