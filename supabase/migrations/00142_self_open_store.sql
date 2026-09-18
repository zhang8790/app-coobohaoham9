-- =============================================================
-- 00142 「审核通过 → 开通店铺」缺环补全 + user_role 补 merchant 值
-- -------------------------------------------------------------
-- 背景（2026-09-18 线上实测，anon 探针 + Dashboard 查询确认）：
--   两个账号：
--     18701410500（乐悠悠）→ merchant_applications: status=approved, store_name=张林水果店
--     18565613635（凌云一笑）→ merchant_applications: status=approved, store_name=巫山烤鱼
--   但 stores 里没有以他们为 owner_id 的门店（linked_store_name = NULL）→ 进不去管理后台。
--
-- 根因（历史审核实现缺陷，两点叠加）：
--   1) 旧实现「先置 status='approved'，再 insert stores」→ 建店失败也无法回滚；
--   2) 建店时写 store_type='self'，而 stores_store_type_check 只允许
--      hub/transfer/truck/branch（迁移 20260802）→ 必然 23514 → 永久孤儿态。
--   新实现（src/db/api.ts adminApproveApplication / admin-web approveApplication）
--   已改为「先建店、后置状态」，但**存量孤儿无法自愈**：客户端没有建店权限
--   （stores 的写策略只放给 owner_id = auth.uid() 或 admin）。
--
-- 本迁移做两件事（全部幂等、纯加法）：
--   A. user_role 枚举补 'merchant'（线上只有 ('user','admin')，导致多处
--      profiles.role='merchant' 的写入报 22P02 被静默吞掉；读取侧有
--      merchant_status 兜底所以只表现为「已有自营门店身份」徽章永不显示）。
--   B. fn_self_open_store()：申请人按自己「已通过」的申请一键物化门店并绑定 owner
--      → 管理中心「店铺待开通」页点一下即进入后台，不再需要跑 SQL / 等总部。
--      同名无主店优先认领，否则新建；写 store_staff(owner)；对齐 merchant_status。幂等。
--
-- 安全边界：
--   fn_open_store_for_user(uuid) 是内部实现（可为**任意** uid 开店），已显式
--   REVOKE 掉 PUBLIC / anon / authenticated，只留 service_role 与 postgres（SQL Editor）；
--   对外只暴露 fn_self_open_store()，它写死 auth.uid()，任何登录用户只能给自己开店。
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴执行
-- =============================================================

-- ── A. user_role 补 'merchant' ──────────────────────────────────
-- 注意：Postgres 限制「同一事务内不能使用新加入的枚举值」。
-- 本迁移后续语句**不使用**该值（只写 merchant_status，其枚举已含 approved），故安全。
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'merchant';

