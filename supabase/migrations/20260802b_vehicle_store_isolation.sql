-- ============================================================
-- 20260802b 流动车门店隔离（P3 门店联动）
-- 目标：将 vehicles / vehicle_transfers 从测试期 permissive using(true)
--       改为按「统一 RBAC 门店域」隔离，使流动车随运营身份「通」到
--       对应门店（owner_id 或 store_staff 活跃成员），并实现跨端隔离。
-- 复用：fn_my_store_ids / is_admin（来自 20260802_self_operated_unified_rbac.sql）
-- 部署：supabase db query --linked --file <this-file>
-- ============================================================

-- 1) vehicles：按 store_id 落入运营者门店域，admin 全量可见可写
DROP POLICY IF EXISTS veh_all ON public.vehicles;
CREATE POLICY veh_store_isolation_select ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

CREATE POLICY veh_store_isolation_write ON public.vehicles
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

-- 2) vehicle_transfers：经 vehicle_id 关联 vehicles.store_id，
--    只有该车所属门店的运营者 / admin 可见可写（弱网离线标记也受控）。
DROP POLICY IF EXISTS vt_all ON public.vehicle_transfers;
CREATE POLICY vt_store_isolation_select ON public.vehicle_transfers
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE store_id = ANY(public.fn_my_store_ids(auth.uid()))
    )
  );

CREATE POLICY vt_store_isolation_write ON public.vehicle_transfers
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE store_id = ANY(public.fn_my_store_ids(auth.uid()))
    )
  )
  WITH CHECK (
    public.is_admin()
    OR vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE store_id = ANY(public.fn_my_store_ids(auth.uid()))
    )
  );

SELECT '20260802b 流动车门店隔离 RLS 已完成' AS result;
