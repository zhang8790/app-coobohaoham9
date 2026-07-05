-- =============================================================
--  来店有喜 数据库补全脚本 v2
--  2026-07-03
--
--  功能：
--  1. 补全 orders 表字段（store_id, address, remark 等）
--  2. 新建 user_store_relation 锁客表
--  3. 补全 commissions 表字段
--  4. 补全 withdrawals / refunds 表字段
--  5. 添加必要索引和 RLS 策略
--
--  执行方式：在 Supabase SQL Editor 中新建查询，粘贴全部内容，点 Run
-- =============================================================

-- =============================================================
--  1. 补全 orders 表
-- =============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address_json jsonb,
  ADD COLUMN IF NOT EXISTS remark text,
  ADD COLUMN IF NOT EXISTS tracking_no text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS refund_status text CHECK (refund_status IN ('none','pending','approved','rejected','completed')) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS commission_amount numeric(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- 为已有订单回填 store_id（从 order_items 中取）
UPDATE public.orders
SET store_id = (
  SELECT store_id FROM public.order_items
  WHERE order_id = orders.id
  LIMIT 1
)
WHERE store_id IS NULL;

-- =============================================================
--  2. 新建 user_store_relation 锁客表
-- =============================================================
CREATE TABLE IF NOT EXISTS public.user_store_relation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now(),
  lock_type text NOT NULL DEFAULT 'first_order' CHECK (lock_type IN ('first_order','scan','share','invite')),
  expires_at timestamptz,
  UNIQUE(user_id, store_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_usr_user ON public.user_store_relation(user_id);
CREATE INDEX IF NOT EXISTS idx_usr_store ON public.user_store_relation(store_id);

-- RLS（先关，测试阶段）
ALTER TABLE public.user_store_relation DISABLE ROW LEVEL SECURITY;

-- =============================================================
--  3. 补全 commissions 表（如已存在则加字段）
-- =============================================================
-- 先检查 commissions 表是否存在，不存在则创建
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES auth.users(id),
  payer_id uuid NOT NULL REFERENCES auth.users(id),
  level int NOT NULL CHECK (level IN (1, 2)),
  rank_at_time text NOT NULL,
  ratio numeric(6,4) NOT NULL,
  pool_amount numeric(12,4) NOT NULL,
  commission_amount numeric(12,4) NOT NULL,
  b_coef numeric(6,4) NOT NULL DEFAULT 1.0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','refunded')),
  settle_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 补全可能缺失的字段
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_rate numeric(6,4),
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- 索引
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary ON public.commissions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order ON public.commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_store ON public.commissions(store_id);

-- RLS（测试阶段关闭）
ALTER TABLE public.commissions DISABLE ROW LEVEL SECURITY;

-- =============================================================
--  4. 补全 withdrawals 表
-- =============================================================
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric(12,4) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'wechat' CHECK (method IN ('wechat','alipay','bank')),
  account_info jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  reject_reason text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commission_ids uuid[];

-- 索引
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_store ON public.withdrawals(store_id);

-- RLS（测试阶段关闭）
ALTER TABLE public.withdrawals DISABLE ROW LEVEL SECURITY;

-- =============================================================
--  5. 补全 refunds 表
-- =============================================================
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  refund_amount numeric(12,4) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  reject_reason text,
  refund_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS handled_at timestamptz;

-- 索引
CREATE INDEX IF NOT EXISTS idx_refunds_order ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user ON public.refunds(user_id);

-- RLS（测试阶段关闭）
ALTER TABLE public.refunds DISABLE ROW LEVEL SECURITY;

-- =============================================================
--  6. 补全 profiles 表（加锁客相关字段）
-- =============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS total_commission numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_commission numeric(12,4) NOT NULL DEFAULT 0;

-- 为测试账号生成邀请码
UPDATE public.profiles SET invite_code = 'LDYX001' WHERE phone = '18701410500' AND invite_code IS NULL;

-- =============================================================
--  7. 新建 store_staff 表（员工管理）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.store_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff','cashier')),
  permissions text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, user_id)
);

-- RLS（测试阶段关闭）
ALTER TABLE public.store_staff DISABLE ROW LEVEL SECURITY;

-- =============================================================
--  8. 验证：列出所有表
-- =============================================================
SELECT
  table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT '✅ 数据库补全完成！请检查上面的表列表' as result;
