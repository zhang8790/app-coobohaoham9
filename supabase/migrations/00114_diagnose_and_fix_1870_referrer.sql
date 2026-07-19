-- 00114：诊断并补齐 1870 → 1856 的 referrer_id 绑定（仅修复推荐关系，不涉及佣金）
--
-- 前置（已确认）：
--   1870 账号 id = d6b38349-dded-4879-9eac-3165a646436a
--   1856 手机号   = 18565613635
--   1870 手机号   = 18701410500
--
-- 设计：先诊断 1856 候选（profiles + auth.users），唯一则安全绑定；多个则列出不自动改，避免绑错人。

DO $$
DECLARE
  v_1870_id uuid;
  v_1870_ref uuid;
  v_candidates uuid[] := '{}';
  v_1856_id uuid;
  v_n int := 0;
  r record;
BEGIN
  RAISE NOTICE '========== 1) 诊断 1856 候选 ==========';
  -- profiles 候选（精确 + 模糊）
  FOR r IN
    SELECT id, phone FROM profiles
    WHERE phone IS NOT NULL AND (
      phone = '18565613635'
      OR phone LIKE '1856561363%'
      OR phone LIKE '%18565613635%'
    )
  LOOP
    v_candidates := v_candidates || r.id;
    RAISE NOTICE 'profiles 候选: id=% phone=%', r.id, r.phone;
  END LOOP;
  -- auth.users 候选（不重复追加）
  FOR r IN
    SELECT id, phone, email FROM auth.users
    WHERE (
      phone = '18565613635'
      OR phone LIKE '1856561363%'
      OR phone LIKE '%18565613635%'
      OR email ILIKE '%1856%'
    )
  LOOP
    IF NOT (r.id = ANY(v_candidates)) THEN
      v_candidates := v_candidates || r.id;
      RAISE NOTICE 'auth.users 候选: id=% phone=% email=%', r.id, r.phone, r.email;
    END IF;
  END LOOP;

  v_n := COALESCE(array_length(v_candidates, 1), 0);

  IF v_n = 0 THEN
    RAISE EXCEPTION '❌ 1856 在 profiles 与 auth.users 都找不到（手机号 18565613635 及模糊均不匹配）。请确认 1856 实际使用的手机号/账号。';
  END IF;

  IF v_n > 1 THEN
    RAISE NOTICE '⚠️ 发现 % 个 1856 候选（可能存在身份漂移），为安全起见【不自动绑定】。请人工确认后告诉我用哪个 id：', v_n;
    SELECT id, referrer_id INTO v_1870_id, v_1870_ref
    FROM profiles WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';
    RAISE NOTICE '1870 当前: id=% referrer_id=%', v_1870_id, v_1870_ref;
    RETURN;
  END IF;

  v_1856_id := v_candidates[1];
  RAISE NOTICE '✅ 唯一 1856 候选: id=%', v_1856_id;

  -- 确保 profiles 行存在（若只在 auth.users 则补建）
  PERFORM 1 FROM profiles WHERE id = v_1856_id;
  IF NOT FOUND THEN
    INSERT INTO profiles (id, phone, role, is_active, created_at, updated_at, nickname)
    VALUES (v_1856_id, '18565613635', 'user', true, now(), now(), '无名')
    ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;
    RAISE NOTICE '✅ 已从 auth.users 补建 1856 profiles 行';
  END IF;

  -- 定位 1870
  SELECT id, referrer_id INTO v_1870_id, v_1870_ref
  FROM profiles WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';
  IF v_1870_id IS NULL THEN
    SELECT id, referrer_id INTO v_1870_id, v_1870_ref
    FROM profiles WHERE phone = '18701410500';
  END IF;
  IF v_1870_id IS NULL THEN
    RAISE EXCEPTION '❌ 1870 账号未找到（profiles 中既无 id 也无手机号 18701410500）';
  END IF;

  RAISE NOTICE '1870 当前 referrer_id=%（目标应=%）', v_1870_ref, v_1856_id;

  -- 绑定
  IF v_1870_ref IS DISTINCT FROM v_1856_id THEN
    UPDATE profiles SET referrer_id = v_1856_id, updated_at = now()
    WHERE id = v_1870_id;
    RAISE NOTICE '✅ 已绑定 1870.referrer_id -> %', v_1856_id;
  ELSE
    RAISE NOTICE 'ℹ️ 1870.referrer_id 已正确，无需修改';
  END IF;

  -- 校验
  SELECT referrer_id INTO v_1870_ref FROM profiles WHERE id = v_1870_id;
  IF v_1870_ref = v_1856_id THEN
    RAISE NOTICE '🎉 绑定一致：1870.referrer_id = 1856.id。结合 00115 的 RLS 修复，「我的好友」即可显示 1870。';
  ELSE
    RAISE NOTICE '❌ 绑定后仍不一致，请人工核查。';
  END IF;
END $$;
