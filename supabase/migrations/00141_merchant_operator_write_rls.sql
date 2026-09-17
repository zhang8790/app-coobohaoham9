-- =============================================================
-- 00141 商家「运营身份」写权限对齐（修复：店铺设置填了保存不了）
-- -------------------------------------------------------------
-- 现象（用户实测 2026-09-17）：
--   「自营门店管理中心 → 店铺设置」可正常打开、可填地址、点保存提示成功，
--   但返回后地址仍是「待补充」，改任何字段都不落库。
--
-- 根因（系统性 RLS 缺口，非单点 bug）：
--   20260802 引入「运营身份」store_staff 后，fn_my_store_ids() 被升级为
--   「owner_id 门店 ∪ store_staff 活跃成员门店」，但**只有部分表**把策略切到了它：
--      已切：orders / order_items / marketing_campaigns / coupons / vehicles /
--            vehicle_transfers / store_staff / store_invites / emotion_funnel_events
--      漏切：stores / products / store_categories / merchant_settlements
--    漏切的这几张表仍写死 `EXISTS (SELECT 1 FROM stores WHERE ... owner_id = auth.uid())`。
--   而线上 4 家门店 owner_id **全部为 NULL**（总后台建店未回填店长），
--   于是：任何账号对这些表的写 = RLS 过滤掉全部行 = PostgREST 返回 204/200 且
--   **不带 error** → 前端 supabase-js 的 error 为 null → updateStore() 返回 true
--   → 弹「保存成功」→ 实际 0 行落库。**假成功**，用户端表现为「保存不了」。
--
-- 本迁移做六件事，全部幂等、全部为加法（不删除既有策略，避免误伤 admin/owner）：
--   1. 新增 is_store_manager(uuid) 助手（owner / manager，SECURITY DEFINER 断链）
--   2. stores：补「运营者 UPDATE」策略
--   3. products：补「运营者写入」策略
--   4. store_categories：补「运营者管理店内分类」策略（不碰 scope='global'）
--   5. merchant_settlements：补「运营者读取本店结算台账」策略
--   6. 修正两个函数：fn_merchant_product_sales / get_store_locked_members
--      二者内部写死 owner_id，导致运营者看到「商品零销量 / 会员 0 人」
--   另：redeem_store_invite 升级为 v2（兑 owner 邀请码时回填 owner_id，彻底统一身份）
--       + 新增 claim_store_ownership() 自助认领 RPC（免跑 SQL）
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴执行
-- =============================================================

-- ── 0. 确保 fn_my_store_ids 是最新版（owner ∪ store_staff）────────
-- 若线上从未部署 20260802，这里的 CREATE OR REPLACE 会顺手补齐，避免后续策略失效。
CREATE OR REPLACE FUNCTION public.fn_my_store_ids(p_uid uuid)
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM (
    SELECT id FROM public.stores WHERE owner_id = p_uid
    UNION
    SELECT store_id FROM public.store_staff WHERE user_id = p_uid AND is_active
  ) t
$$;
GRANT EXECUTE ON FUNCTION public.fn_my_store_ids(uuid) TO authenticated;

