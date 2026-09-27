/* 诊断：定位手机号 13526245633 对应的账号到底存在哪里
 * 在 Supabase Dashboard -> SQL Editor 整段执行，看哪一段（src 列）返回了行。
 * 哪一段有行，就说明该号的落点在那里。
 */
SELECT 'auth.users' AS src,
       id::text      AS user_id,
       phone         AS phone_or_contact,
       email         AS label1,
       created_at::text AS label2
FROM auth.users
WHERE phone IN ('13526245633', '+8613526245633', '8613526245633')
   OR phone LIKE '%13526245633%'

UNION ALL

SELECT 'profiles',
       id::text,
       phone,
       nickname,
       role::text
FROM public.profiles
WHERE phone IN ('13526245633', '+8613526245633', '8613526245633')
   OR phone LIKE '%13526245633%'

UNION ALL

SELECT 'merchant_applications',
       user_id::text,
       contact_phone,
       store_name,
       status::text
FROM public.merchant_applications
WHERE contact_phone IN ('13526245633', '+8613526245633', '8613526245633')
   OR contact_phone LIKE '%13526245633%';
