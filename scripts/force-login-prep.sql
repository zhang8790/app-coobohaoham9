-- ============================================================
-- force-login-prep.sql
-- 1856 硬登陆前置：手动删除损坏的 auth 行（保 profiles + 保护外键）
-- 如果 Edge Function 的 admin.deleteUser 也报错，用户需先跑此脚本
-- 跑完后，再调用 force-login Edge Function 建干净账号（同 id）
-- ============================================================

-- Step 0：备份 1870 的 referrer_id（外键可能 ON DELETE SET NULL）
CREATE TABLE IF NOT EXISTS _tmp_referrer_backup AS
SELECT id, referrer_id FROM profiles WHERE referrer_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- 确认备份行数
SELECT 'referrers_to_restore' AS step, count(*) AS cnt FROM _tmp_referrer_backup;
-- 期望：1 行（1870 的 profiles.referrer_id 指向 1856）

-- Step 1：临时解除外键依赖（把指向 1856 的 referrer_id 暂时清空，避免 ON DELETE 级联）
UPDATE profiles SET referrer_id = NULL
WHERE referrer_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 2：删除 1856 的所有 auth 数据（顺序：tokens → sessions → identities → users）
DELETE FROM auth.refresh_tokens WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.sessions       WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.mfa_factors    WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.identities     WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.users          WHERE id      = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 3：确认删除成功
SELECT 'users_remaining' AS step, count(*) AS cnt FROM auth.users WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望：0 行

-- Step 4：确认 profiles 行还在（没被级联删）
SELECT 'profiles_remaining' AS step, id, nickname, balance, referral_code, referrer_id
FROM profiles WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望：1 行，referrer_id = null（Step 1 清空了）

-- ──────────────────────────────────────────────────
-- ⚠️ 跑完此脚本后，再调用 force-login Edge Function：
--   supabase.functions.invoke('force-login', { body: { user_id: '03165ead...' } })
--   该函数会用 admin.createUser({ id: '03165ead...' }) 重建干净账号，
--   并自动恢复 referrer_id（从 _tmp_referrer_backup 表）。
--
-- 如果不想用 Edge Function，也可以在此脚本末尾手工 INSERT：
-- ──────────────────────────────────────────────────
-- （不用 Edge Function 的纯 SQL 路径：可能导致 GoTrue 仍报 schema 错误）
-- INSERT INTO auth.users (
--   id, instance_id, aud, role, email, encrypted_password,
--   confirmed_at, email_confirmed_at, phone_confirmed_at,
--   raw_app_meta_data, raw_user_meta_data,
--   phone, created_at, updated_at
-- ) VALUES (
--   '03165ead-8fef-46c4-8f57-bc5a905ac716',
--   '00000000-0000-0000-0000-000000000000',
--   'authenticated', 'authenticated',
--   'test18565613635@test.com',
--   crypt('12345678', gen_salt('bf')),
--   now(), now(), now(),
--   '{"provider":"email","providers":["email"]}'::jsonb,
--   '{"phone":"18565613635","nickname":"18565613635","email_verified":true}'::jsonb,
--   '+8618565613635',
--   now(), now()
-- );
-- INSERT INTO auth.identities (...) ...;
-- （但纯 SQL 建的行，GoTrue 可能还是不认 → 优先走 Edge Function）
