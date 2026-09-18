/* ============================================================================
 * 绑定「杭州礼品店」-> 手机号 13526245633（自诊断版）
 *
 * 用法：Supabase Dashboard -> SQL Editor，整段粘贴执行。
 *      沙箱没有 service_role 密钥，无法代为执行，必须在这里跑。
 *
 * 为什么上一版没绑上：
 *   上一版只查 profiles.phone。本小程序登录页支持「手机号登录」
 *   （src/pages/login/index.tsx 用 signInWithPhone('+86'+phone)），
 *   这类账号的手机号落在 auth.users.phone，profiles.phone 往往是空的；
 *   小程序里也从未采集过 getPhoneNumber（全仓无此调用），
 *   所以 profiles.phone 基本只有手工填过的人才有值。
 *
 * 本脚本做三件事：
 *   第 1 段  诊断：把该手机号在三个来源的命中行全部打印出来（看 src 列）
 *   第 2 段  绑定：命中即写 stores.owner_id + store_staff(owner) + profiles.role
 *   第 3 段  验证：回显绑定结果
 *
 * 手机号匹配方式：去掉所有非数字后取后 11 位比对
 *   -> 兼容 '13526245633' / '+8613526245633' / '86 135 2624 5633' / '135-2624-5633'
 * ============================================================================ */


/* ---------- 第 1 段：诊断（先看结果再往下走） ---------- */

SELECT 'auth.users' AS src,
       u.id::text AS user_id,
       coalesce(u.phone, '(空)') AS phone_on_record,
       coalesce(u.email, '(空)') AS extra_info,
       u.created_at::text AS created_at
  FROM auth.users u
 WHERE right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 11) = '13526245633'

UNION ALL

SELECT 'profiles',
       p.id::text,
       coalesce(p.phone, '(空)'),
       coalesce(p.nickname, '(无昵称)') || ' / role=' || coalesce(p.role::text, '?'),
       p.created_at::text
  FROM public.profiles p
 WHERE right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 11) = '13526245633'

UNION ALL

SELECT 'merchant_applications',
       a.user_id::text,
       coalesce(a.contact_phone, '(空)'),
       coalesce(a.store_name, '(无店名)') || ' / status=' || coalesce(a.status::text, '?'),
       a.created_at::text
  FROM public.merchant_applications a
 WHERE right(regexp_replace(coalesce(a.contact_phone, ''), '\D', '', 'g'), 11) = '13526245633'
 ORDER BY src, created_at;


/* ---------- 第 2 段：绑定（诊断有命中才会真的写） ---------- */

DO $$
DECLARE
  v_phone    text := '13526245633';
  v_store    uuid := '70778d6b-d819-41fc-87a3-8766a78eb60d';   /* 杭州礼品店 */
  v_user     uuid;
  v_src      text := '';
  v_role_ok  boolean;
BEGIN
  /* 来源 1：auth.users.phone（手机号登录/绑定，最权威） */
  SELECT u.id INTO v_user
    FROM auth.users u
   WHERE right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 11) = v_phone
   LIMIT 1;
  IF v_user IS NOT NULL THEN v_src := 'auth.users.phone'; END IF;

  /* 来源 2：profiles.phone */
  IF v_user IS NULL THEN
    SELECT p.id INTO v_user
      FROM public.profiles p
     WHERE right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 11) = v_phone
     LIMIT 1;
    IF v_user IS NOT NULL THEN v_src := 'profiles.phone'; END IF;
  END IF;

  /* 来源 3：merchant_applications.contact_phone（开店申请里手工填的联系电话） */
  IF v_user IS NULL THEN
    SELECT a.user_id INTO v_user
      FROM public.merchant_applications a
     WHERE right(regexp_replace(coalesce(a.contact_phone, ''), '\D', '', 'g'), 11) = v_phone
     ORDER BY a.created_at DESC NULLS LAST
     LIMIT 1;
    IF v_user IS NOT NULL THEN v_src := 'merchant_applications.contact_phone'; END IF;
  END IF;

  IF v_user IS NULL THEN
    RAISE NOTICE '【未绑定】手机号 % 在 auth.users / profiles / merchant_applications 三处都没有对应账号。请看上方第 1 段诊断结果：若一行都没有，说明该号从未与任何账号建立关联（既没手机号登录过，也没手工填过）。此时改用：让该账号在小程序「我的 -> 自营门店管理中心」自行提交开店申请（店铺名填「杭州礼品店」），总后台审核通过后即可直接进后台，无需任何绑定。', v_phone;
    RETURN;
  END IF;

  /* 1) 认领门店：owner_id 是进后台 + 全部写权限 RLS 的唯一依据 */
  UPDATE public.stores
     SET owner_id = v_user,
         store_type = COALESCE(store_type, 'branch')
   WHERE id = v_store;

  /* 2) 运营成员行（对齐全仓约定：store_staff.role='owner'，幂等） */
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store, v_user, 'owner', true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = 'owner', is_active = true;

  /* 3) 升级 merchant 身份（仅当 user_role 枚举已含 merchant，即迁移 00142 已部署）
   *    未部署时跳过 —— 不影响进后台，只是身份标识不完整。 */
  SELECT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'user_role' AND e.enumlabel = 'merchant'
  ) INTO v_role_ok;

  IF v_role_ok THEN
    UPDATE public.profiles SET role = 'merchant' WHERE id = v_user;
    RAISE NOTICE '【绑定成功】杭州礼品店 -> user_id=%（来源=%），并已升级 role=merchant。', v_user, v_src;
  ELSE
    RAISE NOTICE '【绑定成功】杭州礼品店 -> user_id=%（来源=%）。user_role 枚举缺 merchant 值（迁移 00142 未部署），未升级身份；该账号凭 owner_id 已可进入门店后台并正常读写。', v_user, v_src;
  END IF;
END $$;


/* ---------- 第 3 段：验证（owner_id 非空且 staff_rows=1 即成功） ---------- */

SELECT s.id,
       s.name,
       s.owner_id,
       s.store_type,
       p.nickname,
       p.phone,
       p.role::text AS profile_role,
       (SELECT count(*) FROM public.store_staff st
         WHERE st.store_id = s.id AND st.user_id = s.owner_id AND st.is_active) AS staff_rows
  FROM public.stores s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
 WHERE s.id = '70778d6b-d819-41fc-87a3-8766a78eb60d';
