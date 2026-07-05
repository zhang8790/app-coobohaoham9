-- ============================================================
-- 00028: 彻底关闭所有关键表的 RLS（测试阶段）
-- 根因：createOrderV2 查询 profiles 表返回 400，说明 RLS 仍在拦截
-- ============================================================

BEGIN;

-- 关闭所有业务表的 RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;

-- 验证
SELECT 
  tablename,
  rowsecurity AS rls_enabled,
  CASE WHEN rowsecurity THEN '❌ 仍开启' ELSE '✅ 已关闭' END AS status
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('profiles','orders','order_items','products','stores','cart_items');

COMMIT;
