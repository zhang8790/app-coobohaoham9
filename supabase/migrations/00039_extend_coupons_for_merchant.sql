-- 扩展 coupons 表，使其同时支持「用户个人券」与「商家发放的优惠券模板」
-- 用户个人券：store_id 为 NULL
-- 商家券模板：store_id 关联门店，并带有发放总量/已领取/状态/有效期

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'draft', 'paused', 'expired')),
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);

-- 商家可管理自己门店的优惠券（与用户查看自己券的 RLS 策略为 OR 关系）
DROP POLICY IF EXISTS "商家可管理自己的优惠券" ON public.coupons;
CREATE POLICY "商家可管理自己的优惠券" ON public.coupons
  FOR ALL USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

COMMENT ON COLUMN public.coupons.store_id IS '商家发放的优惠券所属门店，用户个人券为 NULL';
COMMENT ON COLUMN public.coupons.total IS '发放总量';
COMMENT ON COLUMN public.coupons.claimed_count IS '已领取数量';
COMMENT ON COLUMN public.coupons.status IS 'active=生效中 draft=草稿 paused=已暂停 expired=已过期';
COMMENT ON COLUMN public.coupons.start_date IS '生效开始日期';
COMMENT ON COLUMN public.coupons.end_date IS '生效结束日期';
