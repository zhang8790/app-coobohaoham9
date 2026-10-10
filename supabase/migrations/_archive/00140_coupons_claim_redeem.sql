-- 00140 coupons 认领/核销闭环
-- 背景：00139 仅建表止血，getMyCoupons 为 select('*') 无过滤，且 RLS 写策略只放行店主，
--       导致"用户领取个人实例"会被 RLS 拦截。本迁移补上认领/核销能力。
-- 模型：coupons 一张表同时存「模板」(user_id IS NULL, store_id=本店) 与「用户实例」(user_id=持券人, claimed_from=模板id)。
--       读取靠 user_id 区分；写操作经两个 SECURITY DEFINER RPC 原子完成，规避 RLS 自引用难题。

-- 1) user_id 改可空（模板无归属人）
ALTER TABLE public.coupons ALTER COLUMN user_id DROP NOT NULL;

-- 2) 实例关联模板
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS claimed_from uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_claimed_from ON public.coupons(claimed_from);
CREATE INDEX IF NOT EXISTS idx_coupons_user_id ON public.coupons(user_id);

-- 3) 读策略：仅管理员 / 本人实例 / 模板(user_id IS NULL)。不再无差别全表可读。
DROP POLICY IF EXISTS rls81_coupons_select ON public.coupons;
CREATE POLICY rls81_coupons_select ON public.coupons
  FOR SELECT TO authenticated
  USING (is_admin() OR user_id = auth.uid() OR user_id IS NULL);

-- 4) 写策略：店主管本店模板 / 用户只能认领自己的实例(claimed_from NOT NULL) / 管理员
DROP POLICY IF EXISTS rls81_coupons_write ON public.coupons;
CREATE POLICY rls81_coupons_write ON public.coupons
  FOR ALL TO authenticated
  USING (store_id = ANY(public.fn_my_store_ids(auth.uid())) OR user_id = auth.uid() OR is_admin())
  WITH CHECK (
    is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
    OR (user_id = auth.uid() AND claimed_from IS NOT NULL)
  );

-- 5) 认领 RPC：原子地由模板生成用户个人实例，并自增模板 claimed_count，防重复领取。
--    返回 jsonb：{ok:true,id} 或 {ok:false,error}
CREATE OR REPLACE FUNCTION public.claim_coupon(p_template_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_tpl   public.coupons%ROWTYPE;
  v_code  text;
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '未登录');
  END IF;
  SELECT * INTO v_tpl
  FROM public.coupons
  WHERE id = p_template_id AND user_id IS NULL AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '券不存在或不可领取');
  END IF;
  PERFORM 1 FROM public.coupons WHERE claimed_from = p_template_id AND user_id = v_uid LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '已领取');
  END IF;
  v_code := v_tpl.code || '-' || substr(replace(v_uid::text, '-', ''), 1, 6);
  INSERT INTO public.coupons
    (user_id, store_id, code, title, discount_type, discount_value, min_amount, claimed_from, status, start_date, end_date, is_used)
  VALUES
    (v_uid, v_tpl.store_id, v_code, v_tpl.title, v_tpl.discount_type, v_tpl.discount_value, v_tpl.min_amount, v_tpl.id, 'active', v_tpl.start_date, v_tpl.end_date, false)
  RETURNING id INTO v_id;
  UPDATE public.coupons SET claimed_count = claimed_count + 1 WHERE id = p_template_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_coupon(uuid) TO authenticated;

-- 6) 商家核销 RPC：仅本店店主可核销本店用户实例，置 is_used=true。
--    返回 jsonb：{ok:true,id} 或 {ok:false,error}
CREATE OR REPLACE FUNCTION public.merchant_redeem_coupon(p_code text, p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_coupon public.coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', '未登录');
  END IF;
  IF NOT (p_store_id = ANY(public.fn_my_store_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'error', '无权限');
  END IF;
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE code = p_code AND claimed_from IS NOT NULL AND store_id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', '券不存在或不属于本店');
  END IF;
  IF v_coupon.is_used THEN
    RETURN jsonb_build_object('ok', false, 'error', '已核销');
  END IF;
  UPDATE public.coupons SET is_used = true, used_at = now() WHERE id = v_coupon.id;
  RETURN jsonb_build_object('ok', true, 'id', v_coupon.id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.merchant_redeem_coupon(text, uuid) TO authenticated;
