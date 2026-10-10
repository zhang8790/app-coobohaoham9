-- ============================================================================
-- 00094: 恢复「买家可写自己订单」能力（调和 00081 与前端直写架构）
-- ============================================================================
-- 背景：00081_production_rls_hardening 把 orders / order_items / gold_bean_logs
--       归入「属主只读类」，写入策略收口为「仅 admin / service_role」。
--       但小程序当前是前端用 anon key 直写订单表（createOrderV2 直接 insert
--       orders / order_items，没有走 Edge Function 代理）。
--       一旦 00081 生效，普通买家 createOrderV2 的 orders.insert / order_items.insert
--       被 RLS 拒绝（42501: new row violates row-level security policy）→
--       订单创建失败 → 不能支付。这与「扫码上架被 products 的 admin-only 策略拦死」同类。
--
-- 修复：为订单相关表增加「本人可写」策略，管理员全权：
--   • orders / gold_bean_logs 有 user_id 列 → 直接 user_id = auth.uid() 判定归属；
--   • order_items 无 user_id 列 → 经 order_id 关联 orders.user_id 判定归属。
-- 安全边界：买家只能读写自己(user_id=auth.uid())的订单及所属订单项；管理员全权。
--
-- 自包含：先补建 is_admin()/get_user_role()（若 00081/00093 未执行），再
--         DROP 旧的 admin-only 写策略、重建本人可写策略。
-- 幂等：可重复执行（DROP IF EXISTS + CREATE OR REPLACE 风格）。
-- ============================================================================

-- ---------- 0) 补建管理员判定辅助函数（防御性，已建则覆盖无害） ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('user', 'admin');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = uid; $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false); $$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon, authenticated, service_role;

-- ---------- 1) orders：本人可写（user_id = auth.uid()），管理员全权 ----------
-- 清理 00081 的 admin-only 写策略（rls81_orders_admin）；保留 rls81_orders_ownerread（SELECT）无害。
DROP POLICY IF EXISTS rls81_orders_admin ON public.orders;
CREATE POLICY rls81_orders_owner ON public.orders
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 2) order_items：无 user_id 列，经 order_id 关联 orders.user_id 判定本人 ----------
-- 清理 00081 的 admin-only 写策略（rls81_order_items_adminonly）。
DROP POLICY IF EXISTS rls81_order_items_adminonly ON public.order_items;
CREATE POLICY rls81_order_items_owner ON public.order_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- ---------- 3) gold_bean_logs：本人可写（user_id = auth.uid()），管理员全权 ----------
-- 清理 00081 的 admin-only 写策略（rls81_gold_bean_logs_admin）；保留 rls81_gold_bean_logs_ownerread（SELECT）无害。
DROP POLICY IF EXISTS rls81_gold_bean_logs_admin ON public.gold_bean_logs;
CREATE POLICY rls81_gold_bean_logs_owner ON public.gold_bean_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 4) 防御性：确保这些表 RLS 已开启（不影响已有数据） ----------
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gold_bean_logs FORCE ROW LEVEL SECURITY;

-- 备注：
-- 1) 读策略（ownerread）保持不动，买家仍能读自己的订单/流水；管理员读全量。
-- 2) 越权防护：买家只能读写 user_id=auth.uid() 的订单及所属订单项，无法碰他人订单。
-- 3) 与 00093（商家写自己门店商品）同理，把 00081 过度收紧的写权限按「属主」归还前端直写架构。
-- 4) 幂等：重复执行安全（先 DROP 再 CREATE，函数 IF NOT EXISTS）。
SELECT '✅ 00094 完成：买家可写自己订单(orders/order_items/gold_bean_logs)，管理员全权' AS result;
