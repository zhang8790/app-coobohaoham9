-- 00111 模糊诊断：把 1856 的真实手机号/账号捞出来（不要求精确匹配）
-- 用途：确认 profiles / auth.users 里 1856 实际存的是什么，避免按完整号查不到。
-- 在 Supabase SQL Editor 运行，看 Results 面板。

-- 1) profiles 里所有手机号含 "1856" 的行
SELECT id, phone, email, referral_code, referrer_id, created_at
FROM profiles
WHERE phone LIKE '%1856%'
   OR phone LIKE '%8565613635%'
   OR phone LIKE '%5613635%'
ORDER BY created_at DESC;

-- 2) auth.users 里所有手机号含 "1856" 的行
SELECT id, phone, email, created_at, last_sign_in_at
FROM auth.users
WHERE phone LIKE '%1856%'
   OR phone LIKE '%8565613635%'
   OR email ILIKE '%1856%'
ORDER BY created_at DESC;

-- 3) 1870 现在的绑定关系（它的 referrer_id 指向谁？）
SELECT id, phone, referrer_id
FROM profiles
WHERE phone = '18701410500'
   OR id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 4) 1870.referrer_id 指向的那个上级，在 profiles 里是否存在、手机号是什么
SELECT p.id, p.phone, p.email,
       (SELECT EXISTS(SELECT 1 FROM profiles WHERE id = pr.referrer_id)) AS referrer_exists,
       pr.referrer_id
FROM profiles pr
LEFT JOIN profiles p ON p.id = pr.referrer_id
WHERE pr.phone = '18701410500'
   OR pr.id = 'd6b38349-dded-4879-9eac-3165a646436a';
