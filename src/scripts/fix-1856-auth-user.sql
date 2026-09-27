-- fix-1856-auth-user.sql
-- 1856 账号 auth.users 行损坏修复：只执行 UPDATE，INSERT 单独另跑
-- 用法：把这段完整粘贴到 Supabase 后台 SQL Editor 运行

UPDATE auth.users
SET
  raw_app_meta_data  = COALESCE(raw_app_meta_data, '{}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
  instance_id        = COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'),
  aud                = COALESCE(aud, 'authenticated'),
  role               = COALESCE(role, 'authenticated'),
  email              = COALESCE(email, 'test18565613635@test.com'),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
  encrypted_password = crypt('12345678', gen_salt('bf'))
WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- 成功后再单独跑这一段补 identity（email 列是 generated，不再手工写）
-- INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
-- SELECT gen_random_uuid(), u.id,
--        jsonb_build_object('sub', u.id::text, 'email', u.email, 'phone', u.phone),
--        'email', now(), now(), now()
-- FROM auth.users u
-- WHERE u.id = '03165ead-8fef-46c4-8f57-bc5a905ac716'
--   AND NOT EXISTS (
--     SELECT 1 FROM auth.identities i
--     WHERE i.user_id = u.id AND i.provider = 'email'
--   )
-- ON CONFLICT DO NOTHING;
