-- 诊断 1870 (18701410500) 的 auth 登录能力，判断能否走「账号密码登录」
-- 在 Supabase SQL Editor 执行，看 Messages 面板的 NOTICE

DO $$
DECLARE
  v_id uuid; v_email text; v_phone text;
  v_has_pw boolean; v_confirmed timestamptz; v_provider text;
BEGIN
  SELECT id, email, phone,
         (encrypted_password IS NOT NULL AND encrypted_password <> ''),
         email_confirmed_at
    INTO v_id, v_email, v_phone, v_has_pw, v_confirmed
  FROM auth.users
  WHERE phone = '+8618701410500'
     OR raw_app_meta_data->>'phone' = '18701410500'
  LIMIT 1;

  RAISE NOTICE '===== 1870 账号诊断 =====';
  RAISE NOTICE 'auth.users.id            = %', v_id;
  RAISE NOTICE 'email                    = %', v_email;
  RAISE NOTICE 'phone                    = %', v_phone;
  RAISE NOTICE '是否有密码(encrypted_pw) = %', v_has_pw;
  RAISE NOTICE 'email_confirmed_at       = %', v_confirmed;

  IF v_id IS NULL THEN
    RAISE NOTICE '⚠️ 未找到 1870 的 auth.users 记录';
    RETURN;
  END IF;

  SELECT provider INTO v_provider
  FROM auth.identities WHERE user_id = v_id LIMIT 1;
  RAISE NOTICE '登录方式(provider)       = %', v_provider;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE NOTICE '⚠️ email 为空 → GoTrue 密码登录按 email 查，无法匹配 → 必须先补 email';
  END IF;
  IF NOT v_has_pw THEN
    RAISE NOTICE '⚠️ 无密码 → 密码登录必报 Invalid login credentials';
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE NOTICE '⚠️ email 未确认 → 即便有密码也会被挡(需确认或开发环境关闭确认)';
  END IF;

  IF v_email IS NOT NULL AND v_email <> '' AND v_has_pw AND v_confirmed IS NOT NULL THEN
    RAISE NOTICE '✅ 该账号具备密码登录条件（但仍受前端 signInWithUsername 生产分支限制，需改代码放行）';
  END IF;
END $$;

-- 查看 1870 的 identities（实际登录方式）
SELECT id, user_id, provider, provider_id,
       identity_data->>'email'  AS id_email,
       identity_data->>'phone'  AS id_phone
FROM auth.identities
WHERE user_id = (
  SELECT id FROM auth.users
  WHERE phone = '+8618701410500'
     OR raw_app_meta_data->>'phone' = '18701410500'
  LIMIT 1
);
