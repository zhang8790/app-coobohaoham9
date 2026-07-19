-- ============================================================
-- fix-1856-full-audit.sql  — 1856 登录故障「盲区全查」
-- 之前只查了 auth.users / auth.identities 的部分列，且已确认与正常账号 1870 一致。
-- 但登录仍报 "Database error querying schema"（GoTrue 读这行时某处失败）。
-- 本脚本一次性查清所有从没查过的盲区：重复行、关联表脏数据、完整行隐藏列、并模拟 GoTrue 查询。
-- 用法：整段粘贴 Supabase SQL Editor 执行，把每段的输出复制/截图发我。
-- ============================================================

-- ---------- Part A：重复行检查（GoTrue 查 email 时若返回 2+ 行会报 schema 错误） ----------
SELECT '=== A1: 重复 email 检查 (test18565613635@test.com) ===' AS step;
SELECT email, count(*) AS row_count
FROM auth.users
WHERE email = 'test18565613635@test.com'
GROUP BY email;

SELECT '=== A2: 重复 phone 检查 (+8618565613635) ===' AS step;
SELECT phone, count(*) AS row_count
FROM auth.users
WHERE phone = '+8618565613635'
GROUP BY phone;

-- ---------- Part B：1856 完整 users 行（所有列，含隐藏列） ----------
SELECT '=== B: 1856 完整 auth.users 行 ===' AS step;
SELECT to_jsonb(u) AS user_1856_full
FROM auth.users u
WHERE u.id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- ---------- Part C：1856 完整 identity 行（含 identity_data 全字段） ----------
SELECT '=== C: 1856 完整 auth.identities 行 ===' AS step;
SELECT to_jsonb(i) AS identity_1856_full
FROM auth.identities i
WHERE i.user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- ---------- Part D：关联表脏数据计数（GoTrue 登录时会读写这些表） ----------
SELECT '=== D1: refresh_tokens 计数 ===' AS step;
SELECT count(*) AS cnt FROM auth.refresh_tokens WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

SELECT '=== D2: sessions 计数 ===' AS step;
SELECT count(*) AS cnt FROM auth.sessions WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

SELECT '=== D3: mfa_factors 计数 ===' AS step;
SELECT count(*) AS cnt FROM auth.mfa_factors WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- ---------- Part E：精确模拟 GoTrue 的 UserByEmail 查询（看是否报错） ----------
-- 若这条在 SQL Editor 能正常返回 1 行，说明「数据层完全可读」，问题在 GoTrue 服务端（缓存/版本）
-- 若这条本身报错，报错信息会直接指出坏列
SELECT '=== E: 模拟 GoTrue UserByEmail 查询 ===' AS step;
SELECT
  id, aud, role, email, encrypted_password, confirmed_at, confirmation_token,
  recovery_token, email_change_token_current, email_change_token_new, email_change,
  phone, phone_change, phone_change_token, reauthentication_token,
  reauthentication_sent_at, email_confirmed_at, phone_confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
  banned_until, deleted_at, created_at, updated_at, instance_id
FROM auth.users
WHERE email = 'test18565613635@test.com';

-- ============================================================
-- Part F：清理语句（仅当 Part D 计数 > 0 时再单独执行，先看结果！）
-- 若 refresh_tokens / sessions 有脏数据，GoTrue 登录时会读写失败，清空即可。
-- DELETE FROM auth.refresh_tokens WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- DELETE FROM auth.sessions       WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- ============================================================
