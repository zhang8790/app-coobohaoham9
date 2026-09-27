-- ============================================================
-- fix-1856-identity-final.sql
-- 彻底修复 1856 账号密码登录：精确对齐 1870 正常账号的 identity 格式
-- 根因：1856 的 auth.identities 缺失或 provider_id 格式错误，
--       导致 GoTrue 登录时读 identity 抛 "Database error querying schema"
-- 用法：整段粘贴到 Supabase SQL Editor 运行
-- ============================================================

-- 1) 删除 1856 现有 identity（无论好坏，一律重建，保证幂等）
DELETE FROM auth.identities
WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- 2) 按 1870 正常格式重建
--    关键：provider_id 必须是 user_id（不是字符串 'email'）
--    不写 email 列（若该列是生成列会自动填充；非生成列则留空，identity_data.email 兜底）
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
  '03165ead-8fef-46c4-8f57-bc5a905ac716',  -- ← 必须是 user_id，不是 'email'
  '{"sub":"03165ead-8fef-46c4-8f57-bc5a905ac716","email":"test18565613635@test.com","email_verified":true,"phone_verified":false}'::jsonb,
  now(),
  now(),
  now()
);

-- 3) 验证：确认 1856 的 identity 已就绪且格式正确
SELECT
  provider,
  provider_id,
  identity_data->>'sub'   AS sub,
  identity_data->>'email' AS data_email
FROM auth.identities
WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望输出 1 行：
--   provider = email
--   provider_id = 03165ead-8fef-46c4-8f57-bc5a905ac716
--   sub = 03165ead-8fef-46c4-8f57-bc5a905ac716
--   data_email = test18565613635@test.com

-- 4) 顺手确认 users 行状态（应已正常）
SELECT
  id,
  email,
  encrypted_password IS NOT NULL AS has_pwd,
  raw_app_meta_data->'providers' AS providers
FROM auth.users
WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望：has_pwd = true，providers = ["email"]
