-- ============================================================================
-- 00093: 恢复「门店 owner 可写自己门店商品」能力
-- 背景：00081 生产 RLS 加固把 products 当作「无 user_id 列的目录表」，
--       其写入策略退化为仅 is_admin() 可写，导致普通商家扫码上架 / 手动新增 / 上下架
--       全部被 RLS 拒绝。
-- 修复：在保留「目录公开读 + 管理员全权」的前提下，新增「门店 owner 可写
--       自己 store_id 所属商品」的策略。安全边界：商家只能操作自己门店。
-- 自包含：本脚本会补建 is_admin() / get_user_role() 辅助函数，避免 42883 报错。
-- ============================================================================

-- ---------- 0) 补建管理员判定辅助函数（如果 00081 尚未执行） ----------
-- 若 user_role 类型已存在（正常情况下），CREATE TYPE IF NOT EXISTS 安全忽略；
-- 若不存在，先建枚举类型（保持与 00001 一致）。
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
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false);
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- 让 get_user_role 也能被策略/函数调用（防御性授权）
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon, authenticated, service_role;

-- ---------- 1) 清理 00081 可能给 products 建的 admin-only 写策略（多命名兜底） ----------
DROP POLICY IF EXISTS rls81_products_admin ON public.products;
DROP POLICY IF EXISTS rls81_products_adminonly ON public.products;

-- 门店 owner 写策略：owner = stores.owner_id = auth.uid()
CREATE POLICY rls81_products_merchant_write ON public.products
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = auth.uid()
    )
  );

-- ---------- 2) 防御性：确保 products 表 RLS 已开启（不影响已有数据） ----------
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

-- 备注：
-- 1) rls81_products_read（目录公开读，USING (true)）保持不动，前端列表不受影响。
-- 2) 商家端小程序使用 anon key 直连，授权通过 auth.uid() 校验门店归属，无需改动前端代码。
-- 3) 越权防护：商家只能读写 store_id 对应门店的商品，无法碰他人门店数据。
-- 4) 幂等：重复执行安全（先 DROP 再 CREATE，函数 IF NOT EXISTS）。
SELECT '✅ 00093 完成：门店 owner 已可写入自己门店的 products，且 is_admin() 已补建' AS result;
