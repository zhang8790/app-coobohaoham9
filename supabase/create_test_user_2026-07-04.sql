-- ========================================
-- 注册/修复测试账号（2026-07-04）
-- 错误信息："Invalid login credentials"
-- 原因：Supabase Auth 系统中没有这个邮箱的用户
-- ========================================

-- 执行方式：在 Supabase Dashboard > SQL Editor 中执行
-- 项目 URL: https://supabase.com/dashboard/project/pyqgsxcjmijtbstwthbn

-- =====================
-- 方法 1：通过 auth.users 表直接插入（需要 service_role key）
-- =====================

-- 检查测试用户是否存在
SELECT id, email, raw_user_meta_data, created_at
FROM auth.users
WHERE email = 'test18701410500@test.com'
   OR email = 'test18710410500@test.com';

-- 如果不存在，需要通过以下方式之一创建：
-- A. 使用 Supabase Dashboard > Authentication > Users > Add user（推荐）
-- B. 通过 API 创建（见下方 curl 命令）
-- C. 直接在 SQL Editor 执行 INSERT（需要 service_role key）

-- =====================
-- 方法 2：使用 Supabase Dashboard UI 创建（最简单，推荐！）
-- =====================

/*
步骤：
1. 打开 https://supabase.com/dashboard/project/pyqgsxcjmijtbstwthbn/auth/users
2. 点击 "Add user" 按钮
3. 填写信息：
   - Email: test18701410500@test.com
   - Password: 12345678
   - Auto Confirm User: ✅ 勾选（自动验证邮箱）
4. 点击 "Create user"
5. 返回小程序，重新登录
*/

-- =====================
-- 方法 3：通过 SQL 插入（如果你有 service_role key 权限）
-- =====================

-- 注意：这需要在 Supabase SQL Editor 中以 service_role 身份执行
-- 或者通过 Dashboard 的 "Run as service_role" 选项

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  last_sign_in_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'test18701410500@test.com',
  crypt('12345678', gen_salt('bf')),
  now(),
  '{"phone": "+8618701410500", "nickname": "测试用户"}',
  now(),
  now(),
  '',
  '',
  '',
  '',
  null
)
ON CONFLICT (id) DO NOTHING;

-- 同时确保 profiles 表也有对应的记录
INSERT INTO profiles (id, phone, nickname, gold_beans, total_consumption, team_performance, invite_code)
SELECT
  id,
  '+8618701410500',
  '测试用户',
  100,  -- 初始金豆 100
  0,
  0,
  'LDYX001'  -- 邀请码
FROM auth.users
WHERE email = 'test18701410500@test.com'
AND NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.users.id);

-- =====================
-- 验证结果
-- =====================

-- 查看是否创建成功
SELECT u.id, u.email, u.email_confirmed_at, p.phone, p.nickname, p.gold_beans
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email = 'test18701410500@test.com';
