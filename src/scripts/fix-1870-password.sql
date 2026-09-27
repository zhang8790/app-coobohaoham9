-- fix-1870-password.sql
-- 用途：给 1870 微信注册用户补 email + 密码，使其可用【账号密码登录】测分佣（仅测试用）
-- 无需部署任何 Edge Function、无需配置 Secrets。在 Supabase Dashboard → SQL Editor 粘贴运行即可。
--
-- 1870 user_id = d6b38349-dded-4879-9eac-3165a646436a
-- 1856 user_id = 03165ead-8fef-46c4-8f57-bc5a905ac716（上级，分佣目标）

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) 给 1870 的 auth.users 补 email + 加密密码 + 确认状态
UPDATE auth.users
SET
  email               = 'test18701410500@test.com',
  encrypted_password  = crypt('12345678', gen_salt('bf')),
  email_confirmed_at  = now(),
  phone_confirmed_at  = now(),
  confirmation_token  = '',
  recovery_token      = '',
  raw_app_meta_data   = '{"provider":"email","providers":["email"]}'::jsonb,
  updated_at          = now()
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 2) 确保 1870 的 profiles.referrer_id 指向 1856（分佣链路必要）
UPDATE profiles
SET referrer_id = '03165ead-8fef-46c4-8f57-bc5a905ac716'
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a'
  AND (referrer_id IS DISTINCT FROM '03165ead-8fef-46c4-8f57-bc5a905ac716');

-- 3) 验证
SELECT
  u.id,
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_ok,
  u.encrypted_password IS NOT NULL AS pw_ok,
  p.referrer_id,
  p.referrer_id = '03165ead-8fef-46c4-8f57-bc5a905ac716' AS referrer_ok
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.id = 'd6b38349-dded-4879-9eac-3165a646436a';
