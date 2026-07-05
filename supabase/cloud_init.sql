-- ============================================================
-- 来店有喜 - Supabase 云端数据库初始化脚本
-- 在 Supabase Dashboard → SQL Editor 中运行此脚本
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- Enums
-- =====================
CREATE TYPE public.user_role AS ENUM ('user', 'admin');
CREATE TYPE public.member_rank AS ENUM ('江湖散修', '外门弟子', '内门弟子', '核心弟子', '长老', '掌门');
CREATE TYPE public.merchant_status AS ENUM ('none', 'pending', 'approved', 'rejected');
CREATE TYPE public.order_status AS ENUM ('pending_pay', 'pending_ship', 'pending_receive', 'pending_review', 'completed', 'after_sale', 'cancelled');
CREATE TYPE public.payment_method AS ENUM ('wxpay', 'gold_beans');

-- =====================
-- profiles（先不设外键，等用户注册后再更新）
-- =====================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  username text,
  phone text,
  nickname text DEFAULT '江湖散修' NOT NULL,
  avatar_url text,
  role public.user_role NOT NULL DEFAULT 'user',
  openid text,
  member_rank public.member_rank NOT NULL DEFAULT '江湖散修',
  points integer NOT NULL DEFAULT 0,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  coupons_count integer NOT NULL DEFAULT 0,
  merchant_status public.merchant_status NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- stores
-- =====================
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  address text,
  phone text,
  category text NOT NULL DEFAULT '综合',
  image_url text,
  banner_url text,
  rating numeric(3,1) DEFAULT 5.0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- store_categories
-- =====================
CREATE TABLE IF NOT EXISTS public.store_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- =====================
-- products
-- =====================
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL,
  original_price numeric(10,2),
  image_url text,
  stock integer NOT NULL DEFAULT 999,
  mood_tags text[] DEFAULT '{}',
  scene_tags text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- cart_items
-- =====================
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- =====================
-- orders
-- =====================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_no text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_amount numeric(10,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending_pay',
  payment_method public.payment_method,
  pay_expired_at timestamptz DEFAULT now() + interval '30 minutes',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- order_no 自动生成触发器
CREATE OR REPLACE FUNCTION generate_order_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.order_no := 'LS' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 1000000)::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_order_no ON public.orders;
CREATE TRIGGER trg_generate_order_no
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_no IS NULL OR NEW.order_no = '')
  EXECUTE FUNCTION generate_order_no();

-- =====================
-- order_items
-- =====================
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  store_name text,
  product_name text NOT NULL,
  product_image text,
  price numeric(10,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1
);

-- =====================
-- articles (UGC)
-- =====================
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  images text[] DEFAULT '{}',
  tags text[] DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- merchant_applications
-- =====================
CREATE TABLE IF NOT EXISTS public.merchant_applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  business_type text NOT NULL DEFAULT '餐饮',
  description text,
  status public.merchant_status NOT NULL DEFAULT 'pending',
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- announcements
-- =====================
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- 新增表（来自后续迁移）
-- =====================

-- commissions
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  level integer,
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- withdrawals
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  referee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- points_logs
CREATE TABLE IF NOT EXISTS public.points_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  points integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- user_addresses
CREATE TABLE IF NOT EXISTS public.user_addresses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- favorites
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- footprints
CREATE TABLE IF NOT EXISTS public.footprints (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- product_reviews
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating integer NOT NULL,
  content text,
  images text[] DEFAULT '{}',
  review_status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  discount numeric(10,2) NOT NULL,
  min_amount numeric(10,2) DEFAULT 0,
  is_used boolean DEFAULT false,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- handle_new_user 触发器（用户注册时自动创建 profile）
-- =====================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, phone, nickname, role, openid)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'username')::text,
    NEW.phone,
    COALESCE((NEW.raw_user_meta_data->>'nickname')::text, '江湖散修'),
    'user'::public.user_role,
    (NEW.raw_user_meta_data->>'openid')::text
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =====================
-- RLS (Row Level Security)
-- =====================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.footprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 辅助函数：获取用户角色
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- RLS Policies (先删除再创建，避免重复)
DROP POLICY IF EXISTS "admin_full_profiles" ON profiles;
DROP POLICY IF EXISTS "user_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "user_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "anon_no_profiles" ON profiles;
CREATE POLICY "admin_full_profiles" ON profiles FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);
CREATE POLICY "user_view_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "user_update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

DROP POLICY IF EXISTS "public_read_stores" ON stores;
DROP POLICY IF EXISTS "owner_manage_store" ON stores;
DROP POLICY IF EXISTS "admin_all_stores" ON stores;
CREATE POLICY "public_read_stores" ON stores FOR SELECT USING (is_active = true);
CREATE POLICY "owner_manage_store" ON stores FOR ALL TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "admin_all_stores" ON stores FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

