
-- 1. profiles 新增推广码与上级字段
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 为已有用户生成推广码（6位大写字母+数字）
UPDATE public.profiles
SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE referral_code IS NULL;

-- 新用户注册触发器：自动生成推广码
CREATE OR REPLACE FUNCTION public.handle_new_user_referral()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_referral_code ON public.profiles;
CREATE TRIGGER on_profile_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_referral();

-- 2. orders 新增服务类型
DO $$ BEGIN
  CREATE TYPE service_type AS ENUM ('dine_in', 'self_pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_type service_type NOT NULL DEFAULT 'delivery';

-- 3. RPC：绑定上级（注册时调用，幂等）
CREATE OR REPLACE FUNCTION public.bind_referrer(p_referral_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_referrer RECORD;
  v_self_code text;
BEGIN
  -- 查自己的推广码，避免自绑
  SELECT referral_code INTO v_self_code FROM public.profiles WHERE id = auth.uid();
  IF v_self_code = upper(trim(p_referral_code)) THEN
    RETURN jsonb_build_object('success', false, 'error', '不能绑定自己的推广码');
  END IF;

  -- 查推广人
  SELECT id, referral_code INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_referral_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '推广码不存在');
  END IF;

  -- 幂等：已绑定则跳过
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND referrer_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', true, 'message', '已绑定');
  END IF;

  UPDATE public.profiles SET referrer_id = v_referrer.id WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer.id);
END;
$$;

-- 4. 段位升级规则（用于前端展示进度）
CREATE OR REPLACE FUNCTION public.get_rank_progress(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile RECORD;
  v_direct_count int;
  v_total_gmv numeric;
  v_next_rank text;
  v_progress numeric;
  v_target int;
BEGIN
  SELECT member_rank, points, balance INTO v_profile FROM public.profiles WHERE id = p_user_id;
  -- 统计直接下级数
  SELECT count(*) INTO v_direct_count FROM public.profiles WHERE referrer_id = p_user_id;
  -- 统计个人GMV（已完成订单）
  SELECT COALESCE(sum(total_amount), 0) INTO v_total_gmv FROM public.orders
  WHERE user_id = p_user_id AND status NOT IN ('cancelled', 'after_sale');

  -- 段位进度规则（简化版）
  CASE v_profile.member_rank
    WHEN '江湖散修' THEN v_next_rank := '外门弟子'; v_target := 3; v_progress := LEAST(v_direct_count::numeric / 3, 1);
    WHEN '外门弟子' THEN v_next_rank := '内门弟子'; v_target := 10; v_progress := LEAST(v_direct_count::numeric / 10, 1);
    WHEN '内门弟子' THEN v_next_rank := '核心弟子'; v_target := 30; v_progress := LEAST(v_direct_count::numeric / 30, 1);
    WHEN '核心弟子' THEN v_next_rank := '长老'; v_target := 100; v_progress := LEAST(v_direct_count::numeric / 100, 1);
    WHEN '长老' THEN v_next_rank := '掌门'; v_target := 300; v_progress := LEAST(v_direct_count::numeric / 300, 1);
    ELSE v_next_rank := '已是最高段位'; v_target := 0; v_progress := 1;
  END CASE;

  RETURN jsonb_build_object(
    'current_rank', v_profile.member_rank,
    'next_rank', v_next_rank,
    'direct_count', v_direct_count,
    'target_count', v_target,
    'progress', v_progress,
    'total_gmv', v_total_gmv,
    'points', v_profile.points,
    'balance', v_profile.balance
  );
END;
$$;
