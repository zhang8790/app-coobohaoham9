/* ============================================================
   绑定「杭州礼品店」到账号：昵称 123
   店铺 id: 70778d6b-d819-41fc-87a3-8766a78eb60d
   目标账号特征（来自 admin-web 后台列表截图）:
     昵称 = 123
     手机号 = 空
     金豆(gold_beans) = 7381.27
     注册时间 = 2026-07-19
     段位 = 静心
   ------------------------------------------------------------
   执行位置: Supabase Dashboard -> SQL Editor
   幂等: 是，可重复执行
   ============================================================ */

/* ---- 段 1：诊断。按 昵称=123 找出候选账号，打印全部特征 ---- */
/* 目的：确认唯一命中，且金豆≈7381.27 / 注册于 2026-07-19，避免绑错人 */
SELECT
  p.id                AS user_id,
  p.nickname,
  p.phone,
  p.gold_beans,
  p.member_rank::text AS member_rank,
  p.role::text        AS profile_role,
  p.created_at::date  AS reg_date,
  EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = p.id) AS already_owns_store
FROM public.profiles p
WHERE p.nickname = '123'
   OR p.nickname ILIKE '%123%'
ORDER BY (p.nickname = '123') DESC, p.created_at
LIMIT 20;


/* ---- 段 2：绑定。
        把候选账号精确锁定为「昵称=123 且 gold_beans≈7381.27」那一个，
        写 stores.owner_id + store_staff(owner) + profiles.role=merchant。
        若命中 0 个或多于 1 个 → 报错中止，绝不误绑。 ---- */
DO $do$
DECLARE
  v_store_id  uuid := '70778d6b-d819-41fc-87a3-8766a78eb60d';
  v_uid       uuid;
  v_hit       int;
  v_has_merchant boolean;
BEGIN
  /* 1) 精确锁定目标账号：昵称完全等于 123（金豆做二次校验，容错到 0.01） */
  SELECT count(*) INTO v_hit
  FROM public.profiles
  WHERE nickname = '123' AND round(gold_beans::numeric, 2) = 7381.27;

  IF v_hit = 0 THEN
    /* 退化匹配：仅按昵称完全等于 123 */
    SELECT count(*) INTO v_hit FROM public.profiles WHERE nickname = '123';
  END IF;

  IF v_hit = 0 THEN
    RAISE EXCEPTION '未找到昵称为 123 的账号，请检查昵称或改用 user_id 绑定';
  END IF;

  IF v_hit > 1 THEN
    RAISE EXCEPTION '昵称 123 匹配到 % 个账号，存在歧义，请改用 user_id 精确绑定', v_hit;
  END IF;

  /* 2) 取唯一 user_id（优先金豆吻合的那个） */
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE nickname = '123'
  ORDER BY (round(gold_beans::numeric, 2) = 7381.27) DESC, created_at
  LIMIT 1;

  RAISE NOTICE '目标账号 user_id = %', v_uid;

  /* 3) 认领门店：写 owner_id + store_type */
  UPDATE public.stores
     SET owner_id   = v_uid,
         store_type = COALESCE(store_type, 'branch')
   WHERE id = v_store_id;

  /* 4) 写 store_staff(owner)，幂等 */
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, v_uid, 'owner', true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = 'owner', is_active = true;

  /* 5) profiles.role 升级为 merchant（仅当枚举已有该值，00142 部署后才有） */
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'merchant'
  ) INTO v_has_merchant;

  IF v_has_merchant THEN
    UPDATE public.profiles SET role = 'merchant' WHERE id = v_uid;
    RAISE NOTICE '已升级 profiles.role = merchant';
  ELSE
    RAISE NOTICE 'user_role 枚举暂无 merchant 值（00142 未部署），跳过 role 升级；不影响进店与写权限';
  END IF;

  RAISE NOTICE '绑定完成：杭州礼品店 -> %', v_uid;
END
$do$;


/* ---- 段 3：验证。回显绑定结果 ---- */
SELECT
  s.id,
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
