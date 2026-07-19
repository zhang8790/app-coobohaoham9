-- ============================================================
-- fix-1856-deep.sql  — 1856 账号登录彻底修复（自包含、幂等）
-- 目标：让 18565613635 / 12345678 能正常密码登录小程序
-- 用法：整段粘贴到 Supabase SQL Editor 执行，最后看 Part 3 验证输出
-- ============================================================

-- 开启 pgcrypto（生成 bcrypt 密码用，Supabase 默认已装，这里保险）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Part 0：先完整诊断，看清 1856 现状 ----------
SELECT '=== 1856 auth.users 完整行 ===' AS step;
SELECT to_jsonb(u) AS user_1856
FROM auth.users u
WHERE u.id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

SELECT '=== 1856 auth.identities 完整行 ===' AS step;
SELECT to_jsonb(i) AS identity_1856
FROM auth.identities i
WHERE i.user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- ---------- Part 1：删除并重建 identity（精确对齐 1870） ----------
DELETE FROM auth.identities
WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

INSERT INTO auth.identities (
  id,
  user_id,
  provider,
  provider_id,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '03165ead-8fef-46c4-8f57-bc5a905ac716',
  'email',
  '03165ead-8fef-46c4-8f57-bc5a905ac716',  -- 必须是 user_id 本身（text）
  '{"sub":"03165ead-8fef-46c4-8f57-bc5a905ac716","email":"test18565613635@test.com","email_verified":true,"phone_verified":false}'::jsonb,
  now(),
  now(),
  now()
);

-- ---------- Part 2：密码兜底（若 encrypted_password 为空则重置为 12345678） ----------
-- 注意：confirmed_at / email_confirmed_at 在部分 Supabase 版本是「生成列」，不能手工 UPDATE
--       （生成列由 email/phone_confirmed_at 推导，GoTrue 读取不受影响），故此处一律不碰。
-- 只更新确定可写的字段：encrypted_password + raw_app_meta_data + 各 token 字段。
UPDATE auth.users
SET
  encrypted_password = crypt('12345678', gen_salt('bf')),
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change_token_current = '',
  reauthentication_token = ''
WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716'
  AND (encrypted_password IS NULL OR encrypted_password = '');

-- ---------- Part 3：验证（已修正类型比较，全部 cast 成 text） ----------
SELECT
  'identity 校验' AS check_name,
  i.provider,
  i.provider_id,
  (i.provider_id = i.user_id::text) AS provider_id_ok,
  i.identity_data->>'sub'   AS sub,
  i.identity_data->>'email' AS data_email
FROM auth.identities i
WHERE i.user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

SELECT
  'users 校验' AS check_name,
  u.email,
  (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_pwd,
  u.raw_app_meta_data->'providers' AS providers,
  u.email_confirmed_at IS NOT NULL AS email_confirmed
FROM auth.users u
WHERE u.id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- 期望结果：
-- identity 校验：1 行，provider=email，provider_id_ok=true，sub/data_email 正确
-- users 校验：has_pwd=true，providers=["email"]，email_confirmed=true
