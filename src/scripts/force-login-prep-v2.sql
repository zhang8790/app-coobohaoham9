-- ============================================================
-- force-login-prep-v2.sql
-- 1856 硬登陆前置：彻底删除损坏的 auth 行 + 解除所有外键引用
--
-- v1 报错 23503：DELETE auth.users 被 profiles.id→auth.users.id 外键(RESTRICT) 挡住。
-- v2 补上 profiles 行删除，并自动发现所有引用 auth.users 的外键列逐一解除。
-- 注意：information_schema.referential_constraints 没有 unique_constraint_table_name 列，
--       需用 unique_constraint_name JOIN table_constraints 取被引用表名。
--
-- 幂等：所有 DELETE/UPDATE 对不存在的行都安全；备份表用 IF NOT EXISTS。
-- 跑完后调用 force-login Edge Function 用同 id 重建干净账号。
-- ============================================================

-- Step 0：备份 1856 的 profiles 全量（balance/referral_code/nickname 等）
CREATE TABLE IF NOT EXISTS _tmp_profile_backup AS
SELECT * FROM profiles WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 1：备份 1870 等下级 profiles.referrer_id（防止被清空后丢上级绑定）
CREATE TABLE IF NOT EXISTS _tmp_referrer_backup AS
SELECT id, referrer_id FROM profiles WHERE referrer_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 2：自动解除所有 public 业务表引用 auth.users 的外键（设为 NULL）
-- 排除 profiles（其 id 外键是 PK，不能设 NULL，改由 Step 4 删行处理）
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.table_constraints utc
      ON rc.unique_constraint_schema = utc.constraint_schema
      AND rc.unique_constraint_name = utc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND utc.table_schema = 'auth'
      AND utc.table_name = 'users'
      AND tc.table_schema = 'public'
      AND tc.table_name <> 'profiles'
  LOOP
    EXECUTE format(
      'UPDATE %I SET %I = NULL WHERE %I = %L',
      r.table_name, r.column_name, r.column_name,
      '03165ead-8fef-46c4-8f57-bc5a905ac716'
    );
  END LOOP;
END $$;

-- Step 3：清理 profiles 自引用（下级指向 1856 的 referrer_id 先清空）
UPDATE profiles SET referrer_id = NULL
WHERE referrer_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 4：删除 1856 的 profiles 行（其 id 引用 auth.users，必须先删才能删 user）
DELETE FROM profiles WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 5：删除 1856 的所有 auth 子表（顺序无所谓，幂等）
DELETE FROM auth.refresh_tokens WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.sessions       WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.mfa_factors    WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
DELETE FROM auth.identities     WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 6：现在可以删 auth.users 了（profiles 已先删，外键不再阻挡）
DELETE FROM auth.users WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';

-- Step 7：确认删除成功
SELECT 'users_remaining' AS step, count(*) AS cnt
FROM auth.users WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望：0 行

SELECT 'identities_remaining' AS step, count(*) AS cnt
FROM auth.identities WHERE user_id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望：0 行

SELECT 'profiles_remaining' AS step, count(*) AS cnt
FROM profiles WHERE id = '03165ead-8fef-46c4-8f57-bc5a905ac716';
-- 期望：0 行（v1 漏了这步导致 23503）

-- ──────────────────────────────────────────────────
-- 跑完上面后，再调用 force-login Edge Function：
--   supabase.functions.invoke('force-login', { body: { user_id: '03165ead...' } })
-- 它用 admin.createUser({ id: '03165ead...' }) 重建干净账号，
-- 触发器自动建 profiles，函数再从 _tmp_profile_backup / _tmp_referrer_backup
-- 恢复 balance / referral_code / 1870 的 referrer_id。
-- ──────────────────────────────────────────────────