-- ── B1. 内部实现：把 p_uid 的「已通过无门店」申请物化成门店 ──────
CREATE OR REPLACE FUNCTION public.fn_open_store_for_user(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exist    uuid;
  v_app      public.merchant_applications%ROWTYPE;
  v_store_id uuid;
  v_adopted  boolean := false;
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_target_user');
  END IF;

  -- 幂等：本人已有归属门店 → 只补齐 store_staff(owner) 后直接返回
  SELECT id INTO v_exist
    FROM public.stores
   WHERE owner_id = p_uid
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_exist IS NOT NULL THEN
    INSERT INTO public.store_staff (store_id, user_id, role, is_active)
    VALUES (v_exist, p_uid, 'owner', true)
    ON CONFLICT (store_id, user_id)
    DO UPDATE SET role = 'owner', is_active = true;
    RETURN jsonb_build_object('ok', true, 'already', true, 'store_id', v_exist);
  END IF;

  -- 取最新一条「已通过」的申请（未通过则不予开通，守住闸门）
  SELECT * INTO v_app
    FROM public.merchant_applications
   WHERE user_id = p_uid
     AND status = 'approved'
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_approved_application');
  END IF;

  -- 优先认领「同名且无主」的门店（总后台可能已手工建好、只是没绑店长）
  -- 安全边界：仅 owner_id IS NULL 时才认领，绝不抢夺已有店长。
  IF v_app.store_name IS NOT NULL AND btrim(v_app.store_name) <> '' THEN
    SELECT id INTO v_store_id
      FROM public.stores
     WHERE name = v_app.store_name
       AND owner_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_store_id IS NOT NULL THEN
      UPDATE public.stores SET owner_id = p_uid
       WHERE id = v_store_id AND owner_id IS NULL;
      v_adopted := FOUND;
      IF NOT v_adopted THEN
        v_store_id := NULL;   -- 竞态下被别人先认领 → 走新建
      END IF;
    END IF;
  END IF;

  -- 否则新建。store_type 合法值仅 branch/hub/transfer/truck；「自营」靠 is_platform 标识。
  IF v_store_id IS NULL THEN
    INSERT INTO public.stores (
      owner_id, name, description, phone, address, category,
      store_type, is_active, is_platform, rating
    ) VALUES (
      p_uid,
      COALESCE(NULLIF(btrim(v_app.store_name), ''), '我的门店'),
      v_app.description,
      v_app.contact_phone,
      v_app.address,
      COALESCE(NULLIF(btrim(v_app.business_type), ''), '综合'),
      'branch', true, false, 0
    )
    RETURNING id INTO v_store_id;
  END IF;

  -- 运营成员行（owner）——统一身份来源，让 fn_my_store_ids 也能取到本店
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, p_uid, 'owner', true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = 'owner', is_active = true;

  -- 画像状态对齐（merchant_status 的枚举已含 approved，不触碰 role，见 A 的事务限制说明）
  UPDATE public.profiles SET merchant_status = 'approved' WHERE id = p_uid;

  -- 短码 / 条码前缀兜底：正常由列默认值与 trg_store_barcode_prefix 触发器处理，
  -- 这里仅在缺失时补一次（相关对象不存在则跳过，绝不影响开店主流程）。
  IF to_regproc('generate_store_short_code') IS NOT NULL THEN
    UPDATE public.stores SET short_code = public.generate_store_short_code()
     WHERE id = v_store_id AND short_code IS NULL;
  END IF;

  IF to_regclass('public.seq_store_barcode_prefix') IS NOT NULL THEN
    UPDATE public.stores
       SET barcode_prefix = lpad(nextval('public.seq_store_barcode_prefix')::text, 6, '0')
     WHERE id = v_store_id AND barcode_prefix IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', v_store_id,
    'store_name', (SELECT name FROM public.stores WHERE id = v_store_id),
    'adopted', v_adopted,
    'created', NOT v_adopted
  );
END;
$$;

COMMENT ON FUNCTION public.fn_open_store_for_user(uuid)
  IS '按指定 uid 的「已通过」开店申请物化门店并绑定 owner（内部实现，不可由 anon/authenticated 调用）';

-- 越权收口：Postgres 默认给 PUBLIC 授予 EXECUTE，Supabase 还给 anon/authenticated
-- 单独授过权，两处都必须显式收回，否则匿名用户可替任意 uid 开店。
REVOKE ALL ON FUNCTION public.fn_open_store_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_open_store_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_open_store_for_user(uuid) FROM authenticated;

-- ── B2. 对外 RPC：申请人自助开通（写死 auth.uid()，只能给自己开）──
CREATE OR REPLACE FUNCTION public.fn_self_open_store()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  RETURN public.fn_open_store_for_user(v_uid);
END;
$$;

COMMENT ON FUNCTION public.fn_self_open_store()
  IS '申请人自助开通店铺：按本人「已通过」的开店申请建店/认领同名无主店并绑定 owner。幂等。';

GRANT EXECUTE ON FUNCTION public.fn_self_open_store() TO authenticated;

-- ── C. 诊断输出 ────────────────────────────────────────────────
-- 关注「已通过但无门店」这一列：它 > 0 就是仍待修复的历史孤儿数量。
SELECT
  (SELECT count(*) FROM public.stores)                                            AS 门店总数,
  (SELECT count(*) FROM public.store_staff WHERE is_active)                       AS 活跃运营成员数,
  (SELECT count(*) FROM public.merchant_applications WHERE status = 'approved')   AS 已通过申请数,
  (SELECT count(*)
     FROM public.merchant_applications a
    WHERE a.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = a.user_id)
  )                                                                               AS 已通过但无门店;

SELECT '00142 审核通过→开通店铺缺环补全 已完成' AS result;