DROP POLICY IF EXISTS "public_read_store_cats" ON store_categories;
DROP POLICY IF EXISTS "owner_manage_cats" ON store_categories;
CREATE POLICY "public_read_store_cats" ON store_categories FOR SELECT USING (true);
CREATE POLICY "owner_manage_cats" ON store_categories FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
);

DROP POLICY IF EXISTS "public_read_products" ON products;
DROP POLICY IF EXISTS "owner_manage_products" ON products;
DROP POLICY IF EXISTS "admin_all_products" ON products;
CREATE POLICY "public_read_products" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "owner_manage_products" ON products FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM stores WHERE id = products.store_id AND owner_id = auth.uid())
);
CREATE POLICY "admin_all_products" ON products FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

DROP POLICY IF EXISTS "user_own_cart" ON cart_items;
CREATE POLICY "user_own_cart" ON cart_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_own_orders" ON orders;
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
CREATE POLICY "user_own_orders" ON orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin_all_orders" ON orders FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

DROP POLICY IF EXISTS "user_view_order_items" ON order_items;
DROP POLICY IF EXISTS "user_insert_order_items" ON order_items;
CREATE POLICY "user_view_order_items" ON order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND user_id = auth.uid())
);
CREATE POLICY "user_insert_order_items" ON order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "public_read_articles" ON articles;
DROP POLICY IF EXISTS "user_manage_own_articles" ON articles;
CREATE POLICY "public_read_articles" ON articles FOR SELECT USING (is_published = true);
CREATE POLICY "user_manage_own_articles" ON articles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_own_application" ON merchant_applications;
DROP POLICY IF EXISTS "admin_all_applications" ON merchant_applications;
CREATE POLICY "user_own_application" ON merchant_applications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin_all_applications" ON merchant_applications FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

DROP POLICY IF EXISTS "public_read_announcements" ON announcements;
DROP POLICY IF EXISTS "admin_manage_announcements" ON announcements;
CREATE POLICY "public_read_announcements" ON announcements FOR SELECT USING (is_active = true);
CREATE POLICY "admin_manage_announcements" ON announcements FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- =====================
-- 测试数据（横笼铺 + 西瓜）
-- =====================

-- 先创建一个测试用户（等你在小程序注册后，把这里的 UUID 替换成真实的 auth.users ID）
-- 临时用一个固定 UUID，注册后手动更新
DO $$
DECLARE
  test_user_id uuid := 'e5c5a7a0-4b5c-4b5c-4b5c-4b5c4b5c4b5c';
  test_store_id uuid;
  test_category_id uuid;
  test_product_id uuid;
BEGIN
  -- 插入测试用户 profile
  INSERT INTO public.profiles (id, phone, nickname, role, merchant_status)
  VALUES (
    test_user_id,
    '18701410500',
    '测试商家',
    'user'::public.user_role,
    'approved'::public.merchant_status
  ) ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    nickname = EXCLUDED.nickname,
    merchant_status = EXCLUDED.merchant_status;

  -- 插入店铺：横笼铺
  INSERT INTO public.stores (id, owner_id, name, description, phone, category, address)
  VALUES (
    uuid_generate_v4(),
    test_user_id,
    '横笼铺',
    '新鲜水果，品质保证',
    '18701410500',
    '水果',
    '测试地址'
  )
  RETURNING id INTO test_store_id;

  -- 插入商品分类
  INSERT INTO public.store_categories (id, store_id, name, sort_order)
  VALUES (
    uuid_generate_v4(),
    test_store_id,
    '应季水果',
    0
  )
  RETURNING id INTO test_category_id;

  -- 插入商品：西瓜
  INSERT INTO public.products (id, store_id, category_id, name, description, price, original_price, stock, mood_tags, scene_tags, is_active)
  VALUES (
    uuid_generate_v4(),
    test_store_id,
    test_category_id,
    '西瓜',
    '麒麟西瓜，皮薄肉厚，甘甜多汁，应季鲜果',
    39.90,
    49.90,
    100,
    ARRAY['清爽', '解暑'],
    ARRAY['夏日', '应季'],
    true
  );

  -- 插入公告
  INSERT INTO public.announcements (content, is_active, sort_order)
  VALUES
    ('欢迎来到来店有喜！', true, 0),
    ('新用户注册送优惠券！', true, 1)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '测试数据创建成功！店铺ID: %, 请在小程序注册后更新 profiles.id 为真实的 auth.users ID', test_store_id;
END $$;

-- ============================================================
-- 重要提示：
-- 1. 运行此脚本后，在小程序用 18701410500 注册
-- 2. 注册成功后，去 Supabase Dashboard → Authentication → Users
--    找到你的用户 ID（UUID）
-- 3. 运行以下 SQL 更新店铺 owner_id：
--    UPDATE stores SET owner_id = '你的真实UUID' WHERE name = '横笼铺';
--    UPDATE profiles SET id = '你的真实UUID' WHERE phone = '18701410500';
-- ============================================================
