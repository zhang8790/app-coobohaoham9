-- =============================================================
-- 20260917 修复「自营门店审核通过，却进不了管理后台」
-- -------------------------------------------------------------
-- 现象：小程序「我的 → 自营门店」显示「已通过」，点「前往管理后台」后
--       管理中心始终停在「自营门店已通过 / 正在为您准备门店数据」，
--       或直接提示「您尚未开通门店」，永远进不去。
--
-- 根因（代码级，两处硬伤叠加）：
--   1) 小程序端 adminApproveApplication 建店时写 store_type = 'self'，
--      而 stores_store_type_check 只允许 hub / transfer / truck / branch
--      （migrations/20260802_self_operated_unified_rbac.sql:13）
--      → INSERT 必然报 23514，门店建不出来；
--   2) 该函数（旧实现）先 update merchant_applications.status='approved'
--      再 INSERT stores，失败无法回滚 → 用户被永久卡在「已通过 + 无门店」；
--   3) merchant-center 解析商家身份只认 stores.owner_id / store_staff，
--      两者皆空 → getMerchantStore() 恒返回 null → 进不了管理后台。
--   代码已修（api.ts / admin-web api.ts 改为先建店后落状态 + store_type='branch'），
--   本迁移负责「存量数据止血 + 旧客户端兼容」。
--
-- 本迁移三件事，全部幂等可重复执行：
--   A. 放宽 store_type CHECK 容忍历史值 'self'（旧版客户端兼容阀）
--   B. 为「已通过但无门店」的申请补建门店（owner_id 指向申请人）
--   C. 把 owner_id 门店补登记 store_staff(role='owner')，统一身份来源
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴执行（或 supabase db query --linked）
-- =============================================================

-- ── A. store_type CHECK 容忍历史 'self' ────────────────────────
-- 新代码写 'branch'（普通门店，与 admin-web 表单 / admin-create-store EF 对齐），
-- 但已发布出去的旧版小程序仍会写 'self'，故 CHECK 放宽以免再次建店失败。
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.stores'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%store_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stores DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_type_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_store_type_check
  CHECK (store_type IS NULL OR store_type IN ('hub', 'transfer', 'truck', 'branch', 'self'));

-- ── B. 补建缺失门店（approved 申请但名下无门店）────────────────
-- 幂等三保险：① 该 user_id 名下已有门店则跳过；② 同名活跃门店已存在则跳过（防重复建店）；
--             ③ 顺带补 short_code（二维码 scene 参数用，generate_store_short_code 已存在）。
INSERT INTO public.stores
  (owner_id, name, phone, address, category, store_type, is_active, rating, short_code)
SELECT
  a.user_id,
  a.store_name,
  a.contact_phone,
  a.address,
  '其他',
  'branch',
  true,
  0,
  public.generate_store_short_code()
FROM public.merchant_applications a
WHERE a.status = 'approved'
  AND a.store_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.owner_id = a.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s2 WHERE s2.name = a.store_name
  );

-- ── C. owner_id → store_staff(role='owner') 身份统一 ────────────
-- 与 migrations/20260802_self_operated_unified_rbac.sql 第 3 步同源；
-- merchant-center / RLS 的 fn_my_store_ids 同时认 owner_id 与 store_staff，补全更稳。
INSERT INTO public.store_staff (store_id, user_id, role, is_active)
SELECT s.id, s.owner_id, 'owner', true
FROM public.stores s
WHERE s.owner_id IS NOT NULL
ON CONFLICT (store_id, user_id)
DO UPDATE SET role = EXCLUDED.role, is_active = true;

-- ── 诊断输出：核对「已通过申请 ↔ 门店」对应关系 ─────────────────
SELECT
  a.status                AS 申请状态,
  a.store_name            AS 申请门店名,
  a.contact_phone         AS 申请手机号,
  (SELECT count(*) FROM public.stores s WHERE s.owner_id = a.user_id) AS 名下门店数,
  (SELECT string_agg(s.name || '(' || coalesce(s.store_type,'NULL') || ',active=' || s.is_active || ')', ', ')
     FROM public.stores s WHERE s.owner_id = a.user_id)              AS 门店明细,
  (SELECT count(*) FROM public.store_staff t WHERE t.user_id = a.user_id AND t.is_active) AS 员工身份数
FROM public.merchant_applications a
ORDER BY a.created_at DESC;