-- ── 1. 门店管理助手：仅 owner / manager 可改店 ──────────────────
-- 与 20260802 的 is_store_operator 的区别：那个把 staff/cashier 也算运营者，
-- 用于「读」；本函数用于「改门店主体信息」，收紧到 owner/manager。
CREATE OR REPLACE FUNCTION public.is_store_manager(p_store_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = p_store_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM public.store_staff
     WHERE store_id = p_store_id AND user_id = auth.uid() AND is_active
       AND role IN ('owner', 'manager')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_store_manager(uuid) TO authenticated;

-- ── 2. stores：运营者 UPDATE 策略 ───────────────────────────────
-- 原策略：owner_manage_store / rls81_stores_owner（owner_id = auth.uid() OR is_admin）
-- 新增一条**宽松（permissive）**策略即可，Postgres 对多条 permissive 策略取 OR，
-- 因此无需 DROP 既有策略 → admin 与 owner 行为完全不变。
DROP POLICY IF EXISTS rls_operator_update_stores ON public.stores;
CREATE POLICY rls_operator_update_stores ON public.stores
  FOR UPDATE TO authenticated
  USING (public.is_store_manager(id) OR public.is_admin())
  WITH CHECK (public.is_store_manager(id) OR public.is_admin());

-- ── 3. products：运营者写入策略 ─────────────────────────────────
DROP POLICY IF EXISTS rls_operator_write_products ON public.products;
CREATE POLICY rls_operator_write_products ON public.products
  FOR ALL TO authenticated
  USING (public.is_store_operator(products.store_id) OR public.is_admin())
  WITH CHECK (public.is_store_operator(products.store_id) OR public.is_admin());

-- ── 4. store_categories：运营者管理「店内分类」─────────────────
-- 严格限定 scope='store' 且 store_id 非空 → 商家永远改不到平台全局分类。
DROP POLICY IF EXISTS rls_operator_write_store_categories ON public.store_categories;
CREATE POLICY rls_operator_write_store_categories ON public.store_categories
  FOR ALL TO authenticated
  USING (
    scope = 'store'
    AND store_id IS NOT NULL
    AND (public.is_store_operator(store_categories.store_id) OR public.is_admin())
  )
  WITH CHECK (
    scope = 'store'
    AND store_id IS NOT NULL
    AND (public.is_store_operator(store_categories.store_id) OR public.is_admin())
  );

-- ── 5. merchant_settlements：运营者读取本店结算台账 ─────────────
-- 原策略 store_owner_read_own_settlements 只认 owner_id → 运营者「货款提现」页台账为空。
DROP POLICY IF EXISTS rls_operator_read_settlements ON public.merchant_settlements;
CREATE POLICY rls_operator_read_settlements ON public.merchant_settlements
  FOR SELECT TO authenticated
  USING (
    store_id = ANY(public.fn_my_store_ids(auth.uid()))
    OR public.is_admin()
  );

-- ── 6a. fn_merchant_product_sales：护栏改用 fn_my_store_ids ─────
-- 原实现 `oi.store_id::uuid IN (SELECT id FROM stores WHERE owner_id = auth.uid())`
-- → 运营者调用返回 0 行 → 商品管理页「销量 / 营收」整列显示 0。
CREATE OR REPLACE FUNCTION public.fn_merchant_product_sales(p_store_id uuid)
RETURNS TABLE (product_id uuid, sales bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id::uuid                                  AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint                 AS sales,
         COALESCE(SUM(oi.price * oi.quantity), 0)              AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    -- 安全护栏：仅允许聚合当前登录商家可管理的门店（owner ∪ store_staff 活跃成员）
    AND oi.store_id::uuid = ANY(public.fn_my_store_ids(auth.uid()))
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_id::uuid
$$;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_merchant_product_sales(uuid)
  IS '按门店聚合每款商品的销量(sales)与营收(revenue)，已支付口径；护栏已对齐 fn_my_store_ids（含运营身份）';

-- ── 6b. get_store_locked_members：护栏改用 fn_my_store_ids ──────
-- 原实现开头 `IF NOT EXISTS (SELECT 1 FROM stores WHERE id=p_store_id AND owner_id=auth.uid())
-- THEN RETURN; END IF;` → 运营者「会员管理」恒为 0 人 / 跨店统计恒 0。
CREATE OR REPLACE FUNCTION public.get_store_locked_members(p_store_id UUID)
RETURNS TABLE (
    user_id UUID,
    nickname TEXT,
    avatar_url TEXT,
    phone_masked TEXT,
    phone_last4 TEXT,
    locked_at TIMESTAMPTZ,
    lock_type TEXT,
    referrer_id UUID,
    referrer_store_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 仅允许本店运营者（owner ∪ store_staff 活跃成员）查询本店锁客
    IF NOT (p_store_id = ANY(public.fn_my_store_ids(auth.uid())) OR public.is_admin()) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.user_id,
        COALESCE(p.nickname, '微信用户'),
        COALESCE(p.avatar_url, ''),
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 7 THEN '未知'
            ELSE substring(p.phone, 1, 3) || '****' || substring(p.phone, length(p.phone) - 3, 4)
        END,
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 4 THEN ''
            ELSE substring(p.phone, length(p.phone) - 3, 4)
        END,
        r.locked_at,
        COALESCE(r.lock_type, 'first_order'),
        r.referrer_id,
        (SELECT s.id FROM public.stores s WHERE s.owner_id = r.referrer_id LIMIT 1)
    FROM public.user_store_relation r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.store_id = p_store_id
    ORDER BY r.locked_at DESC
    LIMIT 200;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_store_locked_members(uuid) TO authenticated;

-- ── 7. redeem_store_invite v2：兑「owner」邀请码时回填 stores.owner_id ──
-- 原实现只写 store_staff，不回填 owner_id → 店铺 owner_id 永远为 NULL，
-- 所有仍按 owner_id 判权的地方（含未来新表）继续失效。这里彻底统一身份。
-- 安全边界：仅当该店 owner_id 为空（无主店）时才回填，绝不抢夺已有店长。
CREATE OR REPLACE FUNCTION public.redeem_store_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      public.store_invites%ROWTYPE;
  v_uid      uuid := auth.uid();
  v_store_id uuid;
  v_role     text;
  v_claimed  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv
  FROM public.store_invites
  WHERE code = upper(btrim(p_code))
    AND used_by IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  END IF;

  v_store_id := v_inv.store_id;
  v_role     := v_inv.role;

  -- upsert 进 store_staff（UNIQUE(store_id, user_id)）
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, v_uid, v_role, true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true;

  -- owner / manager 身份 + 门店无主 → 回填 owner_id，让 owner_id 判权路径也通
  IF v_role IN ('owner', 'manager') THEN
    UPDATE public.stores
       SET owner_id = v_uid
     WHERE id = v_store_id
       AND owner_id IS NULL;
    v_claimed := FOUND;
  END IF;

  -- 标记邀请码已用
  UPDATE public.store_invites
     SET used_by = v_uid, used_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'store_id', v_store_id, 'role', v_role, 'claimed_owner', v_claimed);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite(text) TO authenticated;

-- ── 8. claim_store_ownership()：免跑 SQL 的自助认领 ─────────────
-- 场景：门店由总后台建好、owner_id 为 NULL，而你已经通过任意方式拿到
--       store_staff(role=owner/manager)。调用一次即把 owner_id 认领到自己名下。
-- 幂等：已认领过返回 claimed=false（无副作用）。
CREATE OR REPLACE FUNCTION public.claim_store_ownership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_ids     uuid[];
  v_stores  uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- 候选：我是 owner/manager 的成员行对应门店，且该店当前无 owner
  SELECT COALESCE(array_agg(DISTINCT t.store_id), '{}'::uuid[])
    INTO v_ids
  FROM public.store_staff t
  JOIN public.stores s ON s.id = t.store_id
  WHERE t.user_id = v_uid
    AND t.is_active
    AND t.role IN ('owner', 'manager')
    AND s.owner_id IS NULL;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'claimed', 0, 'store_ids', '[]'::jsonb);
  END IF;

  UPDATE public.stores
     SET owner_id = v_uid
   WHERE id = ANY(v_ids)
     AND owner_id IS NULL;

  -- 回读确认（RETURNING 对数组变量只保留末行，故单独聚合一次）
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_stores
    FROM public.stores
   WHERE id = ANY(v_ids) AND owner_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'claimed', COALESCE(array_length(v_stores, 1), 0),
                            'store_ids', to_jsonb(v_stores));
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_store_ownership() TO authenticated;

-- ── 9. 诊断输出 ────────────────────────────────────────────────
-- 关注三列：
--   owner_id 为空的门店数 / 有 store_staff 运营者的门店数 / 「无主但有运营者」待认领数
SELECT
  (SELECT count(*) FROM public.stores)                                             AS 门店总数,
  (SELECT count(*) FROM public.stores WHERE owner_id IS NULL)                      AS owner为空的店,
  (SELECT count(*) FROM public.store_staff WHERE is_active)                        AS 活跃运营成员数,
  (SELECT count(DISTINCT s.id)
     FROM public.stores s
     JOIN public.store_staff t ON t.store_id = s.id AND t.is_active
                                AND t.role IN ('owner','manager')
    WHERE s.owner_id IS NULL)                                                      AS 待认领的门店数;

SELECT '00141 商家运营身份写权限对齐 已完成' AS result;
