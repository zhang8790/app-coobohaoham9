/* 网页版「手机号+密码」登录前置：把商家账号的手机号写入 auth.users.phone 身份列。
   网页版 signInWithPhonePassword 已改为原生 Supabase phone+password（不再依赖 service_role / admin API）。
   执行条件：
   1. Supabase 后台 Authentication → Providers → Phone 已启用，且允许 phone+password 登录；
   2. 本 SQL 需以 service_role / 数据库超级用户执行（Supabase Dashboard → SQL Editor，postgres 角色）；
   3. 沙箱无 service_role，必须在本机 Dashboard 执行，不能由 WorkBuddy 沙箱跑。
   幂等：已写入的不会重复覆盖（段 2 限定 u.phone IS NULL）。 */

/* 段 1：指定测试账号 test18701410500@test.com → 绑定 +8618701410500（密码 12345678 保持） */
UPDATE auth.users
SET phone = '+8618701410500',
    phone_confirmed_at = now()
WHERE email = 'test18701410500@test.com';

/* 段 2：批量回填——所有 profiles.phone 有值、但 auth.users.phone 为空的账号（幂等）。
   归一化：先去开头 +86，再去所有非数字，统一前缀 +86，避免重复国家码。 */
UPDATE auth.users u
SET phone = '+86' || regexp_replace(regexp_replace(p.phone, '^\+?86', ''), '\D', '', 'g'),
    phone_confirmed_at = COALESCE(u.phone_confirmed_at, now())
FROM profiles p
WHERE u.id = p.id
  AND p.phone IS NOT NULL
  AND u.phone IS NULL;

/* 段 3（可选·核对）：执行后回显已绑定手机号的账号数，便于确认生效 */
SELECT count(*) AS users_with_phone
FROM auth.users
WHERE phone IS NOT NULL;
