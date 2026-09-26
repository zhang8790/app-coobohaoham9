/* 门店店主账号「网页版登录身份」统一脚本
   目的：让线上门店 owner 账号具备统一的「邮箱 或 手机号 + 密码」网页版登录身份。
   执行位置：Supabase Dashboard -> SQL Editor（需 postgres / service_role 权限）。
   前置：Authentication -> Providers -> Phone 已启用（允许 phone+password 登录）。
   幂等：重复执行不覆盖已有 phone；只补空值。沙箱无 service_role，必须在本机 Dashboard 执行。 */

/* 段 1：诊断。列出所有「有 owner 的门店」及其店主账号登录身份现状。
   判读：email 有值→可邮箱登录；auth_phone 有值→可手机号登录；has_password=true→密码可用。 */
SELECT
  s.name                            AS store_name,
  s.owner_id,
  u.email,
  u.phone                           AS auth_phone,
  (u.phone_confirmed_at IS NOT NULL) AS phone_confirmed,
  (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_password,
  p.nickname,
  p.phone                           AS profile_phone,
  p.role::text                      AS profile_role,
  p.merchant_status::text           AS merchant_status
FROM stores s
JOIN auth.users u ON u.id = s.owner_id
LEFT JOIN profiles p ON p.id = s.owner_id
WHERE s.owner_id IS NOT NULL
ORDER BY s.created_at;

/* 段 2：回填两个已知账号的手机号身份（auth.users.phone）。
   张林水果店 / 巫山烤鱼 邮箱已确认，手机号来自既有业务记录。仅补空值，幂等。 */
UPDATE auth.users u
SET phone = v.phone,
    phone_confirmed_at = COALESCE(u.phone_confirmed_at, now())
FROM (VALUES
  ('test18701410500@test.com', '+8618701410500'),
  ('test18565613635@test.com', '+8618565613635')
) AS v(email, phone)
WHERE u.email = v.email
  AND u.phone IS NULL;

/* 段 3：批量回填。凡 profiles.phone 有值、auth.users.phone 为空的账号，统一补上（幂等）。
   注意：杭州礼品店店主 profiles.phone 目前为空，需先在「用户管理」页或下面段 5 填好后再重跑本段。 */
UPDATE auth.users u
SET phone = '+86' || regexp_replace(regexp_replace(p.phone, '^\+?86', ''), '\D', '', 'g'),
    phone_confirmed_at = COALESCE(u.phone_confirmed_at, now())
FROM profiles p
WHERE u.id = p.id
  AND p.phone IS NOT NULL
  AND u.phone IS NULL;

/* 段 4：核对。执行后应看到三家店主均有 auth_phone（若杭州未填则为空，属预期）。 */
SELECT
  s.name AS store_name,
  u.email,
  u.phone AS auth_phone,
  (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_password
FROM stores s
JOIN auth.users u ON u.id = s.owner_id
WHERE s.owner_id IS NOT NULL
ORDER BY s.created_at;

/* 段 5：杭州礼品店店主（昵称「123」）目前无手机号，无法用「手机号+密码」登录。
   推荐做法：在总后台「用户管理」页对它「新建账号」补一个规范账号（邮箱+手机号+密码），
   或在 SelfStores「门店与店长管理」里把该店重绑到一个规范账号。
   若坚持用原账号，请先拿到它的手机号，手工补 profiles.phone 后重跑段 3：
     UPDATE profiles SET phone = '手机号' WHERE id = '99f02c72-b238-4f76-8817-73b2848d8d65';
   （请把上面 手机号 换成真实值后再执行；不要留占位符。） */

/* 段 6：巫山烤鱼账号（test18565613635@test.com / 03165ead-…）历史 GoTrue 密码登录损坏，
   若段 1 显示 has_password=false 或登录报「Database error querying schema」，
   请改用 scripts/fix-1856-identity-final.sql 修复该账号的 auth.identities / 密码，再复测。 */
