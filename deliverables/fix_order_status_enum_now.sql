-- 立即修复：为 order_status 枚举补 'pending_pickup'
-- 之前那份 fix_runtime 里用了 `ALTER TYPE ... ADD VALUE IF NOT EXISTS`，
-- 但 PG 不支持该语法 → 整段语法报错回滚 → 枚举值没加上 → 下单依旧 22P02。
-- 这份只用合法语法，幂等可重复执行。
DO $$
BEGIN
  ALTER TYPE public.order_status ADD VALUE 'pending_pickup';
EXCEPTION
  WHEN duplicate_object THEN NULL; -- 已存在则忽略
END $$;

-- 验证（应能看到 pending_pickup 出现在结果里）
SELECT enumlabel AS order_status_values
FROM pg_enum
WHERE enumtypid = 'public.order_status'::regtype
ORDER BY enumlabel;
