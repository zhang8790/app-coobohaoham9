-- =====================================================================
-- 商家网页版登录 P0 · 批量回填 auth.users.phone（存量微信/OTP 商家）
-- ---------------------------------------------------------------------
-- 根因（见 account-lifecycle-audit.md / account-password-fix-runbook.md）：
--   存量「微信一键登录 / 手机号+验证码」创建的商家，auth.users.phone = NULL
--   且无密码；网页版 OTP 登录要求 auth.users.phone 已写。其真实手机号只在
--   merchant_applications.contact_phone（旧的 backfill-merchant-phone-identity.sql
--   依据 profiles.phone，对这批人 no-op；且该文件实际并不存在）。
--
-- 本脚本：把「已审核通过(status='approved') 且 auth.users.phone 为空」的商家，
--   用其最新 approved 申请的 contact_phone 归一成 E.164，回填：
--     auth.users.phone + phone_confirmed_at  → 开启网页版「验证码登录(OTP)」
--     profiles.phone                          → 对齐，供后台按手机号检索
--   不设密码、不写 user_login_identities（P0 只需 OTP 可登；密码登录另行走
--   admin-update-user-identity EF 或商家自助，见 runbook 方案 B）。
--
-- 运行方式：Supabase Dashboard → SQL Editor，以 postgres 角色，按 ①→②③→④ 顺序执行。
-- 幂等：仅处理空值（u.phone IS NULL / p.phone 空），可重复执行不覆盖已有值。
-- 前置：Phone Provider 已启用且配置短信（否则 OTP 发不出，见 runbook 第二节）。
-- =====================================================================


-- ① 预览：将回填哪些账号（先单独跑这段，确认范围无误再执行 ②③）────────────
WITH target AS (
  SELECT DISTINCT ON (a.user_id)
         a.user_id                          AS uid,
         a.contact_phone                    AS raw_phone,
         public.fn_normalize_phone(a.contact_phone) AS norm
  FROM public.merchant_applications a
  JOIN auth.users u ON u.id = a.user_id
  WHERE a.status = 'approved'
    AND u.phone IS NULL
  ORDER BY a.user_id, a.created_at DESC
)
SELECT t.uid,
       p.nickname,
       t.raw_phone,
       t.norm,
       CASE WHEN t.norm ~ '^1[3-9][0-9]{9}$' THEN '+86' || t.norm ELSE NULL END AS e164_will_write
FROM target t
JOIN public.profiles p ON p.id = t.uid
ORDER BY p.nickname;
-- 预期：e164_will_write 非空的行 = 将被回填；为空的行 = contact_phone 非大陆手机号（跳过，见 ④）


-- ② 回填 auth.users.phone（E.164 + 确认态，OTP 免再确认）──────────────────
--    说明：contact_phone 在审核通过时已人工核验，直接置 phone_confirmed_at 合理。
BEGIN;

WITH target AS (
  SELECT DISTINCT ON (a.user_id)
         a.user_id                                       AS uid,
         public.fn_normalize_phone(a.contact_phone)      AS norm
  FROM public.merchant_applications a
  JOIN auth.users u ON u.id = a.user_id
  WHERE a.status = 'approved'
    AND u.phone IS NULL
  ORDER BY a.user_id, a.created_at DESC
),
e164 AS (
  SELECT uid,
         CASE WHEN norm ~ '^1[3-9][0-9]{9}$' THEN '+86' || norm ELSE NULL END AS phone
  FROM target
)
UPDATE auth.users u
SET phone             = e.phone,
    phone_confirmed_at = COALESCE(u.phone_confirmed_at, now()),
    updated_at        = now()
FROM e164 e
WHERE u.id = e.uid
  AND e.phone IS NOT NULL
  AND u.phone IS NULL
RETURNING u.id, u.phone AS auth_phone_written;

COMMIT;


-- ③ 对齐 profiles.phone（profiles 无 updated_at 列，只写 phone；不受 ② 影响，独立取数）──
BEGIN;

WITH e164 AS (
  SELECT DISTINCT ON (a.user_id)
         a.user_id                                  AS uid,
         CASE WHEN public.fn_normalize_phone(a.contact_phone) ~ '^1[3-9][0-9]{9}$'
              THEN '+86' || public.fn_normalize_phone(a.contact_phone)
              ELSE NULL END                         AS phone
  FROM public.merchant_applications a
  WHERE a.status = 'approved'
  ORDER BY a.user_id, a.created_at DESC
)
UPDATE public.profiles p
SET phone = e.phone
FROM e164 e
WHERE p.id = e.uid
  AND e.phone IS NOT NULL
  AND (p.phone IS NULL OR btrim(p.phone) = '')
RETURNING p.id, p.phone AS profile_phone_written;

COMMIT;


-- ④ 核对：approved 但 auth.users.phone 仍为空的剩余（正常应为 0，或仅非大陆号边角）──
SELECT a.user_id,
       p.nickname,
       a.contact_phone AS raw_phone,
       public.fn_normalize_phone(a.contact_phone) AS norm,
       '非大陆手机号或无法归一，需人工处理' AS note
FROM public.merchant_applications a
JOIN auth.users u ON u.id = a.user_id
JOIN public.profiles p ON p.id = a.user_id
WHERE a.status = 'approved'
  AND u.phone IS NULL
ORDER BY p.nickname;
