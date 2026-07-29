-- 20260728: 推广/佣金风控支持
-- 目标：堵住「自推自分佣」资损漏洞，让管理员可在风控看板识别并冻结可疑佣金。
-- 幂等：可重复执行，已存在的列/约束/策略/索引自动跳过。

-- 1) commissions 增加 risk_flag 列（应用层在分佣时写入可疑标记）
--    NULL                 = 正常
--    'self_referral'      = 自推自（L1 即买家本人，或 L1 的上级链最终指回买家）
--    'new_account_referral' = L1 为新注册账号(<7天)即产生推荐成交，疑似养号小号
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS risk_flag text;
COMMENT ON COLUMN public.commissions.risk_flag IS
  '风控标记：self_referral=自推自；new_account_referral=新号疑似养号；NULL=正常';

-- 2) status 扩展 'frozen'（可疑佣金冻结，不结算、待人工审核放行/拒结）
--    幂等重建 check 约束：仅当约束尚不含 frozen 时才重建，避免重复执行报错。
DO $$
DECLARE
  has_frozen boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.commissions'::regclass
      AND c.conname = 'commissions_status_check'
      AND pg_get_constraintdef(c.oid) LIKE '%frozen%'
  ) INTO has_frozen;

  IF NOT has_frozen THEN
    ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_status_check
      CHECK (status IN ('pending', 'settled', 'refunded', 'frozen'));
  END IF;
END $$;
COMMENT ON COLUMN public.commissions.status IS
  'pending=待结算；settled=已结算；refunded=已退款冲销；frozen=风控冻结待审';

-- 3) admin 可读全部 commissions（风控看板依赖；原 RLS 仅允许受益人读自己）
DROP POLICY IF EXISTS "admin_read_all_commissions" ON public.commissions;
CREATE POLICY "admin_read_all_commissions" ON public.commissions
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 4) 索引（可疑行 + 状态过滤）
CREATE INDEX IF NOT EXISTS idx_commissions_risk_flag
  ON public.commissions (risk_flag) WHERE risk_flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_status
  ON public.commissions (status);
