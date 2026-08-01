-- =====================================================================
-- 00132 · 修复商家端「订单汇总（让利后）」让利总额 / 实收 取不到数据
-- ---------------------------------------------------------------------
-- 问题：merchant_settlements 在生产库处于 RLS 启用状态，且没有任何
--       SELECT 策略。小程序商家以普通 authenticated 会话读取
--       getMerchantOrders 时，orders→merchant_settlements 的嵌套 embed
--       被 RLS 拦截 → 该表返回空 → 让利总额 / 实收 恒为 0；
--       而订单数 / 销售总额 来自 orders.total_amount（商家可读）正常。
--       管理后台(admin-web)用 service_role 直连，绕过 RLS，所以后台数字正常，
--       造成「后台有数、商家端让利/实收为 0」的不一致。
--
-- 修复：补一条「店铺拥有者可读自己门店结算台账」的 SELECT 策略。
--       - 仅 authenticated 角色可读；
--       - 仅能读到 owner_id = auth.uid() 的门店下的结算行；
--       - 不影响 admin-web（service_role 绕过 RLS）；
--       - 不改变 00120 的 DISABLE 意图，而是用最小权限策略替代「全关 RLS」。
-- =====================================================================

-- 若此前 RLS 被误开启且无策略，先确保表处于 RLS 启用状态（策略才能生效）
ALTER TABLE public.merchant_settlements ENABLE ROW LEVEL SECURITY;

-- 店铺拥有者读取自己门店的结算台账（供小程序商家端 embed / 结算台账列表使用）
DROP POLICY IF EXISTS "store_owner_read_own_settlements" ON public.merchant_settlements;
CREATE POLICY "store_owner_read_own_settlements"
  ON public.merchant_settlements
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- 诊断输出
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'merchant_settlements'
       AND policyname = 'store_owner_read_own_settlements'
  ) THEN
    RAISE NOTICE '[00132] 已新增策略 store_owner_read_own_settlements：商家端可读自己门店结算台账。';
  ELSE
    RAISE NOTICE '[00132] 警告：策略未创建成功，请检查。';
  END IF;
END $$;
