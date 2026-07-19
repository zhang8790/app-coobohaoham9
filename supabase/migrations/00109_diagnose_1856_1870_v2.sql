-- 00109_v2 诊断：1856/1870 分佣断点（不依赖手机号精确匹配）
-- 用途：先跑这个，看 1870 的 referrer_id 到底指向谁、那个上级是否存在、真实 1856 在哪个 id。
-- 在 Supabase SQL Editor 运行，看 Results + Messages 面板。

DO $$
DECLARE
  v_1870_id uuid;
  v_1870_phone text;
  v_1870_referrer uuid;
  v_referrer_exists boolean;
  v_referrer_phone text;
  v_referrer_auth_email text;
  v_1856_by_phone uuid;
  v_1856_auth_id uuid;
  v_1856_auth_email text;
BEGIN
  -- 1) 1870 当前身份与绑定关系
  SELECT id, phone, referrer_id
    INTO v_1870_id, v_1870_phone, v_1870_referrer
  FROM profiles
  WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a'; -- 00109 已知 1870 id

  IF v_1870_id IS NULL THEN
    -- 如果 id 不对，尝试按手机号兜底
    SELECT id, phone, referrer_id
      INTO v_1870_id, v_1870_phone, v_1870_referrer
    FROM profiles WHERE phone = '18701410500' LIMIT 1;
  END IF;

  RAISE NOTICE '===== 1870 账号 =====';
  RAISE NOTICE '1870 id=%  phone=%  referrer_id=%', v_1870_id, v_1870_phone, v_1870_referrer;

  -- 2) 1870 的上级（referrer_id）在 profiles 中是否存在
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = v_1870_referrer)
    INTO v_referrer_exists;
  SELECT phone INTO v_referrer_phone FROM profiles WHERE id = v_1870_referrer;

  RAISE NOTICE '===== 1870 的上级 =====';
  RAISE NOTICE '上级存在? %  上级 phone=%', v_referrer_exists, v_referrer_phone;
  RAISE NOTICE '关键：如果上级存在但 phone 不是 1856，说明 1870 绑给了别人；';
  RAISE NOTICE '      如果上级不存在，说明 1870 绑向了已删除/漂移的旧 id。';

  -- 3) 真实 1856 在哪里（多种方式兜底）
  SELECT id INTO v_1856_by_phone FROM profiles
  WHERE phone IN ('18565613635', '+8618565613635', '18565613635 ') LIMIT 1;

  SELECT id, email
    INTO v_1856_auth_id, v_1856_auth_email
  FROM auth.users
  WHERE phone IN ('18565613635', '+8618565613635')
     OR email ILIKE '%1856%'
  LIMIT 1;

  RAISE NOTICE '===== 1856 账号 =====';
  RAISE NOTICE 'profiles 按 phone 查=%', v_1856_by_phone;
  RAISE NOTICE 'auth.users 兜底查=%  email=%', v_1856_auth_id, v_1856_auth_email;
  RAISE NOTICE '结论：若 auth.users 有 1856 但 profiles 没有，则 profiles 行缺失，需重建。';

  -- 4) 如果 1870 当前绑定的上级不是真实 1856，给出建议
  IF v_1870_referrer IS DISTINCT FROM v_1856_by_phone
     AND v_1870_referrer IS DISTINCT FROM v_1856_auth_id THEN
    RAISE NOTICE '⚠️ 绑定错位：1870.referrer_id (%) 不是 1856 (profiles=% / auth=%)',
                 v_1870_referrer, v_1856_by_phone, v_1856_auth_id;
  ELSE
    RAISE NOTICE '✅ 绑定关系看起来是对的。';
  END IF;
END $$;

-- 5) 1870 的订单现状（是否已支付、分佣标记）
SELECT id, order_no, status, payment_method, payment_status,
       referrer_id, commission_distributed, commission_calculated,
       total_amount, l1_commission, created_at
FROM orders
WHERE payer_id = COALESCE(
  (SELECT id FROM profiles WHERE phone = '18701410500' LIMIT 1),
  'd6b38349-dded-4879-9eac-3165a646436a'::uuid
)
ORDER BY created_at DESC
LIMIT 10;

-- 6) 当前所有 commissions 中，beneficiary 是 1870.referrer_id 的流水
SELECT c.id, c.order_id, c.order_no, c.beneficiary_id, c.payer_id, c.level,
       c.commission_amount, c.status, c.created_at,
       p.phone AS beneficiary_phone
FROM commissions c
JOIN profiles p ON p.id = c.beneficiary_id
WHERE c.beneficiary_id = (
  SELECT referrer_id FROM profiles WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a' LIMIT 1
)
ORDER BY c.created_at DESC
LIMIT 10;
