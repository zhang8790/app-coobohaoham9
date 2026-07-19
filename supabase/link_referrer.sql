-- ============================================================
-- 仅做「绑定上级关系」：把 18701410500 的 referrer_id 指向 18565613635
-- 前提：两个账号都已存在（不存在先按下方注释注册 / 或跑 setup_referrer.js）
-- 前置：若报 "column referrer_id does not exist"，先跑 fix-referrer-id.sql
-- 在 Supabase → SQL Editor 执行（service_role 上下文）
-- ============================================================

UPDATE public.profiles
SET referrer_id = (SELECT id FROM public.profiles WHERE phone = '18565613635' LIMIT 1)
WHERE phone = '18701410500'
  AND referrer_id IS DISTINCT FROM (SELECT id FROM public.profiles WHERE phone = '18565613635' LIMIT 1);

-- 校验结果
SELECT
  sub.phone                                             AS 下级手机号,
  sup.phone                                             AS 上级手机号,
  sup.referral_code                                     AS 上级推广码,
  (sup.referrer_id IS NOT NULL)                         AS 上级自身也有上级
FROM public.profiles sub
LEFT JOIN public.profiles sup ON sup.id = sub.referrer_id
WHERE sub.phone = '18701410500';
