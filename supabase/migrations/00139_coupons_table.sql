-- 00139 补建 coupons 表（商家端优惠券管理 + 用户端"我的优惠券"共用）
-- 背景：迁移 00008 曾建过 coupons，但本环境未应用，导致 merchant-coupons / coupon 两页
--       查询 .from('coupons') 报 "relation does not exist"。本次补建。
-- 设计：两端页面字段不一致（商家端=券模板，用户端=持有券实例），统一收进一张表，
--       两端各自只用自己关心的列，空着的列保持默认/NULL，互不破坏。

CREATE TABLE IF NOT EXISTS public.coupons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,                                         -- 券归属人：商家端=店主；用户端=持券用户
  store_id        uuid REFERENCES public.stores(id) ON DELETE SET NULL,  -- 商家端必填（本店券）；用户端实例可空
  code            text NOT NULL UNIQUE,                                  -- 券码，前端 'CP'+时间戳36进制
  title           text NOT NULL,
  discount_type   text NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
  discount_value  numeric NOT NULL DEFAULT 0,
  min_amount      numeric NOT NULL DEFAULT 0,
  is_used         boolean NOT NULL DEFAULT false,                        -- 用户端：是否已核销
  expired_at      timestamptz,                                          -- 用户端：过期时间
  used_at         timestamptz,                                          -- 用户端：核销时间
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')), -- 商家端：上架/下架
  start_date      date,                                                 -- 商家端：生效日
  end_date        date,                                                 -- 商家端：截止日
  total           integer NOT NULL DEFAULT 0,                            -- 商家端：发放总量
  claimed_count   integer NOT NULL DEFAULT 0,                           -- 商家端：已领数量
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_coupons_status   ON public.coupons(status);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 读：已登录用户均可查看（用户端"我的优惠券"无门店过滤，展示已发布券）
DROP POLICY IF EXISTS rls81_coupons_select ON public.coupons;
CREATE POLICY rls81_coupons_select ON public.coupons
  FOR SELECT TO authenticated
  USING (true);

-- 写：仅门店店主可管理本店券（复用 00138 的 fn_my_store_ids 断链助手），管理员可全管
DROP POLICY IF EXISTS rls81_coupons_write ON public.coupons;
CREATE POLICY rls81_coupons_write ON public.coupons
  FOR ALL TO authenticated
  USING (store_id = ANY(public.fn_my_store_ids(auth.uid())) OR is_admin())
  WITH CHECK (store_id = ANY(public.fn_my_store_ids(auth.uid())) OR is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
