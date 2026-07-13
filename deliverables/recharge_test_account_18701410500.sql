-- ============================================================
-- 测试账号充值：18701410500 (test18701410500@test.com)
-- 操作：给 gold_beans（消费积分 / 金豆）增加 50000  (= 500 元)
-- 时间：2026-07-09
-- ============================================================
-- 说明：
--   1. gold_beans 是「消费抵扣账户」，不可提现；与 commission_balance（可提现推广佣金）
--      在 00058 迁移中已彻底隔离，本脚本只动 gold_beans，不影响佣金。
--   2. 每执行一次 +50000，重复执行会叠加（充值本就非幂等）。
--   3. 若返回 "UPDATE 0"（0 rows），说明线上库还没有该测试账号 ——
--      请先在小程序用 18701410500 / 123456 登录一次（触发账号创建），再回来执行本脚本。
--
-- ⚠️ 单位确认：当前按「50000 金豆 = 500 元」充值。
--    若你实际想充的是「50000 元」，把下面 + 50000 改成 + 5000000。
--    若想「直接覆盖成恰好 50000 金豆」而非累加，把 gold_beans = ... + 50000 改成 gold_beans = 50000。
-- ============================================================

UPDATE public.profiles
SET gold_beans = COALESCE(gold_beans, 0) + 50000
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'test18701410500@test.com'
);

-- 验证充值结果（确认 gold_beans 已增加、commission_balance 未被改动）
SELECT
  p.id,
  p.phone,
  p.gold_beans,
  p.commission_balance,
  u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'test18701410500@test.com';

-- ------------------------------------------------------------
-- 备选方案：若你的 SQL Editor 无权查询 auth.users（极少数环境），
-- 改用手机号匹配（profiles.phone 可能存 '18701410500' 或 '+8618701410500'）：
-- ------------------------------------------------------------
-- UPDATE public.profiles
-- SET gold_beans = COALESCE(gold_beans, 0) + 50000
-- WHERE phone IN ('18701410500', '+8618701410500');
