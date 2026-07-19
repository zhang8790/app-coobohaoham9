-- ============================================================
-- fix-1856-diagnose.sql  — 纯诊断，零写入，零风险
-- 目的：把 1856 与正常账号 1870 逐列对比，找出登录失败的真正差异
-- 用法：整段粘贴到 Supabase SQL Editor 运行，把输出的【两行结果】原样复制发回
-- ============================================================

SELECT
  '1856' AS account,
  u.email,
  (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_pwd,
  (u.encrypted_password LIKE '$2%') AS pwd_is_bcrypt,
  u.aud,
  u.role,
  u.instance_id::text AS instance_id,
  u.raw_app_meta_data::text AS app_meta,
  u.banned_until IS NOT NULL AS is_banned,
  u.deleted_at IS NOT NULL AS is_deleted,
  u.is_super_admin,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.phone_confirmed_at IS NOT NULL AS phone_confirmed,
  (SELECT count(*) FROM auth.identities i WHERE i.user_id = u.id) AS ident_count,
  (SELECT string_agg(i.provider || ':' || i.provider_id, ' | ')
     FROM auth.identities i WHERE i.user_id = u.id) AS ident_detail
FROM auth.users u
WHERE u.id = '03165ead-8fef-46c4-8f57-bc5a905ac716'

UNION ALL

SELECT
  '1870' AS account,
  u.email,
  (u.encrypted_password IS NOT NULL AND u.encrypted_password <> '') AS has_pwd,
  (u.encrypted_password LIKE '$2%') AS pwd_is_bcrypt,
  u.aud,
  u.role,
  u.instance_id::text AS instance_id,
  u.raw_app_meta_data::text AS app_meta,
  u.banned_until IS NOT NULL AS is_banned,
  u.deleted_at IS NOT NULL AS is_deleted,
  u.is_super_admin,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.phone_confirmed_at IS NOT NULL AS phone_confirmed,
  (SELECT count(*) FROM auth.identities i WHERE i.user_id = u.id) AS ident_count,
  (SELECT string_agg(i.provider || ':' || i.provider_id, ' | ')
     FROM auth.identities i WHERE i.user_id = u.id) AS ident_detail
FROM auth.users u
WHERE u.id = 'd6b38349-dded-4879-9eac-3165a646436a';
