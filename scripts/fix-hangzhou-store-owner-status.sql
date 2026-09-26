/* ============================================================
   修复「杭州礼品店」绑定后用户端进不去的问题
   门店 id : 70778d6b-d819-41fc-87a3-8766a78eb60d
   账号 id : 99f02c72-b238-4f76-8817-73b2848d8d65
   ------------------------------------------------------------
   症状：后台已绑定 owner_id，但小程序「我的 → 自营门店管理中心」仍显示
        「申请开通自营门店」（用户以为要重新注册）。
   根因：小程序闸门 src/pages/user/index.tsx 判定顺序为
        profile.merchant_status || application.status || 'none'
        绑定只写了 owner_id / role，漏写 merchant_status → 仍判定为 none。
   ------------------------------------------------------------
   执行位置：Supabase Dashboard -> SQL Editor
   幂等：是
   ============================================================ */

DO $do$
DECLARE
  v_store   uuid := '70778d6b-d819-41fc-87a3-8766a78eb60d';
  v_uid     uuid := '99f02c72-b238-4f76-8817-73b2848d8d65';
  v_exists  int;
BEGIN
  /* 0) 前置校验：账号必须存在 */
  SELECT count(*) INTO v_exists FROM public.profiles WHERE id = v_uid;
  IF v_exists = 0 THEN
    RAISE EXCEPTION '未找到账号 % ，请确认 user_id 是否正确', v_uid;
  END IF;

  /* 1) 门店归属（幂等，若已写则无变化） */
  UPDATE public.stores
     SET owner_id   = v_uid,
         store_type = COALESCE(store_type, 'branch'),
         is_active  = true
   WHERE id = v_store;
  RAISE NOTICE '① stores.owner_id 已确保为 %', v_uid;

  /* 2) 运营成员行（fn_my_store_ids / is_store_manager 依赖它） */
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store, v_uid, 'owner', true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = 'owner', is_active = true;
  RAISE NOTICE '② store_staff(owner) 已写入';

  /* 3) ★核心：merchant_status='approved' + role='merchant'
        这是「我的」页闸门能放行的关键，之前被漏写。 */
  UPDATE public.profiles
     SET merchant_status = 'approved',
         role            = 'merchant'
   WHERE id = v_uid;
  RAISE NOTICE '③ profiles.merchant_status=approved, role=merchant 已写入';

  RAISE NOTICE '修复完成：该账号现在从「我的 → 自营门店管理中心」可直接进入后台。';
END
$do$;

/* ---- 验证：应看到 owner_id 已填、staff_rows=1、merchant_status=approved ---- */
SELECT
  s.id,
  s.name,
  s.owner_id,
  s.store_type,
  p.nickname,
  p.role::text              AS profile_role,
  p.merchant_status::text   AS merchant_status,
  (SELECT count(*) FROM public.store_staff st
    WHERE st.store_id = s.id AND st.user_id = s.owner_id AND st.is_active) AS staff_rows
FROM public.stores s
LEFT JOIN public.profiles p ON p.id = s.owner_id
WHERE s.id = '70778d6b-d819-41fc-87a3-8766a78eb60d';
