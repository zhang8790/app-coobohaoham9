
-- Enable UUID extension
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
-- profiles
-- =====================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE TABLE public.stores (
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
CREATE TABLE public.store_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- =====================
-- products
-- =====================
CREATE TABLE public.products (
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
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
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
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_no text UNIQUE NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_amount numeric(10,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending_pay',
  payment_method public.payment_method,
  pay_expired_at timestamptz DEFAULT now() + interval '30 minutes',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- order_no auto-generate trigger
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

CREATE TRIGGER trg_generate_order_no
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_no IS NULL OR NEW.order_no = '')
  EXECUTE FUNCTION generate_order_no();

-- =====================
-- order_items
-- =====================
CREATE TABLE public.order_items (
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
CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
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
CREATE TABLE public.merchant_applications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
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
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- handle_new_user trigger
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
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =====================
-- RLS
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

-- Helper: get role
CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

-- profiles
CREATE POLICY "admin_full_profiles" ON profiles FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);
CREATE POLICY "user_view_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "user_update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));
CREATE POLICY "anon_no_profiles" ON profiles FOR SELECT TO anon USING (false);

-- stores (public read)
CREATE POLICY "public_read_stores" ON stores FOR SELECT USING (is_active = true);
CREATE POLICY "owner_manage_store" ON stores FOR ALL TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "admin_all_stores" ON stores FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- store_categories (public read)
CREATE POLICY "public_read_store_cats" ON store_categories FOR SELECT USING (true);
CREATE POLICY "owner_manage_cats" ON store_categories FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
);

-- products (public read)
CREATE POLICY "public_read_products" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "owner_manage_products" ON products FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM stores WHERE id = products.store_id AND owner_id = auth.uid())
);
CREATE POLICY "admin_all_products" ON products FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- cart_items
CREATE POLICY "user_own_cart" ON cart_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- orders
CREATE POLICY "user_own_orders" ON orders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin_all_orders" ON orders FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- order_items
CREATE POLICY "user_view_order_items" ON order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND user_id = auth.uid())
);
CREATE POLICY "user_insert_order_items" ON order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND user_id = auth.uid())
);

-- articles
CREATE POLICY "public_read_articles" ON articles FOR SELECT USING (is_published = true);
CREATE POLICY "user_manage_own_articles" ON articles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- merchant_applications
CREATE POLICY "user_own_application" ON merchant_applications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admin_all_applications" ON merchant_applications FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- announcements (public read)
CREATE POLICY "public_read_announcements" ON announcements FOR SELECT USING (is_active = true);
CREATE POLICY "admin_manage_announcements" ON announcements FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);
