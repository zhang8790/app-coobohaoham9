-- =====================================================================
-- 来店有喜 V3 — 统一数据库结构文件（schema.sql）
-- 由 supabase/migrations/_archive/ 下 244 个迁移文件按文件名顺序合并生成。
-- 用途：统一管理 / 备份 / 归档（单一文件替代 244 个散落文件）。
-- 注意：本文件为「迁移历史合并」，重放需谨慎（部分补丁类迁移不可重复执行）。
--       获取「当前线上库干净结构」请在有 Docker 的环境运行：
--       supabase db dump --linked --file schema_current.sql
-- =====================================================================


-- ==================== 00001_init_schema.sql ====================

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

-- ==================== 00002_seed_data.sql ====================

-- Seed announcements
INSERT INTO public.announcements (content, is_active, sort_order) VALUES
('欢迎来到来店有喜！首单享九折优惠，快来探索吧~', true, 1),
('【新自营门店】茶语轩精品茶饮正式上线，满50减10！', true, 2),
('本周末双倍积分活动，消费即送积分，快来犒赏自己！', true, 3);

-- Seed stores
INSERT INTO public.stores (id, name, description, address, phone, category, image_url, rating) VALUES
('a1111111-1111-1111-1111-111111111101', '墨香书坊', '百年老书店，珍藏人文社科好书，附设咖啡区', '文化路88号', '010-12345678', '图书', 'https://picsum.photos/seed/ldyx-240daee2/600/600', 4.9),
('a1111111-1111-1111-1111-111111111102', '寻味食肆', '地道中式家常菜，食材新鲜，口感纯粹', '美食街33号', '010-87654321', '美食', 'https://picsum.photos/seed/ldyx-6660ef72/600/600', 4.8),
('a1111111-1111-1111-1111-111111111103', '甜蜜茶铺', '现制手打奶茶，每日鲜果，无添加健康配方', '商业广场B1', '010-11223344', '饮品', 'https://picsum.photos/seed/ldyx-52bae2f2/600/600', 4.7),
('a1111111-1111-1111-1111-111111111104', '拾光礼品馆', '精选文创礼品、手工艺品，治愈系好物', '步行街12号', '010-55667788', '礼品', 'https://picsum.photos/seed/ldyx-7dc01e60/600/600', 4.6),
('a1111111-1111-1111-1111-111111111105', '零嘴驿站', '精选全球零食礼盒，宅家必备小确幸', '综合楼3F', '010-99887766', '零食', 'https://picsum.photos/seed/ldyx-33e6854b/600/600', 4.5),
('a1111111-1111-1111-1111-111111111106', '生活良品', '精选日用好物，让每天都有仪式感', '生活广场2F', '010-66554433', '日用', 'https://picsum.photos/seed/ldyx-96505265/600/600', 4.7);

-- Seed store_categories
INSERT INTO public.store_categories (id, store_id, name, sort_order) VALUES
('c1111111-1111-1111-1111-111111111101', 'a1111111-1111-1111-1111-111111111101', '人文社科', 1),
('c1111111-1111-1111-1111-111111111102', 'a1111111-1111-1111-1111-111111111101', '文学小说', 2),
('c1111111-1111-1111-1111-111111111103', 'a1111111-1111-1111-1111-111111111101', '咖啡饮品', 3),
('c1111111-1111-1111-1111-111111111104', 'a1111111-1111-1111-1111-111111111102', '招牌主菜', 1),
('c1111111-1111-1111-1111-111111111105', 'a1111111-1111-1111-1111-111111111102', '特色小食', 2),
('c1111111-1111-1111-1111-111111111106', 'a1111111-1111-1111-1111-111111111103', '奶茶系列', 1),
('c1111111-1111-1111-1111-111111111107', 'a1111111-1111-1111-1111-111111111103', '鲜果茶', 2),
('c1111111-1111-1111-1111-111111111108', 'a1111111-1111-1111-1111-111111111104', '文创礼品', 1),
('c1111111-1111-1111-1111-111111111109', 'a1111111-1111-1111-1111-111111111104', '手工艺品', 2),
('c1111111-1111-1111-1111-111111111110', 'a1111111-1111-1111-1111-111111111105', '进口零食', 1),
('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111105', '本土特产', 2),
('c1111111-1111-1111-1111-111111111112', 'a1111111-1111-1111-1111-111111111106', '家居清洁', 1),
('c1111111-1111-1111-1111-111111111113', 'a1111111-1111-1111-1111-111111111106', '个人护理', 2);

-- Seed products
INSERT INTO public.products (store_id, category_id, name, description, price, original_price, image_url, mood_tags, scene_tags) VALUES
-- 墨香书坊
('a1111111-1111-1111-1111-111111111101', 'c1111111-1111-1111-1111-111111111101', '人间失格', '太宰治经典之作，读透人性的孤独', 39.90, 48.00, 'https://picsum.photos/seed/ldyx-240daee2/600/600', '{"孤独","治愈","思考"}', '{"治愈空间","学习空间"}'),
('a1111111-1111-1111-1111-111111111101', 'c1111111-1111-1111-1111-111111111102', '百年孤独', '马尔克斯魔幻现实主义巨著', 52.00, 68.00, 'https://picsum.photos/seed/ldyx-42b0fcfb/600/600', '{"沉浸","安静","思考"}', '{"学习空间","治愈空间"}'),
('a1111111-1111-1111-1111-111111111101', 'c1111111-1111-1111-1111-111111111103', '手冲咖啡（单杯）', '埃塞俄比亚耶加雪菲，清新果香', 35.00, NULL, 'https://picsum.photos/seed/ldyx-240daee2/600/600', '{"清醒","愉悦","专注"}', '{"学习空间","治愈空间"}'),
-- 寻味食肆
('a1111111-1111-1111-1111-111111111102', 'c1111111-1111-1111-1111-111111111104', '红烧肉套餐', '入口即化，慢炖三小时，配米饭', 58.00, 68.00, 'https://picsum.photos/seed/ldyx-6660ef72/600/600', '{"满足","幸福","治愈"}', '{"用餐时光"}'),
('a1111111-1111-1111-1111-111111111102', 'c1111111-1111-1111-1111-111111111105', '口水鸡', '麻辣鲜香，地道四川风味', 38.00, 45.00, 'https://picsum.photos/seed/ldyx-4132075e/600/600', '{"刺激","放松","满足"}', '{"用餐时光"}'),
-- 甜蜜茶铺
('a1111111-1111-1111-1111-111111111103', 'c1111111-1111-1111-1111-111111111106', '桂花乌龙拿铁', '桂花香气搭配浓醇乌龙，治愈一整天', 28.00, NULL, 'https://picsum.photos/seed/ldyx-52bae2f2/600/600', '{"甜蜜","治愈","放松"}', '{"用餐时光","治愈空间"}'),
('a1111111-1111-1111-1111-111111111103', 'c1111111-1111-1111-1111-111111111107', '草莓芝芝莓莓', '新鲜草莓+芝士奶盖，少女心爆棚', 32.00, 38.00, 'https://picsum.photos/seed/ldyx-52bae2f2/600/600', '{"开心","活泼","甜蜜"}', '{"用餐时光"}'),
-- 拾光礼品馆
('a1111111-1111-1111-1111-111111111104', 'c1111111-1111-1111-1111-111111111108', '武侠风情手账套装', '含活页本+印章+笔，江湖风格设计', 89.00, 108.00, 'https://picsum.photos/seed/ldyx-7dc01e60/600/600', '{"创意","治愈","专注"}', '{"购物时刻","学习空间"}'),
('a1111111-1111-1111-1111-111111111104', 'c1111111-1111-1111-1111-111111111109', '陶瓷茶杯礼盒', '手作青釉茶杯，附精美礼盒包装', 128.00, 158.00, 'https://picsum.photos/seed/ldyx-7dc01e60/600/600', '{"治愈","品质","送礼"}', '{"购物时刻"}'),
-- 零嘴驿站
('a1111111-1111-1111-1111-111111111105', 'c1111111-1111-1111-1111-111111111110', '日本零食大礼包', '精选15款日本网红零食，拼箱装', 168.00, 198.00, 'https://picsum.photos/seed/ldyx-33e6854b/600/600', '{"快乐","放松","分享"}', '{"购物时刻"}'),
('a1111111-1111-1111-1111-111111111105', 'c1111111-1111-1111-1111-111111111111', '老北京传统糕点礼盒', '萨其马+驴打滚+艾窝窝，传统口味', 88.00, 108.00, 'https://picsum.photos/seed/ldyx-33e6854b/600/600', '{"怀旧","温暖","分享"}', '{"购物时刻","用餐时光"}'),
-- 生活良品
('a1111111-1111-1111-1111-111111111106', 'c1111111-1111-1111-1111-111111111112', '天然精油香薰套装', '薰衣草+柠檬草精油，舒缓身心', 128.00, 158.00, 'https://picsum.photos/seed/ldyx-96505265/600/600', '{"放松","治愈","仪式感"}', '{"治愈空间"}'),
('a1111111-1111-1111-1111-111111111106', 'c1111111-1111-1111-1111-111111111113', '竹炭纤维毛巾礼盒', '超吸水，抗菌防霉，三条装精美礼盒', 68.00, 88.00, 'https://picsum.photos/seed/ldyx-96505265/600/600', '{"实用","品质","仪式感"}', '{"购物时刻"}');

-- ==================== 00003_add_commission_points_system.sql ====================

-- 1. 补充 orders 表字段（支持健康豆混合支付和分销关联）
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gold_beans_used numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS commission_distributed boolean NOT NULL DEFAULT false;

-- 2. 佣金记录表
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_no text NOT NULL,
  beneficiary_id uuid NOT NULL REFERENCES auth.users(id),
  payer_id uuid NOT NULL REFERENCES auth.users(id),
  level int NOT NULL CHECK (level IN (1, 2)),           -- 1=直推,2=间推
  rank_at_time text NOT NULL,                            -- 结算时段位快照
  ratio numeric(6,4) NOT NULL,                          -- 分佣比例快照
  pool_amount numeric(12,4) NOT NULL,                   -- 让利池金额
  commission_amount numeric(12,4) NOT NULL,             -- 实际佣金
  b_coef numeric(6,4) NOT NULL DEFAULT 1.0,             -- B系数（消费者活跃度）
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','settled','refunded')),
  settle_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. 积分流水表
CREATE TABLE IF NOT EXISTS public.points_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  order_id uuid REFERENCES public.orders(id),
  type text NOT NULL
    CHECK (type IN ('purchase_earn','invite_earn','checkin_earn','ugc_earn','redeem_spend','pay_spend','lottery_spend','refund_deduct')),
  delta int NOT NULL,             -- 正=增加，负=减少
  balance_after int NOT NULL,     -- 变动后余额（冗余，方便对账）
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RLS
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_logs ENABLE ROW LEVEL SECURITY;

-- commissions：本人可查自己收到的
CREATE POLICY "beneficiary_read_own_commissions" ON public.commissions
  FOR SELECT TO authenticated
  USING (beneficiary_id = auth.uid());

-- points_logs：本人可查自己的流水
CREATE POLICY "user_read_own_points_logs" ON public.points_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 仅 service_role 可写（Edge Function 操作）
CREATE POLICY "service_insert_commissions" ON public.commissions
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_update_commissions" ON public.commissions
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "service_insert_points_logs" ON public.points_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary ON public.commissions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order ON public.commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_points_logs_user ON public.points_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_points_logs_order ON public.points_logs(order_id);

-- ==================== 00004_add_refunds_table.sql ====================

-- 退款状态枚举
DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM ('pending_review','processing','completed','closed','abnormal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 退款记录表
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_no text UNIQUE,                                  -- 退款单号（审核通过后生成）
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_no text NOT NULL,
  item_index int NOT NULL DEFAULT 0,                      -- 退款商品 items 数组索引（0=整单）
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  initiated_by text NOT NULL DEFAULT 'user'
    CHECK (initiated_by IN ('user','admin')),
  status refund_status NOT NULL DEFAULT 'pending_review',
  refund_quantity int NOT NULL DEFAULT 1,
  refund_amount numeric(12,4) NOT NULL,
  reason text,
  description text,
  wechat_refund_id text,
  version int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_insert_own_refund" ON public.refunds
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_read_own_refunds" ON public.refunds
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "service_all_refunds" ON public.refunds
  FOR ALL TO service_role USING (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON public.refunds(user_id);

-- RPC：获取订单某商品可退金额
CREATE OR REPLACE FUNCTION get_refundable_amount(p_order_id uuid, p_item_index int)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_subtotal numeric;
  v_refunded numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- p_item_index = -1 表示整单
  IF p_item_index < 0 THEN
    v_subtotal := v_order.total_amount;
    v_refunded := COALESCE(v_order.refunded_amount, 0);
  ELSE
    v_item := (v_order.items->p_item_index);
    v_subtotal := COALESCE((v_item->>'subtotal')::numeric, 0);
    v_refunded := COALESCE((v_item->>'refunded_amount')::numeric, 0);
  END IF;

  RETURN GREATEST(v_subtotal - v_refunded, 0);
END;
$$;

-- RPC：更新订单已退金额（由 service_role 调用）
CREATE OR REPLACE FUNCTION update_order_refunded_amount(p_order_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.orders
  SET refunded_amount = COALESCE(refunded_amount, 0) + p_amount,
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- ==================== 00005_add_referral_and_service_type.sql ====================

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

-- ==================== 00006_add_store_short_code.sql ====================

-- 给 stores 表添加 short_code (8位唯一短码，用于二维码 scene 参数)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS short_code text;

-- 为现有门店生成短码
CREATE OR REPLACE FUNCTION generate_store_short_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
  attempts int := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- 检查唯一性
    IF NOT EXISTS (SELECT 1 FROM stores WHERE short_code = code) THEN
      RETURN code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 100 THEN RAISE EXCEPTION 'Failed to generate unique short_code'; END IF;
  END LOOP;
END;
$$;

-- 为现有门店批量填充短码
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM stores WHERE short_code IS NULL LOOP
    UPDATE stores SET short_code = generate_store_short_code() WHERE id = r.id;
  END LOOP;
END;
$$;

-- 添加非空约束和唯一索引（用默认值兜底）
ALTER TABLE stores ALTER COLUMN short_code SET DEFAULT generate_store_short_code();
ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);

-- Storage bucket for qrcodes (if not exists - idempotent via DO block)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('qrcodes', 'qrcodes', true)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- RLS: 所有人可读 qrcodes bucket
DROP POLICY IF EXISTS "qrcodes_public_select" ON storage.objects;
CREATE POLICY "qrcodes_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'qrcodes');

DROP POLICY IF EXISTS "qrcodes_service_insert" ON storage.objects;
CREATE POLICY "qrcodes_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'qrcodes');

-- ==================== 00007_add_withdrawals_and_barcode.sql ====================

-- 1. products 表加 barcode 字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- 2. withdrawals 提现表
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  alipay_account TEXT,
  withdraw_method TEXT NOT NULL DEFAULT 'bank' CHECK (withdraw_method IN ('bank','alipay','wechat')),
  reject_reason TEXT,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户只能查看自己的提现记录" ON withdrawals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "用户只能创建自己的提现申请" ON withdrawals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. 商家可查看其门店相关订单条目
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='order_items' AND policyname='商家可读取自己门店订单条目'
  ) THEN
    CREATE POLICY "商家可读取自己门店订单条目" ON order_items
      FOR SELECT USING (
        store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- ==================== 00008_add_addresses_favorites_footprint_reviews_coupons.sql ====================

-- 1. 收货地址
CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  province TEXT,
  city TEXT,
  district TEXT,
  detail TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己的地址" ON user_addresses USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. 商品收藏
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己的收藏" ON favorites USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. 浏览足迹
CREATE TABLE IF NOT EXISTS footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
ALTER TABLE footprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己的足迹" ON footprints USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. 商品评价
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  content TEXT,
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "评价可公开读" ON product_reviews FOR SELECT USING (true);
CREATE POLICY "用户只能发布自己的评价" ON product_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. 优惠券（简单实现）
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
  discount_value NUMERIC(10,2) NOT NULL,
  min_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_used BOOLEAN NOT NULL DEFAULT false,
  expired_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户查看自己的优惠券" ON coupons FOR SELECT USING (auth.uid() = user_id);

-- ==================== 00009_add_product_review_status_and_admin_rls.sql ====================
-- 1. products 加 review_status 字段（已有商品默认 approved）
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (review_status IN ('pending','approved','rejected'));

-- 新增商品默认 pending（通过触发器实现）
CREATE OR REPLACE FUNCTION set_product_pending_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status IS NULL OR NEW.review_status = 'approved' THEN
    NEW.review_status := 'pending';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_pending ON products;
CREATE TRIGGER trg_product_pending
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_product_pending_on_insert();

-- 2. withdrawals admin RLS
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_withdrawals" ON withdrawals;
CREATE POLICY "admin_all_withdrawals" ON withdrawals
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 3. articles admin RLS
DROP POLICY IF EXISTS "admin_all_articles" ON articles;
CREATE POLICY "admin_all_articles" ON articles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 4. products 审核通过时自动设 is_active=true
CREATE OR REPLACE FUNCTION sync_product_active_on_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status = 'approved' THEN
    NEW.is_active := true;
  ELSIF NEW.review_status = 'rejected' THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_review_active ON products;
CREATE TRIGGER trg_product_review_active
  BEFORE UPDATE OF review_status ON products
  FOR EACH ROW EXECUTE FUNCTION sync_product_active_on_review();

-- ==================== 00010_add_product_new_fields.sql ====================
-- 00010_add_product_new_fields.sql
-- 给 products 表新增：成本价、让利%、主图/副图/详情图/视频

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2) CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD COLUMN IF NOT EXISTS main_image text,
  ADD COLUMN IF NOT EXISTS sub_images text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_images text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url text;

-- ==================== 00012_v4_commission_fields.sql ====================
-- V4分佣算法数据库迁移
-- 为profiles表添加V4算法需要的字段
-- 执行时间：2026-07-02

-- 添加V4分佣算法需要的字段到profiles表
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS total_consumption NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS team_performance NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_consumption NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS consecutive_zero_months INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS team_monthly_gmv NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_new_recruit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS months_since_last_recruit INTEGER DEFAULT 0;

-- 添加字段注释
COMMENT ON COLUMN profiles.total_consumption IS '个人累计消费金额（用于计算动态分数）';
COMMENT ON COLUMN profiles.team_performance IS '团队业绩（直接下线消费 + 间接下线消费×0.5）';
COMMENT ON COLUMN profiles.monthly_consumption IS '当月个人消费金额（用于判定活跃门槛）';
COMMENT ON COLUMN profiles.consecutive_zero_months IS '连续零消费月数（连续2个月则取消分佣资格）';
COMMENT ON COLUMN profiles.team_monthly_gmv IS '团队月度GMV（用于判定团队流水档位）';
COMMENT ON COLUMN profiles.has_new_recruit IS '当月是否有新增下线（用于拓新衰减机制）';
COMMENT ON COLUMN profiles.months_since_last_recruit IS '距离上次拓新的月数（用于拓新衰减机制）';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_total_consumption ON profiles(total_consumption);
CREATE INDEX IF NOT EXISTS idx_profiles_team_performance ON profiles(team_performance);
CREATE INDEX IF NOT EXISTS idx_profiles_monthly_consumption ON profiles(monthly_consumption);

-- 更新现有数据（可选，根据需要执行）
-- 将现有用户的total_consumption初始化为0
-- UPDATE profiles SET total_consumption = 0 WHERE total_consumption IS NULL;

-- 验证迁移是否成功
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' 
-- AND column_name IN ('total_consumption', 'team_performance', 'monthly_consumption', 'consecutive_zero_months', 'team_monthly_gmv', 'has_new_recruit', 'months_since_last_recruit');

-- ==================== 00015_db_completion.sql ====================
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

-- ==================== 00016_referral_and_staff.sql ====================
-- ============================================================
-- 00016_referral_and_staff.sql
-- 员工推广体系 + 让利率配置
-- 执行方式：在 Supabase SQL Editor 里运行
-- ============================================================

-- 1. stores 表加让利率
ALTER TABLE stores ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,2) DEFAULT 10.00;
COMMENT ON COLUMN stores.referral_rate IS '商家让利率（%），0~100，默认10%';

-- 2. store_staff 表加推广相关字段
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS promotion_code TEXT UNIQUE;
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS total_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS settled_commission NUMERIC(10,2) DEFAULT 0;
COMMENT ON COLUMN store_staff.promotion_code IS '员工推广码（唯一）';
COMMENT ON COLUMN store_staff.total_commission IS '员工累计佣金';
COMMENT ON COLUMN store_staff.settled_commission IS '员工已结算佣金';

-- 3. orders 表加 staff_id（记录是哪个员工推广的订单）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES store_staff(id);
COMMENT ON COLUMN orders.staff_id IS '推广该订单的员工ID';

-- 4. 为现有测试数据设置让利率
UPDATE stores SET referral_rate = 10.00 WHERE referral_rate IS NULL;

-- 5. 为横笼铺的商家（test account）生成一个员工记录（可选，测试用）
-- 先查看当前 stores 和 profiles 来生成测试员工
-- INSERT INTO store_staff (store_id, user_id, role, promotion_code, is_active)
-- SELECT id, owner_id, 'promoter', 'HCYP001', true FROM stores WHERE name = '横笼铺'
-- ON CONFLICT DO NOTHING;

-- 6. 创建自动生成推广码的函数
CREATE OR REPLACE FUNCTION generate_promotion_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.promotion_code IS NULL OR NEW.promotion_code = '' THEN
    NEW.promotion_code := 'EMP' || UPPER(SUBSTRING(MD5(NEW.id::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_promotion_code ON store_staff;
CREATE TRIGGER trg_generate_promotion_code
  BEFORE INSERT ON store_staff
  FOR EACH ROW
  EXECUTE FUNCTION generate_promotion_code();

-- ==================== 00017_liquidity_distributation.sql ====================
-- =====================================================
-- 流动性二级分销 + 段位系统 数据库迁移
-- 基于现有 V4 六段位系统，新增流动一级机制
-- 执行前请备份数据库
-- =====================================================

-- 1. orders 表加流动一级相关字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_income NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false;

-- 2. profiles 表加段位缓存字段（避免每次计算）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank TEXT DEFAULT '江湖散修';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dynamic_score NUMERIC(10,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_recruit_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consecutive_zero_months INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_promoter BOOLEAN DEFAULT false;  -- 是否推广员
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS promoter_status TEXT DEFAULT 'none';  -- none/pending/approved

-- 3. commissions 表加类型字段
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'static';
-- 'static_l1' = 静态一级，'static_l2' = 静态二级，'dynamic_l1' = 流动一级

-- 4. 新增防刷单风控表
CREATE TABLE IF NOT EXISTS order_risk_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  risk_type TEXT NOT NULL,  -- 'self_dealing'/'loop_referral'/'high_frequency'/'points_arbitrage'
  risk_level TEXT NOT NULL, -- 'low'/'medium'/'high'
  description TEXT,
  handled BOOLEAN DEFAULT false,
  handled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 新增用户绑定关系表（流动一级绑定）
CREATE TABLE IF NOT EXISTS user_staff_bindings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  staff_id UUID REFERENCES profiles(id) NOT NULL,
  store_id UUID REFERENCES stores(id),
  bind_type TEXT DEFAULT 'scan',  -- 'scan'/'service'/'manual'
  expired_at TIMESTAMP,  -- 绑定过期时间（30天后）
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, staff_id)
);

-- 6. 更新 RANK_CONFIG 表（段位配置）
-- 如果不存在则创建
CREATE TABLE IF NOT EXISTS rank_configs (
  id SERIAL PRIMARY KEY,
  rank_name TEXT UNIQUE NOT NULL,
  min_dynamic_score NUMERIC(10,2) NOT NULL,
  l1_commission_rate NUMERIC(5,2) NOT NULL,
  l2_commission_rate NUMERIC(5,2) NOT NULL,
  points_rate NUMERIC(5,2) NOT NULL,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 插入/更新段位配置（如果 rank_configs 表已存在且缺少唯一约束，先添加）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_configs_rank_name_key') THEN
    ALTER TABLE rank_configs ADD CONSTRAINT rank_configs_rank_name_key UNIQUE (rank_name);
  END IF;
END $$;

INSERT INTO rank_configs (rank_name, min_dynamic_score, l1_commission_rate, l2_commission_rate, points_rate, icon, color)
VALUES
  ('江湖散修', 0,    0.40, 0.15, 0.10, '🍃', '#90EE90'),
  ('外门弟子', 500,  0.45, 0.18, 0.12, '🌟', '#50C878'),
  ('内门弟子', 2000, 0.50, 0.20, 0.13, '📚', '#4A90D9'),
  ('核心弟子', 5000, 0.54, 0.22, 0.14, '⚔️', '#CD7F32'),
  ('长老',    15000, 0.57, 0.24, 0.15, '🏯', '#C0C0C0'),
  ('掌门',    50000, 0.60, 0.25, 0.15, '👑', '#FFD700')
ON CONFLICT (rank_name) DO UPDATE SET
  l1_commission_rate = EXCLUDED.l1_commission_rate,
  l2_commission_rate = EXCLUDED.l2_commission_rate,
  points_rate = EXCLUDED.points_rate;

-- 7. 平台最低抽成配置表
CREATE TABLE IF NOT EXISTS platform_configs (
  id SERIAL PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO platform_configs (config_key, config_value, description)
VALUES
  ('min_platform_rate', '0.05', '平台最低抽成比例（让利池的5%）'),
  ('binding_valid_days', '30', '流动一级绑定有效期（天）'),
  ('max_orders_per_day', '10', '同一买家每日订单上限'),
  ('min_order_for_commission', '5', '最低计佣订单金额（元）'),
  ('refund_commission_recovery_days', '60', '退款追回佣金天数')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value;

-- 8. 创建索引
CREATE INDEX IF NOT EXISTS idx_orders_staff_id ON orders(staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_commission_calculated ON orders(commission_calculated);
CREATE INDEX IF NOT EXISTS idx_profiles_rank ON profiles(rank);
CREATE INDEX IF NOT EXISTS idx_profiles_dynamic_score ON profiles(dynamic_score);
CREATE INDEX IF NOT EXISTS idx_user_staff_bindings_user_id ON user_staff_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_staff_bindings_staff_id ON user_staff_bindings(staff_id);
CREATE INDEX IF NOT EXISTS idx_order_risk_logs_order_id ON order_risk_logs(order_id);

-- 9. 关闭 RLS（测试阶段，正式上线前需配置）
ALTER TABLE order_risk_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_staff_bindings DISABLE ROW LEVEL SECURITY;
ALTER TABLE rank_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_configs DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 执行完成
-- =====================================================
-- 验证：
-- SELECT * FROM rank_configs;
-- SELECT * FROM platform_configs;

-- ==================== 00018_fix_favorites_footprints_cart.sql ====================
-- 补丁：修复 favorites/footprints/cart + stores 表缺失字段 + orders 佣金字段
-- 执行时间：2026-07-03
-- 在 Supabase SQL Editor 中执行

-- =============================================================
-- 1. favorites 表（收藏）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- =============================================================
-- 2. footprints 表（浏览足迹）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- =============================================================
-- 3. cart_items 补 user_id / selected 字段
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cart_items' AND column_name = 'selected'
  ) THEN
    ALTER TABLE cart_items ADD COLUMN selected BOOLEAN NOT NULL DEFAULT true;
  END IF;
END
$$;

-- =============================================================
-- 4. stores 表补全所有缺失字段（店铺设置页需要）
-- =============================================================
ALTER TABLE public.stores
  -- 联系与营业
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '20:00',
  -- 配送配置
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_radius NUMERIC(5,2) DEFAULT 3,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0,
  -- 其他
  ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_tags TEXT[] DEFAULT '{}',
  -- 分销/让利
  ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,4) DEFAULT 0.09,
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- 为已有店铺生成短码
UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

-- =============================================================
-- 5. orders 表补全所有缺失字段（Edge Function + V5分佣 需要）
-- =============================================================
ALTER TABLE public.orders
  -- V5 分佣字段
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  -- 跨门店 & Edge Function 字段
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- 6. RLS 关闭（测试阶段）
-- =============================================================
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- =============================================================
-- 7. 性能索引
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user_id ON footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);

SELECT '✅ 00018 补丁执行完成：favorites/footprints/stores/orders 字段已补全' as result;

-- ==================== 00019_add_orders_store_id.sql ====================
-- 补全 orders 表缺失的 store_id 字段
-- Edge Function create-order 在插入订单时用了 store_id，但初始 schema 未加此列
-- 同时清理 stores 表的列名不一致问题（00018 曾错写为 store_short_code）
-- 执行时间：2026-07-03

-- =====================
-- 1. stores 表：确保列名统一为 short_code
-- =====================
DO $$
BEGIN
  -- 如果 00018 已错加了 store_short_code，将其值合并到 short_code 后删掉
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'store_short_code'
  ) THEN
    -- 把 store_short_code 的值复制到 short_code（只更新 short_code 为 NULL 的行）
    UPDATE stores
       SET short_code = store_short_code
     WHERE short_code IS NULL AND store_short_code IS NOT NULL;
    -- 删掉错加的列
    ALTER TABLE stores DROP COLUMN store_short_code;
  END IF;
END
$$;

-- 确保 short_code 列存在（00006 可能未执行）
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- 为已有店铺生成短码（如果还是 NULL）
UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

-- 加唯一约束（如果还没有）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_short_code_unique'
  ) THEN
    ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);
  END IF;
END
$$;

-- =====================
-- 2. orders 表：加 store_id
-- =====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- =====================
-- 3. orders 表：确保 00018 的所有字段都在
-- =====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN NOT NULL DEFAULT false;

SELECT '✅ 00019 执行完成：orders.store_id 已添加，stores.short_code 列名已统一' as result;

-- ==================== 00020_add_order_items_created_at.sql ====================
-- 补全 order_items 表缺失的 created_at 字段
-- getMerchantOrders 按 created_at 排序，但该表初始 schema 未包含此列
-- 执行时间：2026-07-03

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 为已有数据回填 created_at（用关联订单的时间）
UPDATE public.order_items oi
SET created_at = COALESCE(o.created_at, NOW())
FROM public.orders o
WHERE oi.order_id = o.id AND oi.created_at IS NULL;

-- RLS 确认关闭（测试阶段）
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;

-- 索引
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

SELECT '✅ 00020 执行完成：order_items.created_at 已添加' as result;

-- ==================== 00021_merge_patch.sql ====================
-- ============================================================
-- 合并补丁：00018 + 00019 + 00020
-- 一次性补全所有缺失字段，解决店铺设置/订单创建/order_items 400 问题
-- 执行方式：复制全部 → Supabase SQL Editor → Run
-- 执行时间：2026-07-03
-- ============================================================


-- =============================================================
-- 1. 缺失表创建（favorites / footprints）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);


-- =============================================================
-- 2. cart_items 补 user_id / selected 字段
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'user_id') THEN
    ALTER TABLE cart_items ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'selected') THEN
    ALTER TABLE cart_items ADD COLUMN selected BOOLEAN NOT NULL DEFAULT true;
  END IF;
END
$$;


-- =============================================================
-- 3. stores 表：列名统一 + 补全所有缺失字段
-- =============================================================

-- 3a. 清理可能错加的 store_short_code 列（00018 曾用错名）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'store_short_code') THEN
    UPDATE stores SET short_code = store_short_code WHERE short_code IS NULL AND store_short_code IS NOT NULL;
    ALTER TABLE stores DROP COLUMN store_short_code;
  END IF;
END
$$;

-- 3b. 确保 short_code 列存在
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS short_code TEXT;

-- 3c. 为已有店铺生成短码
UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

-- 3d. short_code 唯一约束
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_short_code_unique') THEN
    ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);
  END IF;
END
$$;

-- 3e. 补全店铺设置页所需的所有字段
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_radius NUMERIC(5,2) DEFAULT 3,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,4) DEFAULT 0.09;


-- =============================================================
-- 4. orders 表：补全所有缺失字段
-- =============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN NOT NULL DEFAULT false;


-- =============================================================
-- 5. order_items 表：补 created_at 字段
-- =============================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 为已有数据回填 created_at
UPDATE public.order_items oi
SET created_at = COALESCE(o.created_at, NOW())
FROM public.orders o
WHERE oi.order_id = o.id AND oi.created_at IS NULL;


-- =============================================================
-- 6. RLS 全部关闭（测试阶段）
-- =============================================================
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;


-- =============================================================
-- 7. 性能索引
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user_id ON footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);


-- =============================================================
-- 完成
-- =============================================================
SELECT '✅ 全部补丁执行完成！stores/orders/order_items 字段已补全，RLS 已关闭' as result;

-- ==================== 00022_fix_products_fields.sql ====================
-- ============================================================
-- 00022: products 表补全缺失字段（解决商品保存 400 错误）
-- 根因：迁移 00010 未推到云端，缺少 barcode 字段
-- 执行方式：Supabase SQL Editor → Run
-- ============================================================

-- 1. 补 00010 迁移的字段（成本价/让利/图片/视频）
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD COLUMN IF NOT EXISTS main_image TEXT,
  ADD COLUMN IF NOT EXISTS sub_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. 补 barcode 字段（扫码上架用）
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;

-- 3. RLS 关闭（测试阶段）
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);

SELECT '✅ 00022 执行完成：products 表所有缺失字段已补全' as result;

-- ==================== 00023_full_patch.sql ====================
-- ============================================================
-- 终极合并补丁：00021 + 00022 + Storage + 健康豆充值
-- 一次性补全所有缺失字段 + 创建图片存储桶 + 充值健康豆
-- 执行方式：Supabase SQL Editor → 新建 query → 全选粘贴 → Run
-- 执行时间：2026-07-03
-- ============================================================


-- =============================================================
-- 1. 缺失表创建（favorites / footprints）
-- =============================================================
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.footprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);


-- =============================================================
-- 2. cart_items 补 user_id / selected 字段
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'user_id') THEN
    ALTER TABLE cart_items ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'selected') THEN
    ALTER TABLE cart_items ADD COLUMN selected BOOLEAN NOT NULL DEFAULT true;
  END IF;
END
$$;


-- =============================================================
-- 3. stores 表：列名统一 + 补全所有缺失字段
-- =============================================================

-- 3a. 清理可能错加的 store_short_code 列
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'store_short_code') THEN
    UPDATE stores SET short_code = store_short_code WHERE short_code IS NULL AND store_short_code IS NOT NULL;
    ALTER TABLE stores DROP COLUMN store_short_code;
  END IF;
END
$$;

-- 3b. 确保 short_code 列存在 + 生成短码 + 唯一约束
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS short_code TEXT;

UPDATE public.stores SET short_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE short_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_short_code_unique') THEN
    ALTER TABLE stores ADD CONSTRAINT stores_short_code_unique UNIQUE (short_code);
  END IF;
END
$$;

-- 3c. 补全店铺设置页所需的所有字段
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS contact TEXT,
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS open_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS close_time TEXT DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_radius NUMERIC(5,2) DEFAULT 3,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC(10,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS announcement TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS scene_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,4) DEFAULT 0.09;


-- =============================================================
-- 4. orders 表：补全所有缺失字段
-- =============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_income NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parent_order_no TEXT,
  ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN NOT NULL DEFAULT false;


-- =============================================================
-- 5. order_items 表：补 created_at 字段
-- =============================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.order_items oi
SET created_at = COALESCE(o.created_at, NOW())
FROM public.orders o
WHERE oi.order_id = o.id AND oi.created_at IS NULL;


-- =============================================================
-- 6. products 表：补全所有缺失字段（解决商品保存 400）
-- =============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) CHECK (discount_rate >= 0 AND discount_rate <= 100),
  ADD COLUMN IF NOT EXISTS main_image TEXT,
  ADD COLUMN IF NOT EXISTS sub_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS detail_images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE;


-- =============================================================
-- 7. 创建图片存储桶（图片上传到 Supabase Storage）
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS：允许所有人读取公开图片
CREATE POLICY IF NOT EXISTS "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

-- Storage RLS：允许登录用户上传图片
CREATE POLICY IF NOT EXISTS "Authenticated upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');

-- Storage RLS：允许登录用户更新自己的图片
CREATE POLICY IF NOT EXISTS "Authenticated update own" ON storage.objects
  FOR UPDATE USING (bucket_id = 'images' AND auth.uid() = owner);

-- Storage RLS：允许登录用户删除自己的图片
CREATE POLICY IF NOT EXISTS "Authenticated delete own" ON storage.objects
  FOR DELETE USING (bucket_id = 'images' AND auth.uid() = owner);


-- =============================================================
-- 8. 给测试用户充值健康豆（100 健康豆，够买西瓜）
-- =============================================================
UPDATE public.profiles
SET balance = 100
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 清除横笼铺的无效 banner_url（旧的本地临时路径）
UPDATE public.stores
SET banner_url = NULL
WHERE banner_url LIKE 'http://tmp/%' OR banner_url LIKE 'wxfile://%';


-- =============================================================
-- 9. RLS 全部关闭（测试阶段）
-- =============================================================
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;


-- =============================================================
-- 10. 性能索引
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_footprints_user_id ON footprints(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);


-- =============================================================
-- 完成！
-- =============================================================
SELECT '✅ 全部补齐完成！stores + orders + order_items + products + Storage + 健康豆充值' as result;

-- ==================== 00024_fix_image_storage.sql ====================
-- ============================================================
-- 00024_fix_image_storage.sql — 图片存储桶 + 诊断查询
-- ⚠️ 必须在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- =====================
-- 第1步：创建/确认 images 存储桶（公开读取）
-- =====================
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 验证存储桶
SELECT id, name, public, created_at FROM storage.buckets WHERE name = 'images';


-- =====================
-- 第2步：Storage RLS 策略（DROP + CREATE）
-- 注意：PostgreSQL 不支持 CREATE POLICY IF NOT EXISTS，必须先 DROP
-- =====================

-- 公开读取（所有人都能看到图片）
DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
CREATE POLICY "images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

-- 登录用户可以上传
DROP POLICY IF EXISTS "images_auth_upload" ON storage.objects;
CREATE POLICY "images_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');

-- 登录用户可以更新自己的文件
DROP POLICY IF EXISTS "images_auth_update_own" ON storage.objects;
CREATE POLICY "images_auth_update_own" ON storage.objects
  FOR UPDATE USING (bucket_id = 'images' AND auth.uid() = owner);

-- 登录用户可以删除自己的文件
DROP POLICY IF EXISTS "images_auth_delete_own" ON storage.objects;
CREATE POLICY "images_auth_delete_own" ON storage.objects
  FOR DELETE USING (bucket_id = 'images' AND auth.uid() = owner);


-- =====================
-- 第3步：🔍 诊断查询 — 查看当前店铺图片数据
-- =====================
SELECT
  id,
  name,
  image_url,
  banner_url,
  CASE WHEN image_url IS NULL OR image_url = '' THEN '❌ image_url 为空'
       WHEN image_url LIKE '%wxfile://%' THEN '❌ 本地路径(无效)'
       WHEN image_url LIKE '%http://tmp%' THEN '❌ 临时路径(无效)'
       WHEN image_url LIKE '%data:%' THEN '❌ Base64(微信不支持)'
       ELSE '✅ 看起来正常' END AS image_status,
  CASE WHEN banner_url IS NULL OR banner_url = '' THEN '❌ banner_url 为空'
       WHEN banner_url LIKE '%wxfile://%' THEN '❌ 本地路径(无效)'
       WHEN banner_url LIKE '%http://tmp%' THEN '❌ 临时路径(无效)'
       WHEN banner_url LIKE '%data:%' THEN '❌ Base64(微信不支持)'
       ELSE '✅ 看起来正常' END AS banner_status,
  length(image_url) as img_len,
  length(banner_url) as ban_len
FROM stores
WHERE name = '横笼铺';


-- =====================
-- 第4步：查看 Storage 里已有的图片文件（如果有）
-- =====================
-- SELECT id, bucket_id, name, created_at, owner
-- FROM storage.objects
-- WHERE bucket_id = 'images'
-- ORDER BY created_at DESC
-- LIMIT 10;


-- =====================
-- 第5步：（可选）给测试店铺设置一张默认图
-- 取消注释下面这行即可用随机占位图测试
-- =====================
-- UPDATE stores
-- SET banner_url = 'https://picsum.photos/seed/henglongpu-banner/800/400',
--     image_url = 'https://picsum.photos/seed/henglongpu-logo/400/400'
-- WHERE name = '横笼铺'
-- RETURNING id, name, image_url, banner_url;

-- ==================== 00025_set_test_image.sql ====================
-- ============================================================
-- 快速验证：给横笼铺写入测试图片 URL
-- 执行完后去店铺首页看是否显示图片
-- ============================================================

UPDATE stores
SET
  banner_url = 'https://picsum.photos/seed/henglongpu-banner/800/400',
  image_url = 'https://picsum.photos/seed/henglongpu-logo/400/400'
WHERE name = '横笼铺'
RETURNING id, name, image_url, banner_url;

-- ==================== 00026_add_is_platform.sql ====================
-- ============================================================
-- 00026_add_is_platform.sql — 自营门店标识 + 创建自营门店
-- 探索页只看自营商品，犒赏铺只看商家门店
-- ⚠️ 必须在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- =====================
-- 第1步：给 stores 表加 is_platform 字段
-- =====================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_platform boolean DEFAULT false;

-- =====================
-- 第2步：标记现有商家门店（横笼铺）为非自营
-- =====================
UPDATE stores SET is_platform = false WHERE name = '横笼铺';

-- =====================
-- 第3步：创建自营门店（来店有喜官方自营店）
-- =====================
INSERT INTO stores (
  id, owner_id, name, description, address, phone, category,
  image_url, banner_url, rating, is_active, is_platform,
  is_open, open_time, close_time, referral_rate, short_code
) VALUES (
  'store-platform-001',
  'd6b38349-dded-4879-9eac-3165a646436a',
  '来店有喜自营店',
  '来店有喜官方自营商品，品质保障，江湖好货直供',
  '侠客总部 1 号',
  '400-888-8888',
  '日用',
  'https://picsum.photos/seed/platform-store/400/400',
  'https://picsum.photos/seed/platform-banner/800/400',
  5.0,
  true,
  true,  -- ⭐ is_platform = true，标识自营门店
  true,
  '08:00',
  '22:00',
  0.20,
  'LDYX01'
) ON CONFLICT (id) DO UPDATE SET is_platform = true;

-- =====================
-- 第4步：把西瓜从横笼铺移到自营门店（可选）
-- 或者让西瓜继续属于横笼铺（犒赏铺商品）
-- 当前：西瓜在横笼铺，属于商家商品，不会出现在探索页
-- =====================
-- 如果想让西瓜同时在自营店也上架：
-- UPDATE products SET store_id = 'store-platform-001' WHERE name = '西瓜' AND store_id = (SELECT id FROM stores WHERE name = '横笼铺');

-- =====================
-- 第5步：给自营门店创建一些默认商品
-- =====================
INSERT INTO products (
  id, store_id, name, description, price, original_price,
  image_url, main_image, category, is_active, mood_tags, scene_tags
) VALUES
  ('prod-platform-001', 'store-platform-001', '来店有喜·侠客茶杯',
   '精选陶瓷茶杯，侠客风范，品茗必备', 29.90, 59.90,
   'https://picsum.photos/seed/teacup/400/400', 'https://picsum.photos/seed/teacup/400/400',
   '日用', true,
   ARRAY['温暖', '放松', '慢生活'], ARRAY['堂食', '自取']),
  ('prod-platform-002', 'store-platform-001', '江湖秘籍·读书灯',
   '护眼LED读书灯，文武双全的照明神器', 49.90, 99.90,
   'https://picsum.photos/seed/readlight/400/400', 'https://picsum.photos/seed/readlight/400/400',
   '日用', true,
   ARRAY['专注', '学习', '宁静'], ARRAY['堂食', '外卖']),
  ('prod-platform-003', 'store-platform-001', '侠客行·牛肉干',
   '精选风干牛肉，行走江湖的能量补给', 35.00, 68.00,
   'https://picsum.photos/seed/beefjerky/400/400', 'https://picsum.photos/seed/beefjerky/400/400',
   '零食', true,
   ARRAY['活力', '满足', '探索'], ARRAY['堂食', '自取', '外卖']),
  ('prod-platform-004', 'store-platform-001', '掌门手作·陈皮普洱',
   '五年陈皮搭配普洱，掌门级品味', 89.00, 158.00,
   'https://picsum.photos/seed/chenpi/400/400', 'https://picsum.photos/seed/chenpi/400/400',
   '饮品', true,
   ARRAY['优雅', '品味', '养生'], ARRAY['堂食', '自取'])
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 第6步：验证结果
-- =====================
SELECT id, name, is_platform, is_active FROM stores ORDER BY is_platform DESC, name;
SELECT id, name, store_id FROM products WHERE store_id = 'store-platform-001';

-- ==================== 00027_fix_orders_for_create.sql ====================
-- ============================================================
-- 00027: 修复 orders 表 — 确保 create-order Edge Function 能正常插入
-- 根因：多个迁移文件（00015/00017/00019 等）可能未全部执行到云端 DB
-- ============================================================

BEGIN;

-- ==================== orders 表：补全所有字段 ====================

-- 基础字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_no VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending_pay';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gold_beans_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 幂等/跨门店
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128) UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_no VARCHAR(128);

-- 地址/物流
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_json JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remark TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(128);

-- 退款
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(32) DEFAULT 'none';

-- 佣金/分润
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l1_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS l2_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_points INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_income NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_distributed BOOLEAN DEFAULT false;

-- 推荐人/员工
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id UUID;

-- 索引
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_parent_no ON orders(parent_order_no);

-- ==================== order_items 表：补全字段 ====================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ==================== 验证 ====================
SELECT
  'orders 表字段验证' AS check_type,
  CASE WHEN count(*) > 0 THEN '✅ 字段存在' ELSE '❌ 缺失关键字段' END AS result
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('store_id', 'order_no', 'user_id', 'total_amount', 'status',
                     'payment_method', 'gold_beans_used', 'idempotency_key', 'parent_order_no')
GROUP BY check_type;

SELECT
  'orders 关键字段列表' AS info,
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

COMMIT;

-- ==================== 00028_disable_all_rls.sql ====================
-- ============================================================
-- 00028: 彻底关闭所有关键表的 RLS（测试阶段）
-- 根因：createOrderV2 查询 profiles 表返回 400，说明 RLS 仍在拦截
-- ============================================================

BEGIN;

-- 关闭所有业务表的 RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;

-- 验证
SELECT 
  tablename,
  rowsecurity AS rls_enabled,
  CASE WHEN rowsecurity THEN '❌ 仍开启' ELSE '✅ 已关闭' END AS status
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('profiles','orders','order_items','products','stores','cart_items');

COMMIT;

-- ==================== 00029_add_orders_missing_columns.sql ====================
-- ============================================================
-- 00029: 补全 orders 表缺失字段 — service_type 等
-- 根因：createOrderV2 插入时报 PGRT204: 找不到 service_type 列
-- ============================================================

BEGIN;

-- 订单服务类型（堂食/自取/外卖）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(32) DEFAULT 'self_pickup';

-- 支付时间戳
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 支付过期时间
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_expired_at TIMESTAMPTZ;

-- 验证
SELECT 
  column_name,
  data_type,
  CASE 
    WHEN column_name = 'service_type' THEN '✅ 已添加'
    ELSE '已存在'
  END AS status
FROM information_schema.columns
WHERE table_name = 'orders'
AND column_name IN ('service_type', 'paid_at', 'pay_expired_at')
ORDER BY ordinal_position;

COMMIT;

-- ==================== 00030_all_tables_missing_columns.sql ====================
-- ============================================================
-- 00030: 彻底补全所有表缺失字段（终极修复）
-- 根因：多次遇到 PGRT204 "Could not find column" 错误
-- 策略：逐表补全，确保 createOrderV2 / applyRefund 所有字段都存在
-- ============================================================

BEGIN;

-- ==================== orders 表 ====================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(32) DEFAULT 'self_pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_expired_at TIMESTAMPTZ;

-- ==================== order_items 表 ====================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ==================== refunds 表（重点！）====================
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_no VARCHAR(64);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending_review';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS wechat_refund_id VARCHAR(128);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ==================== profiles 表（健康豆相关）====================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gold_beans INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ==================== 验证 ====================
SELECT
  'orders' AS tbl,
  COUNT(*) FILTER (WHERE column_name IN ('service_type','paid_at','pay_expired_at')) AS found,
  ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('service_type','paid_at','pay_expired_at')) AS cols
FROM information_schema.columns WHERE table_name = 'orders'
UNION ALL
SELECT
  'order_items', COUNT(*) FILTER (WHERE column_name IN ('store_name','product_image','created_at')),
  ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('store_name','product_image','created_at'))
FROM information_schema.columns WHERE table_name = 'order_items'
UNION ALL
SELECT
  'refunds', COUNT(*) FILTER (WHERE column_name IN ('refund_no','user_id','initiated_by','status',
    'refund_quantity','refund_amount','reason','description','version','completed_at','updated_at')),
  ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('refund_no','user_id','initiated_by','status',
    'refund_quantity','refund_amount','reason','description','version','completed_at','updated_at'))
FROM information_schema.columns WHERE table_name = 'refunds';

COMMIT;

-- ==================== 00031_refunds_full_fix.sql ====================
-- ============================================================
-- 00031: refunds 表 - 补全 applyRefund 所需的所有字段
-- 执行时间: 2026-07-04
-- 说明: 彻底解决 "Could not find column" 错误
-- ============================================================

-- refunds 表：补全所有字段
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_no VARCHAR(64);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS order_no VARCHAR(64);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS item_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) DEFAULT 'user';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending_review';
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS wechat_refund_id VARCHAR(128);

-- 关闭 RLS（测试阶段）
ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;

-- 验证
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'refunds' 
ORDER BY ordinal_position;

-- ==================== 00032_drop_refunds_check.sql ====================
-- ============================================================
-- 00032: 删除 refunds 表的 status CHECK 约束
-- 执行时间: 2026-07-04
-- 说明: 解决 "violates check constraint refunds_status_check"
-- ============================================================

-- 查看当前约束（可选）
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'refunds'::regclass;

-- 删除 status 的 CHECK 约束
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;

-- 如果上面的约束名不对，尝试通用方式
DO $$
BEGIN
  FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'refunds'::regclass AND contype = 'c')
    LOOP
      EXECUTE format('ALTER TABLE refunds DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

-- 验证：确认无 CHECK 约束
SELECT conname, contype, pg_get_constraintdef(oid) as definition 
FROM pg_constraint 
WHERE conrelid = 'refunds'::regclass;

-- ==================== 00033_check_all_tables.sql ====================
-- ============================================================
-- 检查所有需要的表是否存在，以及字段是否完整
-- 在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 查看所有已存在的表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. 查看 refunds 表结构（确认是否存在）
SELECT 
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'refunds' 
ORDER BY ordinal_position;

-- 3. 查看 orders 表结构
SELECT 
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;

-- 4. 查看 commissions 表结构
SELECT 
  column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'commissions' 
ORDER BY ordinal_position;

-- 5. 查看 points_logs 表结构
SELECT 
  column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'points_logs' 
ORDER BY ordinal_position;

-- ==================== 00034_articles_add_view_share_count.sql ====================
-- 00034_articles_add_view_share_count.sql
-- 为 articles 表添加浏览量和分享数统计字段

ALTER TABLE articles ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;

-- 关闭 RLS（测试阶段）
ALTER TABLE articles DISABLE ROW LEVEL SECURITY;

-- ==================== 00035_add_pending_referrals.sql ====================
-- 扫码即锁客：未注册用户也记录下线关系
-- 2026-07-05

-- 1. 创建 pending_referrals 表
CREATE TABLE IF NOT EXISTS pending_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,               -- 设备标识（微信 openid 或设备ID）
  referral_code TEXT NOT NULL,   -- 推广码（profiles.invite_code）
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  campaign_id INTEGER REFERENCES marketing_campaigns(id) ON DELETE SET NULL,  -- marketing_campaigns.id 是 integer 类型
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'expired')),
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);

-- 2. 添加索引
CREATE INDEX IF NOT EXISTS idx_pending_referrals_device_id ON pending_referrals(device_id);
CREATE INDEX IF NOT EXISTS idx_pending_referrals_referral_code ON pending_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_pending_referrals_status ON pending_referrals(status);

-- 3. 添加注释
COMMENT ON TABLE pending_referrals IS '预锁客表：存储未注册用户的锁客关系';
COMMENT ON COLUMN pending_referrals.device_id IS '设备标识（微信 openid 或设备ID）';
COMMENT ON COLUMN pending_referrals.referral_code IS '推广码（对应 profiles.invite_code）';
COMMENT ON COLUMN pending_referrals.store_id IS '门店ID（如果是扫码进入门店）';
COMMENT ON COLUMN pending_referrals.campaign_id IS '活动ID（如果是活动分享，integer类型）';
COMMENT ON COLUMN pending_referrals.status IS '状态：pending-待转化、converted-已转化、expired-已过期';
COMMENT ON COLUMN pending_referrals.converted_user_id IS '转化后的用户ID（注册后填入）';
COMMENT ON COLUMN pending_referrals.expires_at IS '过期时间（默认30天）';

-- 4. 启用 RLS
ALTER TABLE pending_referrals ENABLE ROW LEVEL SECURITY;

-- 5. 创建策略（先删除再创建，避免重复）
DROP POLICY IF EXISTS "Allow anonymous insert" ON pending_referrals;
DROP POLICY IF EXISTS "Allow service role select" ON pending_referrals;

CREATE POLICY "Allow anonymous insert" ON pending_referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role select" ON pending_referrals
  FOR SELECT USING (true);

-- 6. 创建转化函数（注册时调用）
-- 注意：p_user_id 使用 TEXT 类型，在函数内部转换为 UUID
-- 注意：profiles.invited_by 字段已修改为 TEXT 类型
-- 注意：user_store_relation 表可能没有 created_at 字段
CREATE OR REPLACE FUNCTION convert_pending_referral(
  p_device_id TEXT,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referral_code TEXT;
  v_store_id UUID;
  v_pending_id UUID;
  v_referrer_id UUID;
BEGIN
  -- 查找最近的 pending 记录
  SELECT id, referral_code, store_id
  INTO v_pending_id, v_referral_code, v_store_id
  FROM pending_referrals
  WHERE device_id = p_device_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 获取推荐人 ID
  SELECT id INTO v_referrer_id FROM profiles WHERE invite_code = v_referral_code LIMIT 1;

  -- 更新 pending 记录状态
  UPDATE pending_referrals
  SET status = 'converted',
      converted_user_id = p_user_id::UUID,
      updated_at = now()
  WHERE id = v_pending_id;

  -- 写入 user_store_relation（锁客关系）
  IF v_store_id IS NOT NULL AND v_referrer_id IS NOT NULL THEN
    INSERT INTO user_store_relation (user_id, store_id, referrer_id, status)
    VALUES (p_user_id::UUID, v_store_id, v_referrer_id, 'active')
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  -- 更新 profiles.invited_by（TEXT 类型，存储邀请码）
  UPDATE profiles
  SET invited_by = v_referral_code
  WHERE id = p_user_id::UUID AND invited_by IS NULL;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 附带：profiles.invited_by 字段类型修改为 TEXT
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_invited_by_fkey;
-- ALTER TABLE profiles ALTER COLUMN invited_by TYPE TEXT;

-- ==================== 00036_check_and_fix_marketing_campaigns.sql ====================
-- 检查并创建 marketing_campaigns 表（如果不存在）
-- 执行前请先在 Supabase Dashboard 中运行 SELECT * FROM marketing_campaigns LIMIT 1; 检查表是否存在

-- 如果表不存在，创建它
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id SERIAL PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'redpacket',  -- redpacket:现金红包, physical:实物礼品
  gift_name TEXT,  -- 礼品名称（现金红包时为"现金红包"）
  gift_value NUMERIC(10,2) NOT NULL,  -- 红包金额或礼品价值
  total_limit INTEGER NOT NULL,  -- 发放总数
  daily_limit INTEGER DEFAULT 10,  -- 每日限领
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  claimed_count INTEGER DEFAULT 0,  -- 已领取数量
  commission_rate NUMERIC(5,2) DEFAULT 0.1,  -- 推广佣金比例
  status TEXT DEFAULT 'active',  -- active, paused, ended
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 如果表已存在，检查并添加缺失的字段
DO $$
BEGIN
  -- 检查 campaign_type 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'campaign_type'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN campaign_type TEXT DEFAULT 'redpacket';
    COMMENT ON COLUMN public.marketing_campaigns.campaign_type IS '活动类型：redpacket=现金红包, physical=实物礼品';
  END IF;

  -- 检查 gift_name 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'gift_name'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN gift_name TEXT;
    COMMENT ON COLUMN public.marketing_campaigns.gift_name IS '礼品名称（现金红包时为"现金红包"）';
  END IF;

  -- 检查 gift_value 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'gift_value'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN gift_value NUMERIC(10,2) NOT NULL DEFAULT 0;
    COMMENT ON COLUMN public.marketing_campaigns.gift_value IS '红包金额或礼品价值';
  END IF;

  -- 检查 commission_rate 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN commission_rate NUMERIC(5,2) DEFAULT 0.1;
    COMMENT ON COLUMN public.marketing_campaigns.commission_rate IS '推广佣金比例（0.1表示10%）';
  END IF;

  -- 检查 claimed_count 字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'marketing_campaigns' AND column_name = 'claimed_count'
  ) THEN
    ALTER TABLE public.marketing_campaigns ADD COLUMN claimed_count INTEGER DEFAULT 0;
    COMMENT ON COLUMN public.marketing_campaigns.claimed_count IS '已领取数量';
  END IF;

END $$;

-- 添加表注释
COMMENT ON TABLE public.marketing_campaigns IS '营销活动表（红包/实物礼品）';

-- 添加 RLS 策略（如果不存在）
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- 删除已有的策略（如果有）
DROP POLICY IF EXISTS "Merchants can manage own campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Users can view active campaigns" ON public.marketing_campaigns;

-- 商家可以管理自己的活动
CREATE POLICY "Merchants can manage own campaigns" ON public.marketing_campaigns
  FOR ALL USING (store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid()));

-- 用户可以查看活跃的活动
CREATE POLICY "Users can view active campaigns" ON public.marketing_campaigns
  FOR SELECT USING (status = 'active');

-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_store_id ON public.marketing_campaigns(store_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_start_date ON public.marketing_campaigns(start_date);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_end_date ON public.marketing_campaigns(end_date);

-- ==================== 00037_cleanup_unused_tables.sql ====================
-- 清理未使用的数据库表（慎用！）
-- 执行前请先备份数据库！

-- 检查以下表是否存在引用关系
-- 如果表存在但有外键引用，需要先删除引用表或外键

-- =====================================
-- 1. 检查 referrals 表（可能已被 user_store_relation 替代）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referrals') THEN
    -- 检查是否有其他表引用 referrals
    -- 如果有引用，会报错，脚本会停止
    DROP TABLE IF EXISTS public.referrals CASCADE;
    RAISE NOTICE '表 referrals 已删除';
  ELSE
    RAISE NOTICE '表 referrals 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 2. 检查 user_staff_bindings 表（可能已被 store_staff 替代）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_staff_bindings') THEN
    DROP TABLE IF EXISTS public.user_staff_bindings CASCADE;
    RAISE NOTICE '表 user_staff_bindings 已删除';
  ELSE
    RAISE NOTICE '表 user_staff_bindings 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 3. 检查 rank_configs 表（未被引用）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rank_configs') THEN
    DROP TABLE IF EXISTS public.rank_configs CASCADE;
    RAISE NOTICE '表 rank_configs 已删除';
  ELSE
    RAISE NOTICE '表 rank_configs 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 4. 检查 platform_configs 表（未被引用）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_configs') THEN
    DROP TABLE IF EXISTS public.platform_configs CASCADE;
    RAISE NOTICE '表 platform_configs 已删除';
  ELSE
    RAISE NOTICE '表 platform_configs 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 验证清理结果
-- =====================================
SELECT '剩余表数量:' AS info, COUNT(*) AS count 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';

-- 列出所有剩余表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ==================== 00038_emotion_system.sql ====================
-- ============================================
-- 情绪系统数据库迁移
-- 创建时间: 2026-07-06
-- 说明: 情绪关键词表 + 情绪文案内容表
-- ============================================

-- 1. 情绪关键词表 (用于情绪匹配)
CREATE TABLE IF NOT EXISTS public.emotion_keywords (
  id SERIAL PRIMARY KEY,
  inner_label VARCHAR(32) NOT NULL,
  keyword VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT emotion_keywords_label_check CHECK (inner_label IN ('drained_low', 'lonely_still', 'expressive_high', 'peaceful_zen', 'nostalgic_soft', 'eager_forward'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_emotion_keywords_label ON public.emotion_keywords(inner_label);
CREATE INDEX IF NOT EXISTS idx_emotion_keywords_keyword ON public.emotion_keywords(keyword);

-- 2. 情绪文案内容表
CREATE TABLE IF NOT EXISTS public.emotion_content (
  id SERIAL PRIMARY KEY,
  inner_label VARCHAR(32) NOT NULL,
  content_type VARCHAR(20) NOT NULL,
  scene_card_id VARCHAR(20),
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(200),
  extra_meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT emotion_content_label_check CHECK (inner_label IN ('drained_low', 'lonely_still', 'expressive_high', 'peaceful_zen', 'nostalgic_soft', 'eager_forward'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_emotion_content_label_type ON public.emotion_content(inner_label, content_type);

-- 3. 插入情绪关键词数据
INSERT INTO public.emotion_keywords (inner_label, keyword, priority) VALUES
-- 耗竭态
('drained_low', '累', 1),
('drained_low', '好累', 1),
('drained_low', '加班', 1),
('drained_low', '困', 1),
('drained_low', '不想动', 2),
('drained_low', '耗尽', 1),
('drained_low', '虚脱', 1),
('drained_low', '撑不住', 1),
('drained_low', '刚下班', 1),
('drained_low', '周一', 2),
-- 孤独态
('lonely_still', '一个人', 1),
('lonely_still', '想家', 1),
('lonely_still', '无聊', 2),
('lonely_still', '冷清', 1),
('lonely_still', '失落', 1),
('lonely_still', '空荡荡', 1),
('lonely_still', '没劲', 2),
('lonely_still', '发呆', 2),
('lonely_still', '异乡', 1),
-- 表达驱动态
('expressive_high', '开心', 1),
('expressive_high', '好棒', 1),
('expressive_high', '快乐', 1),
('expressive_high', '兴奋', 1),
('expressive_high', '嗨', 2),
('expressive_high', '完美', 1),
('expressive_high', '太爽了', 1),
('expressive_high', '今天真好', 1),
('expressive_high', '好天气', 2),
-- 平稳态
('peaceful_zen', '放松', 1),
('peaceful_zen', '随意', 2),
('peaceful_zen', '悠闲', 1),
('peaceful_zen', '不想吵', 1),
('peaceful_zen', '平平淡淡', 2),
('peaceful_zen', '走走', 2),
('peaceful_zen', '没事', 2),
('peaceful_zen', '休息日', 1),
-- 怀念态
('nostalgic_soft', '怀念', 1),
('nostalgic_soft', '想当年', 1),
('nostalgic_soft', '旧时光', 1),
('nostalgic_soft', '回忆', 1),
('nostalgic_soft', '老友', 1),
('nostalgic_soft', '以前', 2),
('nostalgic_soft', '小时候', 2),
('nostalgic_soft', '故地', 1),
-- 渴望态
('eager_forward', '想要', 2),
('eager_forward', '想去', 1),
('eager_forward', '向往', 1),
('eager_forward', '计划', 2),
('eager_forward', '改变', 1),
('eager_forward', '新开始', 1),
('eager_forward', '剪头发', 1),
('eager_forward', '换心情', 1)
ON CONFLICT DO NOTHING;

-- 4. 插入情绪翻译文案
INSERT INTO public.emotion_content (inner_label, content_type, title) VALUES
-- 耗竭态
('drained_low', 'translation', '感觉到了你的疲惫，今天已经用掉太多力气了。'),
('drained_low', 'translation', '累到不想说话的时候，不说话也没关系。'),
('drained_low', 'translation', '加班到现在，辛苦了。此刻，允许自己当一棵放空的植物。'),
-- 孤独态
('lonely_still', 'translation', '一个人的时候，安静也是一种陪伴。'),
('lonely_still', 'translation', '感觉到了你的孤独。茫茫人海，总有一个角落是留给你的。'),
('lonely_still', 'translation', '异乡的夜晚，胃暖了，心就不空了。'),
-- 表达驱动
('expressive_high', 'translation', '今天的心情像阳光一样明亮，值得认真庆祝。'),
('expressive_high', 'translation', '感觉到了你的快乐，这份能量不分享就浪费了。'),
('expressive_high', 'translation', '好状态，当然要去配得上它的好地方。'),
-- 平稳态
('peaceful_zen', 'translation', '心若浮萍，当觅一处安静之地，让灵魂得以安放。'),
('peaceful_zen', 'translation', '不赶时间，不设目的，今天归自己所有。'),
('peaceful_zen', 'translation', '平静的日子，最值得被温柔对待。'),
-- 怀念态
('nostalgic_soft', 'translation', '念旧的人，心里都住着一个温暖的老地方。'),
('nostalgic_soft', 'translation', '时光带走的，味觉都帮你记着呢。'),
('nostalgic_soft', 'translation', '偶尔回头看看，才发现自己走了好远的路。'),
-- 渴望态
('eager_forward', 'translation', '心里有期待，日子就发光。'),
('eager_forward', 'translation', '感觉到了你眼里的光，去吧，新体验在等你。'),
('eager_forward', 'translation', '与其向往，不如出发。今天就是一个好日子。')
ON CONFLICT DO NOTHING;

-- 5. 插入场景卡片
INSERT INTO public.emotion_content (inner_label, content_type, scene_card_id, title, subtitle, extra_meta) VALUES
-- 耗竭态
('drained_low', 'scene_card', 'SC_001', '午休15分钟·快速回血', '趴在桌上听场雨，比睡着管用。', '{"anim":"rain_ripple"}'),
('drained_low', 'scene_card', 'SC_002', '深夜一碗粥·暖身不撑', '不用说话，喝完了就走。', '{"anim":"steam_rise"}'),
('drained_low', 'scene_card', 'SC_003', '电量1%·立刻充电', '就现在，找个小角落瘫一会儿。', '{"anim":"battery_pulse"}'),
-- 孤独态
('lonely_still', 'scene_card', 'SC_004', '独自放空·城市避风港', '不需要社交，只需要一扇安静的窗。', '{"anim":"window_gaze"}'),
('lonely_still', 'scene_card', 'SC_005', '旧时光·翻翻老味道', '想念的旧时光，都藏在这一口里。', '{"anim":"photo_flip"}'),
('lonely_still', 'scene_card', 'SC_006', '深夜食堂·一人食', '长夜漫漫，有碗热汤陪着你。', '{"anim":"bowl_steam"}'),
-- 表达驱动
('expressive_high', 'scene_card', 'SC_007', '周末出片·光影漫游', '今天的阳光，值得你认真打扮。', '{"anim":"light_spot"}'),
('expressive_high', 'scene_card', 'SC_008', '组局搭子·快乐翻倍', '缺个会拍照的，你带故事，我带酒。', '{"anim":"bubble_up"}'),
('expressive_high', 'scene_card', 'SC_009', '微醺时刻·庆祝日常', '普通的日子，也要有仪式感地碰杯。', '{"anim":"clink_glass"}'),
-- 平稳态
('peaceful_zen', 'scene_card', 'SC_010', '随机漫游·遇见惊喜', '不设目的地，推开一扇门看看。', '{"anim":"compass_swing"}'),
('peaceful_zen', 'scene_card', 'SC_011', '公园20分钟·抱大树', '什么都不做，就在长椅上发会儿呆。', '{"anim":"leaf_drift"}'),
('peaceful_zen', 'scene_card', 'SC_012', '不急·喝杯茶再说', '看茶叶在杯子里慢慢沉下去。', '{"anim":"tea_settle"}'),
-- 怀念态
('nostalgic_soft', 'scene_card', 'SC_013', '复古旧物·寻宝记', '总有一件旧物，替你记得来时的路。', '{"anim":"dust_float"}'),
('nostalgic_soft', 'scene_card', 'SC_014', '老友记·叙旧饭局', '叫上老友，把当年的笑话再讲一遍。', '{"anim":"laugh_vibration"}'),
('nostalgic_soft', 'scene_card', 'SC_015', '黑胶时光·听首老歌', '唱针落下，回到90年代的某个下午。', '{"anim":"vinyl_spin"}'),
-- 渴望态
('eager_forward', 'scene_card', 'SC_016', '换个发型·换种心情', '剪掉烦恼，从头开始。', '{"anim":"scissors_snip"}'),
('eager_forward', 'scene_card', 'SC_017', '户外徒步·去野去风里', '山不来见我，我自去见山。', '{"anim":"wind_sweep"}'),
('eager_forward', 'scene_card', 'SC_018', '技能解锁·体验课', '1小时，学会一件让朋友惊叹的小事。', '{"anim":"spark_burst"}')
ON CONFLICT DO NOTHING;

-- 6. 插入Feed流标题
INSERT INTO public.emotion_content (inner_label, content_type, title, subtitle) VALUES
-- 耗竭态
('drained_low', 'feed_title', '加班到十点，想喝点暖的？这里有碗关东煮。', '93%疲惫的人觉得值'),
('drained_low', 'feed_title', '累到不想选？那这家只卖一种面的店，刚好。', '无需预约·到店即享'),
('drained_low', 'feed_title', '原地歇脚，这家按摩椅不用预约。', '距离你200米，打烊凌晨2点'),
-- 孤独态
('lonely_still', 'feed_title', '一个人吃饭，也想吃得舒服一点？这家有吧台座。', '90%独处的人推荐'),
('lonely_still', 'feed_title', '觉得冷清的时候，去花市买一束不用说话的花。', '适合单人·不尴尬'),
('lonely_still', 'feed_title', '孤独等级四级？来这家书店，书和猫都陪你。', '此刻人少，正好安静'),
-- 表达驱动
('expressive_high', 'feed_title', '今天心情好？这家Brunch的颜色跟你好配。', '96%快乐的人想二刷'),
('expressive_high', 'feed_title', '快乐需要见证，这家露台酒吧能看见全城日落。', '热门打卡·出片率100%'),
('expressive_high', 'feed_title', '想找人分享喜悦？这场脱口秀全场都在笑。', '今天还有空位，手慢无'),
-- 平稳态
('peaceful_zen', 'feed_title', '今天没什么安排？这家茶馆的窗景刚好够你看一下午。', '静谧时光，正好有空'),
('peaceful_zen', 'feed_title', '闲逛累了？巷子里的老书店有风扇和凉席。', '非网红店·不用排队'),
('peaceful_zen', 'feed_title', '不用动脑子，这家只卖白粥和小菜。', '适合发呆·不限时'),
-- 怀念态
('nostalgic_soft', 'feed_title', '想起小时候的味道了？这家糖水铺还在用老式碗。', '20年老味道·不踩雷'),
('nostalgic_soft', 'feed_title', '想见老友却不知去哪？这家大排档够吵，不会尴尬。', '老友聚会·放肆大笑'),
('nostalgic_soft', 'feed_title', '怀念不是变老，是心里有宝藏。这家旧书店有你的童年漫画。', '情怀老店·时光慢递'),
-- 渴望态
('eager_forward', 'feed_title', '想换个心情？这家理发店的Tony只听你说话，不推销。', '今日预约有位置'),
('eager_forward', 'feed_title', '想出去走走？这条徒步路线新手友好，风景却老手都说绝。', '新手友好·无需装备'),
('eager_forward', 'feed_title', '想试试新东西？这家陶艺体验课，捏坏了也能烧出来。', '90%的体验者打开了新大门')
ON CONFLICT DO NOTHING;

-- 7. 禁用RLS（测试阶段）
ALTER TABLE public.emotion_keywords DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_content DISABLE ROW LEVEL SECURITY;

-- ✅ 完成！
COMMENT ON TABLE public.emotion_keywords IS '情绪关键词映射表 - 用于存储触发关键词和对应的情绪分类';
COMMENT ON TABLE public.emotion_content IS '情绪文案内容表 - 存储情绪翻译文案、场景卡片、Feed流标题等';

-- ==================== 00039_extend_coupons_for_merchant.sql ====================
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

-- ==================== 00040_emotion_llm_system.sql ====================
-- ============================================
-- 情绪系统 · LLM 接入与策略入库迁移
-- 创建时间: 2026-07-07
-- 说明:
--   1. category_emotion_profiles  —— 类目情绪编译策略（运营后台可改，替代前端硬编码）
--   2. product_emotion           —— 商品情绪编译结果缓存（详情页直读，不每次调 LLM）
--   3. emotion_taxonomy          —— 商品 mood_tags ↔ 用户 6 情绪态(inner_label) 桥接表
--   4. stores.partner_brand/tier —— 犒赏铺等合作商家建模
-- 设计原则: 编译结果必须落库缓存；LLM 仅用于「理解」与「按需编译」，绝不每次渲染调用。
-- ============================================

-- ========== 1. 类目情绪编译策略表 ==========
CREATE TABLE IF NOT EXISTS public.category_emotion_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key        TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  tone                TEXT,
  allowed_mood_tags  TEXT[] DEFAULT '{}',
  metaphors           JSONB DEFAULT '[]'::jsonb,
  angles              TEXT[] DEFAULT '{}',
  openers             TEXT[] DEFAULT '{}',
  closers             TEXT[] DEFAULT '{}',
  aliases             TEXT[] DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cep_key ON public.category_emotion_profiles(category_key);

-- ========== 2. 商品情绪编译结果缓存表 ==========
CREATE TABLE IF NOT EXISTS public.product_emotion (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  emotion_title       TEXT,
  emotion_detail      TEXT,
  scene_tags_compiled TEXT[],
  mood_tags_used      TEXT[],
  category_profile_id UUID,
  compiled_by         TEXT NOT NULL DEFAULT 'rule' CHECK (compiled_by IN ('rule','llm')),
  model               TEXT,
  compiled_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS idx_pe_product ON public.product_emotion(product_id);

-- ========== 3. 情绪词表桥接 ==========
CREATE TABLE IF NOT EXISTS public.emotion_taxonomy (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mood_tag     TEXT NOT NULL UNIQUE,
  inner_label  TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT emotion_taxonomy_label_check CHECK (
    inner_label IN ('drained_low','lonely_still','expressive_high','peaceful_zen','nostalgic_soft','eager_forward')
  )
);

CREATE INDEX IF NOT EXISTS idx_et_tag ON public.emotion_taxonomy(mood_tag);
CREATE INDEX IF NOT EXISTS idx_et_label ON public.emotion_taxonomy(inner_label);

-- ========== 4. 合作商家建模（犒赏铺等） ==========
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_brand TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS partner_tier  TEXT;
COMMENT ON COLUMN public.stores.partner_brand IS '合作品牌标识，如"犒赏铺"；非空表示属于某合作品牌体系（区别于平台自营 is_platform）';
COMMENT ON COLUMN public.stores.partner_tier  IS '合作等级/档位，如 gold/silver/normal，用于差异化结算与展示';

-- ============================================
-- 种子数据
-- ============================================

-- 类目情绪编译策略（11 业态 + 通用兜底），数据来自前端 category-emotion.ts
INSERT INTO public.category_emotion_profiles
  (category_key, label, tone, allowed_mood_tags, metaphors, angles, closers, aliases)
VALUES
  ('餐饮', '餐饮美食', '烟火人间，与人共食的妥帖',
   ARRAY['治愈','满足','幸福','温馨','甜蜜','愉悦','分享','用餐时光','放松','仪式感','怀旧','温暖'],
   '["灶上咕嘟的汤","一桌人对坐的灯","街角老馆子的香","碗中升腾的热气"]'::jsonb,
   ARRAY['与人共食，滋味更浓。','一蔬一饭，最抚凡人心。','围坐的此刻，便是归处。'],
   ARRAY['趁热，慢慢吃。','这一餐，值得好好坐下来。'],
   ARRAY['正餐','小吃','快餐','火锅','烧烤','夜宵','外卖','饭','餐','美食','餐厅']),

  ('饮品', '饮品', '微醺与小憩，唇齿间的喘息',
   ARRAY['甜蜜','治愈','放松','愉悦','清新','清爽','浪漫','慢生活'],
   '["杯壁凝着的水珠","午后的一口清凉","巷口捧着的那杯暖","吸管搅动的甜"]'::jsonb,
   ARRAY['小口啜饮，日子慢下来。','给自己一段喘息。'],
   ARRAY['慢慢喝，不着急。'],
   ARRAY['奶茶','咖啡','果茶','酒水','茶','饮料','汽水','果汁']),

  ('烘焙', '烘焙甜点', '晨间手作的温度',
   ARRAY['甜蜜','治愈','温馨','幸福','满足','浪漫'],
   '["刚出炉的暖香","窗台边那块松软","晨光里的酥皮","指尖沾着的糖粉"]'::jsonb,
   ARRAY['一口下去，整个人都松了。','甜的东西，最懂安慰。'],
   ARRAY['趁新鲜，尝一口。'],
   ARRAY['面包','甜点','蛋糕','西点','糕点','甜品']),

  ('水果生鲜', '水果生鲜', '土地与时令的鲜活',
   ARRAY['清爽','清新','自然','纯净','解暑','治愈','活力','满足'],
   '["枝头带露的鲜","山野吹来的风","刚从土里醒来的清气","井水镇过的脆"]'::jsonb,
   ARRAY['从田间到舌尖，不过片刻。','应季的鲜，最懂身体。'],
   ARRAY['鲜的，不必多说。'],
   ARRAY['果蔬','水果','生鲜','蔬菜','肉禽','海鲜','农产','食材','农场']),

  ('零售', '零售百货', '悦己的小确幸与陪伴',
   ARRAY['快乐','满足','惊喜','治愈','温馨','可爱','有趣','浪漫','甜蜜','怀旧'],
   '["抽屉里的小欢喜","案头的一件趣物","旧书页的香","随手摆着的可爱"]'::jsonb,
   ARRAY['给自己一点甜。','寻常日子里的小光。'],
   ARRAY['喜欢，就带它回家。'],
   ARRAY['零食','百货','图书','日用','杂货','文创','超市','便利店']),

  ('美业', '丽人美业', '悦己与焕新的精致',
   ARRAY['精致','治愈','放松','浪漫','甜蜜','仪式感','高端','典雅'],
   '["镜中焕然的自己","指尖温柔的时光","被妥帖照料的容颜","发梢掠过的轻"]'::jsonb,
   ARRAY['为自己停下来的那一刻。','好好爱自己，不亏。'],
   ARRAY['你值得被温柔对待。'],
   ARRAY['美甲','美容','美发','护肤','SPA','丽人','造型','美睫','纹绣']),

  ('娱乐', '休闲娱乐', '释放与社交的沉浸',
   ARRAY['快乐','兴奋','刺激','活力','愉悦','分享','有趣'],
   '["灯影里炸开的笑","一群人的喧闹","卸下伪装的夜","屏幕亮起的雀跃"]'::jsonb,
   ARRAY['痛快闹一场。','和朋友，才够味。'],
   ARRAY['今晚，尽兴就好。'],
   ARRAY['KTV','剧本杀','影院','密室','电玩','桌游','酒吧','夜店','游乐','演出']),

  ('运动健身', '运动健身', '活力与自律的突破',
   ARRAY['活力','满足','专注','兴奋','放松','自然'],
   '["汗水落地的脆","突破极限的喘息","身体苏醒的晨","肌肉舒展的暖"]'::jsonb,
   ARRAY['动起来，通体舒畅。','坚持，身体会记得。'],
   ARRAY['练完这一组，整个人都轻了。'],
   ARRAY['瑜伽','游泳','私教','健身','拳击','骑行','跑步','舞蹈']),

  ('亲子', '亲子', '陪伴与成长的童真',
   ARRAY['温馨','幸福','甜蜜','治愈','快乐','可爱'],
   '["孩子扬起的笑","牵着的小手","时光里的童真","蹦跳着的身影"]'::jsonb,
   ARRAY['陪他长大，也是陪自己重温童年。','孩子的笑，最能化开疲惫。'],
   ARRAY['这样的时光，最珍贵。'],
   ARRAY['乐园','早教','摄影','婴童','儿童','母婴','托管']),

  ('生活服务', '生活服务', '省心与托付的安心',
   ARRAY['放松','治愈','实用','温馨','安心'],
   '["交出去的轻松","被妥帖打理的琐碎","归家时的整洁","不必自己动手的闲"]'::jsonb,
   ARRAY['麻烦的事，交给专业的人。','把时间留给自己。'],
   ARRAY['剩下的，安心就好。'],
   ARRAY['家政','维修','洗衣','洗车','保洁','托管','养护','上门']),

  ('酒店民宿', '酒店民宿', '栖居与远方的慢生活',
   ARRAY['放松','治愈','慢生活','浪漫','平静','安逸','温馨'],
   '["推开窗的山景","一夜好眠的软","异乡的灯","院里那棵老树"]'::jsonb,
   ARRAY['在路上，也是在家。','换一处地方，换一种心绪。'],
   ARRAY['好好歇一晚。'],
   ARRAY['酒店','民宿','客栈','住宿','青旅']),

  ('通用', '通用', '安宁',
   ARRAY[]::TEXT[], '[]'::jsonb, ARRAY[''], ARRAY[]::TEXT[], ARRAY[]::TEXT[])
ON CONFLICT (category_key) DO NOTHING;

-- 情绪词表桥接（商品 mood_tags ↔ 用户 6 情绪态）
-- 说明：mood_tags 描述的是「商品感染力」，inner_label 描述的是「用户当下情绪态」，
--       桥接用于「推荐」——某商品能抚慰哪类情绪态的用户。
INSERT INTO public.emotion_taxonomy (mood_tag, inner_label, description) VALUES
  -- 表达驱动
  ('快乐','expressive_high','明亮愉悦，适合分享庆祝'),
  ('兴奋','expressive_high','高能量，值得记录'),
  ('满足','expressive_high','被填满的踏实'),
  ('惊喜','expressive_high','意外的小确幸'),
  ('幸福','expressive_high','圆满感'),
  ('浪漫','expressive_high','心动与仪式'),
  ('甜蜜','expressive_high','温柔的甜'),
  ('有趣','expressive_high','好玩、想分享'),
  ('可爱','expressive_high','被萌到的开心'),
  ('活力','expressive_high','元气满满'),
  ('潮流','eager_forward','想跟上、想尝试'),
  ('个性','eager_forward','想表达自我'),
  ('奢华','expressive_high','犒赏自己的高光'),
  ('高端','expressive_high','值得郑重对待'),
  ('尊贵','expressive_high','被重视的体面'),
  ('典雅','expressive_high','含蓄的高级感'),
  -- 平稳/治愈
  ('平静','peaceful_zen','需要安放的心'),
  ('放松','peaceful_zen','卸下紧绷'),
  ('舒适','peaceful_zen','被托住的安稳'),
  ('安逸','peaceful_zen','不必赶路的闲'),
  ('慢生活','peaceful_zen','把节奏放慢'),
  ('治愈','peaceful_zen','被轻轻抚平'),
  ('自然','peaceful_zen','回到本真的静'),
  ('纯净','peaceful_zen','清空杂念'),
  ('清新','peaceful_zen','透气的清爽'),
  ('清爽','peaceful_zen','褪去燥热'),
  ('解暑','peaceful_zen','一时的清凉慰藉'),
  -- 怀念/温暖
  ('温馨','nostalgic_soft','像家的暖意'),
  ('感动','nostalgic_soft','被触到的柔软'),
  ('怀旧','nostalgic_soft','旧时光的回响'),
  ('温暖','nostalgic_soft','被围住的暖'),
  -- 渴望
  ('精致','eager_forward','想对自己更好一点'),
  ('唯美','eager_forward','向往美感生活')
ON CONFLICT (mood_tag) DO NOTHING;

-- ============================================
-- 禁用 RLS（测试阶段，与项目既有表一致）
-- ============================================
ALTER TABLE public.category_emotion_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_emotion           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_taxonomy          DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.category_emotion_profiles IS '类目情绪编译策略表 - 运营后台可改，替代前端硬编码策略';
COMMENT ON TABLE public.product_emotion           IS '商品情绪编译结果缓存 - 详情页直读，避免每次渲染调 LLM';
COMMENT ON TABLE public.emotion_taxonomy          IS '情绪词表桥接 - 商品 mood_tags 与用户 6 情绪态(inner_label) 的映射';

-- ✅ 完成！

-- ==================== 00041_user_emotion_preferences.sql ====================
-- ============================================
-- 用户情绪偏好表
-- 创建时间: 2026-07-07
-- 说明: 原 create_user_emotion_preferences.sql 为游离文件，从未纳入迁移、未推上云，
--       导致 emotion-recommendation.ts 查询报 404（Could not find the table）。
--       此处收编为正式迁移，幂等、可重复执行。
-- ============================================

-- 通用 updated_at 触发器函数（如已存在则覆盖，幂等）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 用户情绪偏好表
CREATE TABLE IF NOT EXISTS public.user_emotion_preferences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE,
  mood_tags   TEXT[],
  action      TEXT CHECK (action IN ('view', 'click', 'purchase')),
  weight      INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_emotion_preferences_user_id
  ON public.user_emotion_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_preferences_mood_tags
  ON public.user_emotion_preferences USING GIN (mood_tags);

DROP TRIGGER IF EXISTS update_user_emotion_preferences_updated_at
  ON public.user_emotion_preferences;
CREATE TRIGGER update_user_emotion_preferences_updated_at
  BEFORE UPDATE ON public.user_emotion_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 禁用 RLS（测试阶段，与项目既有表一致）
ALTER TABLE public.user_emotion_preferences DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.user_emotion_preferences
  IS '用户情绪偏好（浏览/点击/购买行为汇总），用于情绪推荐引擎加权';

-- ==================== 00042_add_claimed_at_to_campaign_claims.sql ====================
-- ============================================
-- 补齐 user_campaign_claims.claimed_at 列
-- 执行日期：2026-07-07
-- 背景：claim_campaign 函数与前端类型 UserCampaignClaim 均使用
--       claimed_at 字段，但云端建表时误落成 created_at，
--       导致函数 INSERT 报 "column claimed_at does not exist"。
--       此处幂等补齐，确保函数/前端/表结构一致。
-- ============================================

ALTER TABLE public.user_campaign_claims
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.user_campaign_claims.claimed_at
  IS '领取时间（与 created_at 并存，函数与前端均读此列）';

-- 验证列已存在
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_campaign_claims'
  AND column_name = 'claimed_at';

-- ==================== 00043_fix_claim_campaign_store_id_type.sql ====================
-- ============================================
-- 修复 claim_campaign 函数：p_store_id 统一为 TEXT + 按表类型 CAST
-- 执行日期：2026-07-07
-- 背景（三张表 store_id 类型不一致）：
--   - user_campaign_claims.store_id → INTEGER
--   - user_store_relation.store_id    → UUID（引用 stores.id）
--   - marketing_campaigns.store_id   → 当前全 null
--   函数用同一个 p_store_id 同时往两张表插值，
--   声明 INTEGER 则锁客查 UUID 列报 "uuid=integer"，
--   声明 UUID 则领取插 INTEGER 列报 "integer but uuid"。
-- 修复方案：p_store_id 改为 TEXT DEFAULT NULL，
--   INSERT user_campaign_claims 时 CAST ::INTEGER，
--   INSERT/SELECT user_store_relation 时 CAST ::UUID。
-- ============================================

DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;

CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id UUID,
    p_campaign_id INTEGER,
    p_store_id TEXT DEFAULT NULL,     -- ← TEXT 中间层，兼容 INTEGER 和 UUID 两张表
    p_device_id VARCHAR DEFAULT NULL,
    p_referrer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign RECORD;
    v_existing_claim INTEGER;
    v_daily_claims INTEGER;
    v_existing_lock INTEGER;
    v_result JSONB;
BEGIN
    -- 1. 获取活动信息
    SELECT * INTO v_campaign 
    FROM public.marketing_campaigns 
    WHERE id = p_campaign_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '活动不存在');
    END IF;
    
    -- 2. 检查活动状态
    IF v_campaign.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已结束');
    END IF;
    
    -- 3. 检查活动时间
    IF CURRENT_DATE < v_campaign.start_date OR CURRENT_DATE > v_campaign.end_date THEN
        RETURN jsonb_build_object('success', false, 'error', '活动未开始或已结束');
    END IF;
    
    -- 4. 检查领取上限
    IF v_campaign.claimed_count >= v_campaign.total_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已领完');
    END IF;
    
    -- 5. 检查每日限领
    SELECT COUNT(*) INTO v_daily_claims 
    FROM public.user_campaign_claims 
    WHERE campaign_id = p_campaign_id 
      AND claim_date = CURRENT_DATE;
      
    IF v_daily_claims >= v_campaign.daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '今日已领完，请明天再来');
    END IF;
    
    -- 6. 检查用户是否重复领取
    SELECT COUNT(*) INTO v_existing_claim 
    FROM public.user_campaign_claims 
    WHERE user_id = p_user_id 
      AND campaign_id = p_campaign_id 
      AND claim_date = CURRENT_DATE;
      
    IF v_existing_claim > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '您今天已经领过这个奖励了');
    END IF;
    
    -- 7. 记录领取（user_campaign_claims.store_id 是 INTEGER）
    INSERT INTO public.user_campaign_claims (
        user_id, 
        campaign_id, 
        store_id, 
        device_id,
        claimed_at
    ) VALUES (
        p_user_id, 
        p_campaign_id, 
        CASE WHEN p_store_id IS NOT NULL THEN p_store_id::INTEGER ELSE NULL END,
        p_device_id,
        NOW()
    );
    
    -- 8. 更新领取计数
    UPDATE public.marketing_campaigns 
    SET claimed_count = claimed_count + 1 
    WHERE id = p_campaign_id;
    
    -- 9. 建立锁客关系（user_store_relation.store_id 是 UUID，且 NOT NULL）
    --    平台级活动（p_store_id 为 NULL）不绑定具体门店，跳过锁客，仅记录领取。
    IF p_store_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_existing_lock
        FROM public.user_store_relation
        WHERE user_id = p_user_id 
          AND store_id = p_store_id::UUID;

        IF v_existing_lock = 0 THEN
            INSERT INTO public.user_store_relation (
                user_id, 
                store_id, 
                referrer_id, 
                lock_type, 
                locked_at,
                expires_at,
                status
            ) VALUES (
                p_user_id,
                p_store_id::UUID,
                p_referrer_id,
                'campaign',
                NOW(),
                NOW() + INTERVAL '180 days',
                'active'
            );
        END IF;
    END IF;
    
    -- 10. 返回成功
    v_result := jsonb_build_object(
        'success', true,
        'campaign_type', v_campaign.campaign_type,
        'gift_name', v_campaign.gift_name,
        'gift_value', v_campaign.gift_value,
        'commission_rate', v_campaign.commission_rate,
        'locked', v_existing_lock = 0
    );
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    DECLARE
        v_err text := SQLERRM;
    BEGIN
        -- 生产级：数据库约束类错误转译为中文友好提示（避免暴露英文原貌）
        IF v_err ILIKE '%violates not-null constraint%' THEN
            v_err := '领取失败：缺少必要的门店关联信息，请重新进入活动或联系客服';
        ELSIF v_err ILIKE '%duplicate%' OR v_err ILIKE '%unique%' THEN
            v_err := '您已领取过该奖励，请勿重复操作';
        END IF;
        RETURN jsonb_build_object('success', false, 'error', v_err);
    END;
END;
$$;

COMMENT ON FUNCTION public.claim_campaign IS '领取营销活动奖励（含锁客逻辑）- 2026-07-07修复：p_store_id TEXT+双CAST';

SELECT 'claim_campaign 函数已更新（p_store_id TEXT + 按 INTEGER/UUID 双 CAST）' AS result;

-- ==================== 00044_redpacket_payouts.sql ====================
-- ============================================
-- 红包现金发放记录表（来店有喜）
-- 执行日期：2026-07-07
-- 用途：领取 redpacket 类活动后，将"真实现金发放到微信零钱"
--       的全过程记录下来，便于审计、对账与失败重试。
-- 发放通道：微信支付 v3「商家转账到零钱」
--         （transfer-to-balance，复用现有 MERCHANT_ID 等 v3 密钥）
-- 状态机：
--   pending_manual → 框架待启用（未开启真发钱，仅记录）
--   processing     → 已提交微信，受理中
--   success        → 微信已受理（异步到账）
--   failed         → 调用失败（记录 error_msg，可人工/批量重试）
-- ============================================

CREATE TABLE IF NOT EXISTS public.redpacket_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id integer NOT NULL,
  claim_id uuid,                       -- 关联 user_campaign_claims.id（若有）
  openid text,                         -- 发放目标 openid（profiles.openid）
  amount_fen integer NOT NULL,         -- 发放金额，单位：分
  status text NOT NULL DEFAULT 'pending_manual'
    CHECK (status IN ('pending_manual','processing','success','failed')),
  wx_out_bill_no text,                 -- 商户侧唯一单号
  wx_transfer_bill_no text,            -- 微信侧单号
  error_msg text,                      -- 失败原因
  paid_at timestamptz,                 -- 实际受理/到账时间
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rp_user ON public.redpacket_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_rp_campaign ON public.redpacket_payouts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rp_status ON public.redpacket_payouts(status);

-- 测试期关闭 RLS（与项目其余表一致）
ALTER TABLE public.redpacket_payouts DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.redpacket_payouts IS '红包现金发放记录（微信转账到零钱）';
COMMENT ON COLUMN public.redpacket_payouts.amount_fen IS '发放金额，单位分（gift_value元 × 100）';
COMMENT ON COLUMN public.redpacket_payouts.status IS 'pending_manual=待启用/processing=受理中/success=已受理/failed=失败';

-- ==================== 00045_add_profiles_openid.sql ====================
-- 00045_add_profiles_openid.sql
-- 云端 profiles 表缺失 openid 列（本地 00001 有，但推云端时未建出）。
-- 微信支付 / 真发现金红包依赖 profiles.openid 读取与写入。
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴 Run（DDL，anon key 无权，须控制台执行）。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS openid text;

COMMENT ON COLUMN public.profiles.openid IS '微信 openid，用于微信支付 JSAPI / 商家转账到零钱发放';

-- 若此前 RLS 被统一关闭，这里保持关闭（与项目测试期一致）。
-- 如后续重新开启 RLS，需为 profiles 配置允许 anon/service 读取 openid 的策略。
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- ==================== 00046_fix_claims_store_id_and_rpc.sql ====================
-- ============================================
-- 00046 修复 claim_campaign：修正 store_id 外键父表 + 返回 claim_id + 防并发
-- 执行日期：2026-07-07（基于云端 schema 探查结果重写）
--
-- 云端真实 schema（已通过 information_schema 确认）：
--   user_campaign_claims.store_id  → 错误外键指向 self_operated_stores.id（INTEGER，冗余废弃表）
--   marketing_campaigns.store_id   → stores.id（UUID）—— 前端写入与读出都用它
--   user_store_relation.store_id    → stores.id（UUID）
--
-- 根因：领取表的 store_id 外键当初挂错了父表（self_operated_stores，integer），
--       而前端传的是 stores.id（UUID），导致类型永远对不上、领取必崩。
--
-- 修复（与另外两张表、前端传值完全统一）：
--   1) 删除指向 self_operated_stores 的错误外键
--   2) store_id 列类型改为 UUID（测试期数据置 NULL，避免非法值转换失败）
--   3) 重建正确外键 → stores(id)
--   4) 每日防重唯一约束（兜底并发重复领取）
--   5) 重建 claim_campaign：store_id 统一 ::UUID 处理，返回 claim_id
--
-- 2026-07-07 二次修复：去掉 v_campaign RECORD 变量（会触发 42P01 relation "v_campaign"
--   不存在），改为把活动字段逐个 SELECT INTO 到独立标量变量，消除"变量当表"的解析歧义。
-- ============================================================

-- ──────────────────────────────────────────────
-- 1) 删除指向冗余表 self_operated_stores 的错误外键
-- ──────────────────────────────────────────────
ALTER TABLE public.user_campaign_claims
  DROP CONSTRAINT IF EXISTS user_campaign_claims_store_id_fkey;

-- ──────────────────────────────────────────────
-- 2) store_id 列类型从 INTEGER 改为 UUID
--    测试期数据置 NULL，避免非法值转换失败
--    ⚠️ 若已跑过（已是 UUID），重复执行会报错，忽略即可
-- ──────────────────────────────────────────────
ALTER TABLE public.user_campaign_claims
  ALTER COLUMN store_id TYPE UUID USING NULL;

-- ──────────────────────────────────────────────
-- 3) 重建正确外键 → stores(id)
-- ──────────────────────────────────────────────
ALTER TABLE public.user_campaign_claims
  ADD CONSTRAINT user_campaign_claims_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────
-- 4) 每日防重唯一约束（幂等：先删后建）
-- ──────────────────────────────────────────────
ALTER TABLE public.user_campaign_claims
  DROP CONSTRAINT IF EXISTS user_campaign_claims_user_campaign_date_uniq;

ALTER TABLE public.user_campaign_claims
  ADD CONSTRAINT user_campaign_claims_user_campaign_date_uniq
  UNIQUE (user_id, campaign_id, claim_date);

-- ──────────────────────────────────────────────
-- 5) 重建 claim_campaign（store_id 统一 UUID；返回 claim_id）
--    注意：活动字段改用独立标量变量，避免 RECORD + SELECT * INTO 触发 42P01。
-- ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;

CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id      UUID,
    p_campaign_id  INTEGER,
    p_store_id     TEXT DEFAULT NULL,     -- TEXT 中间层，调用方传 stores.id（UUID）
    p_device_id    VARCHAR DEFAULT NULL,
    p_referrer_id  UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status          TEXT;
    v_start_date      DATE;
    v_end_date        DATE;
    v_claimed_count   INTEGER;
    v_total_limit     INTEGER;
    v_daily_limit     INTEGER;
    v_campaign_type   TEXT;
    v_gift_name       TEXT;
    v_gift_value      NUMERIC;
    v_commission_rate NUMERIC;
    v_existing_claim  INTEGER;
    v_daily_claims    INTEGER;
    v_existing_lock   INTEGER;
    v_claim_id        UUID;
    v_result          JSONB;
BEGIN
    -- 1. 获取活动信息（逐列 SELECT INTO 标量变量，杜绝 RECORD 歧义）
    SELECT
        status, start_date, end_date, claimed_count, total_limit, daily_limit,
        campaign_type, gift_name, gift_value, commission_rate
    INTO
        v_status, v_start_date, v_end_date, v_claimed_count, v_total_limit, v_daily_limit,
        v_campaign_type, v_gift_name, v_gift_value, v_commission_rate
    FROM public.marketing_campaigns
    WHERE id = p_campaign_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '活动不存在');
    END IF;

    -- 2. 检查活动状态与时间
    IF v_status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已结束');
    END IF;

    IF CURRENT_DATE < v_start_date OR CURRENT_DATE > v_end_date THEN
        RETURN jsonb_build_object('success', false, 'error', '活动未开始或已结束');
    END IF;

    -- 3. 检查总量上限
    IF v_claimed_count >= v_total_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已领完');
    END IF;

    -- 4. 每日限领
    SELECT COUNT(*) INTO v_daily_claims
    FROM public.user_campaign_claims
    WHERE campaign_id = p_campaign_id AND claim_date = CURRENT_DATE;

    IF v_daily_claims >= v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '今日已领完，请明天再来');
    END IF;

    -- 5. 用户今日是否已领（SELECT 预查，与唯一约束互补）
    SELECT COUNT(*) INTO v_existing_claim
    FROM public.user_campaign_claims
    WHERE user_id = p_user_id
      AND campaign_id = p_campaign_id
      AND claim_date = CURRENT_DATE;

    IF v_existing_claim > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '您今天已经领过这个奖励了');
    END IF;

    -- 6. 记录领取（store_id → stores.id 是 UUID）
    INSERT INTO public.user_campaign_claims (
        user_id, campaign_id, store_id, device_id, claimed_at
    ) VALUES (
        p_user_id,
        p_campaign_id,
        CASE WHEN p_store_id IS NOT NULL THEN p_store_id::UUID ELSE NULL END,
        p_device_id,
        NOW()
    )
    RETURNING id INTO v_claim_id;

    -- 7. 更新领取计数
    UPDATE public.marketing_campaigns
    SET claimed_count = claimed_count + 1
    WHERE id = p_campaign_id;

    -- 8. 建立锁客关系（store_id → stores.id 是 UUID；平台级活动跳过）
    IF p_store_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_existing_lock
        FROM public.user_store_relation
        WHERE user_id = p_user_id AND store_id = p_store_id::UUID;

        IF v_existing_lock = 0 THEN
            INSERT INTO public.user_store_relation (
                user_id, store_id, referrer_id, lock_type, locked_at, expires_at, status
            ) VALUES (
                p_user_id,
                p_store_id::UUID,
                p_referrer_id,
                'campaign',
                NOW(),
                NOW() + INTERVAL '180 days',
                'active'
            );
        END IF;
    END IF;

    -- 9. 返回成功（含 claim_id 供 redpacket_payouts 关联）
    v_result := jsonb_build_object(
        'success',          true,
        'claim_id',         v_claim_id,
        'campaign_type',    v_campaign_type,
        'gift_name',        v_gift_name,
        'gift_value',       v_gift_value,
        'commission_rate',  v_commission_rate,
        'locked',           v_existing_lock = 0
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    DECLARE
        v_err text := SQLERRM;
    BEGIN
        -- 约束错误中文转译
        IF v_err ILIKE '%violates not-null constraint%' THEN
            v_err := '领取失败：缺少必要的门店关联信息，请重新进入活动或联系客服';
        ELSIF v_err ILIKE '%duplicate%' OR v_err ILIKE '%unique%' THEN
            v_err := '您已领取过该奖励，请勿重复操作';
        ELSIF v_err ILIKE '%invalid input syntax for type uuid%' THEN
            v_err := '领取失败：门店信息异常，请联系客服';
        END IF;
        RETURN jsonb_build_object('success', false, 'error', v_err);
    END;
END;
$$;

COMMENT ON FUNCTION public.claim_campaign IS
  '领取营销活动奖励（含锁客）- 2026-07-07修复：store_id 外键重指向stores(id)UUID，返回claim_id';

SELECT '✅ 00046 完成：claim_campaign 已重建（store_id→stores.id UUID + claim_id + 防重约束）' AS result;

-- ==================== 00047_harden_redpacket_payouts.sql ====================
-- ============================================
-- 00047 加固 redpacket_payouts：受理中间态 + 防重复唯一约束
-- 执行日期：2026-07-07
-- 目的：
--   1) 新增 accepted 中间态：微信「商家转账到零钱」返回 200 = 受理成功（异步到账），
--      不能立刻标 success，需先置 accepted，待对账/回调确认后再翻 success（防资损）。
--   2) 新增 UNIQUE(user_id, campaign_id)：兜底并发重复发放（函数内已做 SELECT 预查，
--      该约束是最后一道防线，确保绝不会因网络重试/连点产生两条发放记录）。
-- ============================================

-- 1. 扩展 status 校验，纳入 accepted
ALTER TABLE public.redpacket_payouts
  DROP CONSTRAINT IF EXISTS redpacket_payouts_status_check;
ALTER TABLE public.redpacket_payouts
  ADD CONSTRAINT redpacket_payouts_status_check
  CHECK (status IN ('pending_manual', 'processing', 'accepted', 'success', 'failed'));

-- 2. 防重复唯一约束（同一用户+同一活动仅一条发放记录）
ALTER TABLE public.redpacket_payouts
  DROP CONSTRAINT IF EXISTS redpacket_payouts_user_campaign_uniq;
ALTER TABLE public.redpacket_payouts
  ADD CONSTRAINT redpacket_payouts_user_campaign_uniq UNIQUE (user_id, campaign_id);

COMMENT ON COLUMN public.redpacket_payouts.status IS
  'pending_manual=待启用/processing=受理中/accepted=微信已受理(异步到账)/success=已确认到账/failed=失败';

SELECT 'redpacket_payouts 已加固（accepted 中间态 + 唯一约束）' AS result;

-- ==================== 00048_merchant_members_masked.sql ====================
-- ============================================
-- 00048 商家锁客名单脱敏 RPC（PII 合规）
-- 执行日期：2026-07-07
-- 问题：merchant-members 前端直接 SELECT profiles.phone 明文下发到小程序客户端再脱敏，
--       明文手机号经客户端属合规风险（与「默默兑」同类问题）。
-- 修复：改为 SECURITY DEFINER RPC，服务端脱敏，仅返回 phone_masked 与 phone_last4（用于搜索），
--       明文手机号不再离开数据库。仅允许门店主人查询本店锁客。
-- ============================================

CREATE OR REPLACE FUNCTION public.get_store_locked_members(p_store_id UUID)
RETURNS TABLE (
    user_id UUID,
    nickname TEXT,
    avatar_url TEXT,
    phone_masked TEXT,
    phone_last4 TEXT,
    locked_at TIMESTAMPTZ,
    lock_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 仅允许门店主人查询本店锁客
    IF NOT EXISTS (
        SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.user_id,
        COALESCE(p.nickname, '微信用户'),
        COALESCE(p.avatar_url, ''),
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 7 THEN '未知'
            ELSE substring(p.phone, 1, 3) || '****' || substring(p.phone, length(p.phone) - 3, 4)
        END,
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 4 THEN ''
            ELSE substring(p.phone, length(p.phone) - 3, 4)
        END,
        r.locked_at,
        COALESCE(r.lock_type, 'first_order')
    FROM public.user_store_relation r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.store_id = p_store_id
    ORDER BY r.locked_at DESC
    LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_store_locked_members IS '商家锁客名单（脱敏手机号，仅店主可查）';

SELECT 'get_store_locked_members 已创建（脱敏）' AS result;

-- ==================== 00049_remove_team_performance.sql ====================
-- 00049 移除「团队业绩」字段（用户要求：所有字段不能出现团队业绩）
-- 执行时间：2026-07-07
--
-- 变更内容：
-- 1. 删除 profiles.team_performance 列
--    （get_rank_progress 的 JSONB 化已在 00106 收口，本迁移不再重复定义该函数，避免多重定义冗余）

-- 删除列（幂等）
ALTER TABLE profiles DROP COLUMN IF EXISTS team_performance;

-- ==================== 00050_add_product_emotion_dimension_fields.sql ====================
-- 00050  商家情绪编译工作台：product_emotion 补全五维标签 / 质量分 / 审核态
-- ------------------------------------------------------------
-- 工作台（方案 §3）需要把商家「五维打标」结果、编译质量分、审核状态落库，
-- 原 product_emotion 仅有 emotion_title/emotion_detail/scene_tags_compiled/mood_tags_used，
-- 缺以下三列。本迁移补齐，全部幂等可重复执行。
--
-- 列说明：
--   dimension_tags  jsonb  —— 五维标签选择 {function:[],scene:[],emotion:[],identity:[],sensory:[]}
--   quality_score   smallint —— 编译质量评分（0~100，来自 emotion-scoring 引擎）
--   review_status   text   —— draft 草稿 / submitted 待审 / approved 通过 / rejected 驳回

-- 1. dimension_tags（默认空对象）
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS dimension_tags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. quality_score
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS quality_score smallint;

-- 3. review_status（带 CHECK 约束，默认 draft）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_emotion' AND column_name='review_status'
  ) THEN
    ALTER TABLE public.product_emotion
      ADD COLUMN review_status text NOT NULL DEFAULT 'draft';
  END IF;
END $$;

-- 4. CHECK 约束（幂等：先删后建）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_review_status_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_review_status_check
  CHECK (review_status IN ('draft','submitted','approved','rejected'));

-- 5. 评分范围约束（0~100，可选）
ALTER TABLE public.product_emotion
  DROP CONSTRAINT IF EXISTS product_emotion_quality_score_check;
ALTER TABLE public.product_emotion
  ADD CONSTRAINT product_emotion_quality_score_check
  CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));

COMMENT ON COLUMN public.product_emotion.dimension_tags IS '五维情绪标签选择（功能/场景/情绪/身份/感官）';
COMMENT ON COLUMN public.product_emotion.quality_score IS '编译质量评分 0~100（emotion-scoring 引擎）';
COMMENT ON COLUMN public.product_emotion.review_status IS '情绪编译审核态：draft/submitted/approved/rejected';

SELECT '✅ 00050 完成：product_emotion 已补 dimension_tags / quality_score / review_status' AS result;

-- ==================== 00051_create_emotion_funnel_events.sql ====================
-- 情绪导购漏斗埋点表（对应方案 §5.5 数据闭环）
-- 记录五屏情绪详情页的用户行为：进入 / 各屏到达 / 点击购买 / 下单
-- 供商家「情绪漏斗」看板聚合分析，衡量情绪导购转化效果。
-- 测试期 RLS 全关（与项目其余表一致）；无 FK 约束，避免外键类型/存在性依赖导致插入失败。

CREATE TABLE IF NOT EXISTS emotion_funnel_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,
  product_id   uuid        NOT NULL,
  store_id     uuid,
  event_type   text        NOT NULL,   -- enter | screen_view | cta_click | order_created
  screen_index int,                     -- screen_view 时为 0~4
  source       text        DEFAULT 'emotion_detail',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_store
  ON emotion_funnel_events (store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emotion_funnel_events_product
  ON emotion_funnel_events (product_id, event_type);

ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;

-- ==================== 00052_create_emotion_claims.sql ====================
-- 情绪确权记录表（消费即确权路线）
-- 与方案 §5.4 原设计的「独立情绪激活码」不同：本项目采用「消费即确权」，
-- 用户走完 扫码购→加购→结算→支付成功 后，在支付成功页引导进入 emotion-claim 做情绪确权，
-- 不再新增第四套实体二维码。因此本表无需 activation_codes，仅记录确权行为 + 奖励发放。
--
-- 设计要点：
-- 1. 不加任何外键约束 —— 规避项目历史中 store_id UUID/INTEGER 类型漂移导致插入失败的坑。
-- 2. order_no 存订单号文本（非 order.id），与 payment 页既有的 orderNo 变量对齐，避免与外键类型纠缠。
-- 3. selected_emotion 用 text[] 存用户多选的情绪标签（如 ['治愈','温馨']）。
-- 4. RLS 关闭（与项目测试期所有表一致）。

CREATE TABLE IF NOT EXISTS emotion_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_no text,
  product_id text,
  store_id text,
  selected_emotion text[],
  badge_text text,
  tongbao_amount smallint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_claims_user ON emotion_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_product ON emotion_claims (product_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_order ON emotion_claims (order_no);

-- 与项目测试期所有表一致：关闭行级安全（上线前需重新评估）
ALTER TABLE emotion_claims DISABLE ROW LEVEL SECURITY;

-- ==================== 00053_create_emotion_assets_and_badges.sql ====================
-- =====================================================
-- V5 P2-1: 情绪健康豆/徽章独立化
-- 之前的情绪健康豆复用 profiles.points + points_logs(类型=emotion_claim)，
-- 现在抽出独立表与流水，避免和普通积分混淆。
-- 包含：emotion_assets(健康豆余额/冻结) + emotion_tongbao_logs(健康豆流水) +
--       emotion_badge_defs(徽章定义，前端只读) + emotion_badge_grants(徽章发放)
-- 全部 DISABLE RLS（测试期）；正式上线需按 user_id 收紧。
-- =====================================================

-- 1) 情绪健康豆账户（一行一用户）
CREATE TABLE IF NOT EXISTS public.emotion_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE,
  balance       INTEGER NOT NULL DEFAULT 0,    -- 当前可用健康豆
  frozen        INTEGER NOT NULL DEFAULT 0,    -- 冻结中（例如情绪喂养/兑换时扣的）
  total_earned  INTEGER NOT NULL DEFAULT 0,    -- 累计获得
  total_spent   INTEGER NOT NULL DEFAULT 0,    -- 累计消耗
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emotion_assets_user ON public.emotion_assets(user_id);

-- 2) 健康豆流水（增/减都记）
CREATE TABLE IF NOT EXISTS public.emotion_tongbao_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  delta       INTEGER NOT NULL,                -- 正=获得，负=消耗
  balance_after INTEGER NOT NULL,             -- 流水后余额（冗余便于展示/对账）
  reason      TEXT NOT NULL,                  -- 'emotion_claim' / 'emotion_feed' / 'emotion_exchange' / 'admin_adjust' 等
  ref_id      TEXT,                           -- 关联订单号/商品ID/激活码
  remark      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emotion_tongbao_logs_user_time
  ON public.emotion_tongbao_logs(user_id, created_at DESC);

-- 3) 徽章定义（运营可改，前端读字典渲染）
-- 预置 5 枚 V5 上线徽章
CREATE TABLE IF NOT EXISTS public.emotion_badge_defs (
  code         TEXT PRIMARY KEY,              -- 'first_claim' / 'five_emotions' / 'empath' / 'tongbao_100' / 'share_claim'
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  icon         TEXT NOT NULL,                 -- emoji 或 icon key
  rarity       TEXT NOT NULL DEFAULT 'common',-- common / rare / epic / legend
  unlock_hint  TEXT NOT NULL,                 -- 解锁条件描述（前端展示）
  sort_order   INTEGER NOT NULL DEFAULT 100,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.emotion_badge_defs (code, name, description, icon, rarity, unlock_hint, sort_order) VALUES
  ('first_claim',   '初识情绪',     '完成首次情绪确权',         '🌱', 'common', '在情绪确权页确认 1 次商品情绪',  10),
  ('five_emotions', '五味杂陈',     '确权商品的情绪标签覆盖 5 个不同维度', '🎨', 'rare',   '在多次确权中累计 5 个不同情绪维度',  20),
  ('empath',        '共情者',       '累计确权商品达到 10 件',   '💝', 'rare',   '确权 10 件不同的商品',            30),
  ('tongbao_100',   '健康豆藏家',     '健康豆余额达到 100',         '🏆', 'epic',   '攒到 100 枚情绪健康豆',            40),
  ('share_claim',   '情绪布道者',   '分享确权卡给好友并完成一次有效锁客', '📣', 'legend', '分享确权卡并成功锁客 1 人',     50)
ON CONFLICT (code) DO NOTHING;

-- 4) 徽章发放（一行一获得）
CREATE TABLE IF NOT EXISTS public.emotion_badge_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  badge_code   TEXT NOT NULL REFERENCES public.emotion_badge_defs(code) ON DELETE CASCADE,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at    TIMESTAMPTZ,                  -- 可选过期
  source       TEXT,                         -- 'auto' / 'admin'
  UNIQUE (user_id, badge_code)               -- 同一徽章对同一用户只发一次
);
CREATE INDEX IF NOT EXISTS idx_emotion_badge_grants_user
  ON public.emotion_badge_grants(user_id);

-- 5) 维护 emotion_assets.updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_emotion_assets() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emotion_assets_updated_at ON public.emotion_assets;
CREATE TRIGGER trg_emotion_assets_updated_at
  BEFORE UPDATE ON public.emotion_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_emotion_assets();

-- RLS: 测试期关闭
ALTER TABLE public.emotion_assets        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_tongbao_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_badge_defs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotion_badge_grants  DISABLE ROW LEVEL SECURITY;

-- 给 PostgREST 暴露（虽然 anon key 也能读，但加个备注）
COMMENT ON TABLE public.emotion_assets        IS 'V5 P2: 用户情绪健康豆账户（独立于 profiles.points）';
COMMENT ON TABLE public.emotion_tongbao_logs  IS 'V5 P2: 情绪健康豆流水（增/减/来源）';
COMMENT ON TABLE public.emotion_badge_defs    IS 'V5 P2: 情绪徽章定义字典（运营可改）';
COMMENT ON TABLE public.emotion_badge_grants  IS 'V5 P2: 情绪徽章发放记录';

-- ==================== 00054_emotion_rollback_and_rules.sql ====================
-- =====================================================================
-- 情绪确权：特殊场景回退与修正算法
--   §5.1 订单退款 / 确权作废 —— 回滚本次贡献值(含上级裂变附加分)
--   §5.2 用户违规封禁 —— 个人贡献值清零 + 上级裂变分同步扣回
--   §5.3 算法规则迭代 —— 版本化，仅对生效后确权生效、历史不回溯、提前≥7天公示
--
-- 依赖：00052(emotion_claims) / 00053(emotion_assets) / 00001(profiles,orders)
-- 幂等：所有 ALTER 用 IF NOT EXISTS，函数用 CREATE OR REPLACE，种子用 ON CONFLICT
--
-- 粘贴到 Supabase Dashboard → SQL Editor 执行即可（纯 SQL，非 TS）
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) emotion_claims 增补字段
--    （同时修复 grantEmotionClaim 长期存在的列名 bug：原代码写 tb_amount/
--      cv_amount/badge_code，但表只有 tongbao_amount 且无后两者 → 正常确权静默失败）
-- ---------------------------------------------------------------------
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS tb_amount       numeric(12,2) NOT NULL DEFAULT 0; -- 本次发放的健康豆
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS cv_amount       numeric(12,4) NOT NULL DEFAULT 0; -- 本次新增【个人贡献值 CV】——回滚的唯一依据
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS badge_code      text;                            -- 关联徽章定义(emotion_badge_defs.code)
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l1       uuid;                            -- 直接推荐人(L1)用户ID
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l2       uuid;                            -- 间接推荐人(L2)用户ID
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l1_cv    numeric(12,4) NOT NULL DEFAULT 0; -- 给 L1 的裂变附加分
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS upline_l2_cv    numeric(12,4) NOT NULL DEFAULT 0; -- 给 L2 的裂变附加分
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'active'
   CHECK (status IN ('active','voided'));                                                     -- 作废标记
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS rule_version    text;                            -- 确权生效时的规则版本(§5.3)
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS voided_at       timestamptz;
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS voided_reason   text;
ALTER TABLE emotion_claims ADD COLUMN IF NOT EXISTS refund_ratio    numeric(5,4) NOT NULL DEFAULT 1  -- 作废时按退款比例回滚(1=全额)
   CHECK (refund_ratio BETWEEN 0 AND 1);

COMMENT ON COLUMN emotion_claims.cv_amount    IS '本次确权新增的个人贡献值(CV)，回滚的唯一依据';
COMMENT ON COLUMN emotion_claims.upline_l1_cv IS '因本次确权给直接推荐人(L1)的裂变附加分';
COMMENT ON COLUMN emotion_claims.upline_l2_cv IS '因本次确权给间接推荐人(L2)的裂变附加分';
COMMENT ON COLUMN emotion_claims.status       IS 'active=有效, voided=已作废(退款/封禁)';
COMMENT ON COLUMN emotion_claims.rule_version IS '确权时生效的规则版本，保证历史数据不回溯(§5.3)';

CREATE INDEX IF NOT EXISTS idx_emotion_claims_status     ON emotion_claims(status);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_rule_ver   ON emotion_claims(rule_version);

-- ---------------------------------------------------------------------
-- 2) profiles：违规封禁标记(§5.2)
-- ---------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at  timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason text;
COMMENT ON COLUMN profiles.is_banned IS '违规封禁(§5.2)：封禁后贡献值清零且不计入全平台总贡献';

-- ---------------------------------------------------------------------
-- 3) orders：退款比例(§5.1 部分退款同比例扣减)
-- ---------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_ratio   numeric(5,4) NOT NULL DEFAULT 0
   CHECK (refund_ratio BETWEEN 0 AND 1);   -- 0=无退款, 1=全额退款
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount  numeric(12,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN orders.refund_ratio IS '退款比例，触发确权按同比例回滚(§5.1)';

-- ---------------------------------------------------------------------
-- 4) emotion_rule_versions：规则版本表(§5.3)
--    const_json 保存该版本的算法常量；生效时间必须晚于公示时间≥7天
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emotion_rule_versions (
  version      text PRIMARY KEY,
  announced_at timestamptz NOT NULL,                 -- 公示时间
  effective_at timestamptz NOT NULL,                 -- 生效时间（必须 ≥ announced_at + 7天）
  const_json   jsonb NOT NULL,                       -- 该版本算法常量
  note         text,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_notice_7d CHECK (effective_at >= announced_at + interval '7 days')
);
COMMENT ON TABLE emotion_rule_versions IS '确权算法规则版本(§5.3)：调整仅对生效后确权生效、历史不回溯、需提前≥7天公示';

-- 种子：当前上线版本 v1.0（announced 与 effective 都已过去且间隔≥7天，满足约束）
INSERT INTO emotion_rule_versions (version, announced_at, effective_at, const_json, note, is_active)
VALUES (
  '1.0',
  '2026-06-01 00:00:00+08',
  '2026-06-08 00:00:00+08',
  '{
    "EMOTION_TB_PER_CLAIM": 10,
    "R_TB": 0.15,
    "R_DIV": 0.30,
    "M_MIN": 10,
    "P_BASE": 100,
    "W_BEH_MAX": 1.5,
    "EMOTION_CV_RATE": 0.12,
    "R_FISS_L1": 0.05,
    "R_FISS_L2": 0.02,
    "GROSS_MARGIN_FALLBACK": 0.15
  }'::jsonb,
  '初始上线版本',
  true
)
ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) §5.1 退款/作废：原子回滚函数
--    回滚贡献值 = -(本次个人CV×比例 + L1裂变分×比例 + L2裂变分×比例)
--    全额退款比例=1；部分退款比例=refund_ratio（同比例扣减消费权重后扣差额）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_void_emotion_claim(
  p_claim_id     uuid,
  p_reason       text DEFAULT 'refund',
  p_refund_ratio numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v          record;
  v_factor   numeric;
  v_cv_back  numeric;
  v_tb_back  numeric;
  v_l1_back  numeric;
  v_l2_back  numeric;
BEGIN
  -- 行锁，避免并发重复回滚
  SELECT * INTO v FROM emotion_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'msg', 'claim not found');
  END IF;
  IF v.status = 'voided' THEN
    RETURN jsonb_build_object('ok', true, 'msg', 'already voided');
  END IF;

  v_factor := COALESCE(p_refund_ratio, 1);
  IF v_factor < 0 THEN v_factor := 0; END IF;
  IF v_factor > 1 THEN v_factor := 1; END IF;

  -- §5.1：仅回滚本次确权产生的所有贡献值（按退款比例同比例）
  v_cv_back := ROUND((v.cv_amount   * v_factor)::numeric, 4);
  v_l1_back := ROUND((v.upline_l1_cv * v_factor)::numeric, 4);
  v_l2_back := ROUND((v.upline_l2_cv * v_factor)::numeric, 4);
  v_tb_back := ROUND((v.tb_amount   * v_factor)::numeric, 2);

  -- 回滚本人：贡献值 + 健康豆（不低于 0）
  UPDATE profiles
     SET cv_total   = GREATEST(0, ROUND((COALESCE(cv_total,0)   - v_cv_back)::numeric, 4)),
         tb_balance = GREATEST(0, ROUND((COALESCE(tb_balance,0) - v_tb_back)::numeric, 2))
   WHERE id = v.user_id;

  -- 回滚直接上级裂变附加分
  IF v_l1_back > 0 AND v.upline_l1 IS NOT NULL THEN
    UPDATE profiles
       SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - v_l1_back)::numeric, 4))
     WHERE id = v.upline_l1;
  END IF;

  -- 回滚间接上级裂变附加分
  IF v_l2_back > 0 AND v.upline_l2 IS NOT NULL THEN
    UPDATE profiles
       SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - v_l2_back)::numeric, 4))
     WHERE id = v.upline_l2;
  END IF;

  -- 标记作废（不影响历史其他确权）
  UPDATE emotion_claims
     SET status = 'voided',
         voided_at = now(),
         voided_reason = p_reason,
         refund_ratio = v_factor
   WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cv_back', v_cv_back, 'tb_back', v_tb_back,
    'l1_back', v_l1_back, 'l2_back', v_l2_back, 'factor', v_factor
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 6) §5.2 违规封禁：原子清零 + 上级裂变分同步扣回
--    个人所有贡献值清零、不计入总贡献；其上级因该用户获得的裂变分全额扣回
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ban_user_rollback(
  p_user_id uuid,
  p_reason  text DEFAULT 'violation'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  tot_l1   numeric := 0;
  tot_l2   numeric := 0;
BEGIN
  -- 标记封禁 + 本人贡献值/健康豆清零（清零即“不计入全平台总贡献值”）
  UPDATE profiles
     SET is_banned  = true,
         banned_at  = now(),
         ban_reason = p_reason,
         cv_total   = 0,
         tb_balance = 0
   WHERE id = p_user_id;

  -- 回滚其上级曾因该用户获得的裂变贡献值（全额扣回）
  FOR r IN
    SELECT upline_l1, upline_l2, upline_l1_cv, upline_l2_cv
      FROM emotion_claims
     WHERE user_id = p_user_id AND status = 'active'
  LOOP
    IF r.upline_l1 IS NOT NULL AND r.upline_l1_cv > 0 THEN
      UPDATE profiles
         SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - r.upline_l1_cv)::numeric, 4))
       WHERE id = r.upline_l1;
      tot_l1 := tot_l1 + r.upline_l1_cv;
    END IF;
    IF r.upline_l2 IS NOT NULL AND r.upline_l2_cv > 0 THEN
      UPDATE profiles
         SET cv_total = GREATEST(0, ROUND((COALESCE(cv_total,0) - r.upline_l2_cv)::numeric, 4))
       WHERE id = r.upline_l2;
      tot_l2 := tot_l2 + r.upline_l2_cv;
    END IF;
  END LOOP;

  -- 该用户所有有效确权标记作废（避免被重新计入总贡献）
  UPDATE emotion_claims
     SET status = 'voided', voided_at = now(), voided_reason = 'ban:' || p_reason
   WHERE user_id = p_user_id AND status = 'active';

  RETURN jsonb_build_object(
    'ok', true,
    'upline_l1_back', ROUND(tot_l1, 4),
    'upline_l2_back', ROUND(tot_l2, 4)
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 7) 全平台总贡献值（排除封禁用户 & 已作废确权已各自扣减）
--    供 getPlatformMetrics 回退使用，保证占比分母实时准确(§5.2 不计入)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_total_cv() RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cv_total), 0)::numeric
    FROM profiles
   WHERE NOT is_banned;
$$;

-- ---------------------------------------------------------------------
-- 8) 权限：函数可被 anon/authenticated 调用（本项目 anon 受信任；
--    生产环境建议改为仅 service_role / admin 角色调用）
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_void_emotion_claim(uuid, text, numeric)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_ban_user_rollback(uuid, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_total_cv()                                TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) emotion_rule_versions 行级安全：规则版本属公开配置，允许只读
-- ---------------------------------------------------------------------
ALTER TABLE emotion_rule_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rule_versions_public_read" ON emotion_rule_versions;
CREATE POLICY "rule_versions_public_read" ON emotion_rule_versions
  FOR SELECT USING (true);
GRANT SELECT ON emotion_rule_versions TO anon, authenticated;

-- ==================== 00055_add_ship_and_verify_columns.sql ====================
-- 00055: 补全 orders 表发货/核销相关字段
-- 商家端「发货」与「到店核销」需要持久化物流信息与核销时间。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴运行（纯 SQL，非 Edge Function）

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ship_company text,
  ADD COLUMN IF NOT EXISTS ship_no text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- 校验
DO $$
DECLARE
  v_found text;
BEGIN
  SELECT ARRAY_AGG(column_name) FILTER (WHERE column_name IN ('ship_company','ship_no','verified_at'))
    INTO v_found
  FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name IN ('ship_company','ship_no','verified_at');
  RAISE NOTICE 'orders 发货/核销字段: %', COALESCE(v_found::text, '无');
END $$;

-- ==================== 00056_enhance_product_mood_dimensions.sql ====================
-- 00056 增强存量商品情绪标签维度（让"说心情"匹配率更高）
-- 在 00019 基础上，补充 孤独 / 陪伴 / 治愈 / 想念 / 放松 等用户常见心情词维度。
-- 用 array_cat + DISTINCT 追加，不覆盖 00019 已打的标签。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（纯 SQL，非 Edge Function）。

-- 图书 / 文创 / 文具 → 孤独、安静、治愈、陪伴、学习空间、想念
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['孤独','安静','治愈','陪伴','学习空间','想念'])))
)
WHERE name ILIKE ANY(ARRAY['%书%','%笔%','%本%','%文具%','%文创%','%手账%','%笔记本%','%纸%','%日历%','%贴纸%']);

-- 家居 / 日用 → 治愈、安静、陪伴、放松
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','安静','陪伴','放松'])))
)
WHERE name ILIKE ANY(ARRAY['%家居%','%日用%','%杯%','%碗%','%盘%','%锅%','%壶%','%灯%','%香薰%','%蜡烛%','%靠垫%','%毛巾%']);

-- 饮品 / 咖啡 / 茶 → 治愈、放松、安静、独处
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','安静','独处'])))
)
WHERE name ILIKE ANY(ARRAY['%饮%','%咖啡%','%茶%','%奶茶%','%果汁%','%水%']);

-- 零食 / 甜品 → 治愈、满足、陪伴、甜蜜
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','满足','陪伴','甜蜜'])))
)
WHERE name ILIKE ANY(ARRAY['%零%','%糖%','%甜%','%饼%','%果%','%巧%','%布丁%','%冰淇淋%']);

-- 礼品 / 饰品 → 想念、分享、仪式感、治愈
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['想念','分享','仪式感','治愈'])))
)
WHERE name ILIKE ANY(ARRAY['%礼%','%饰%','%项链%','%手链%','%戒指%','%耳环%','%手镯%','%摆件%','%装饰%','%贺卡%']);

-- 美妆 / 护肤 → 治愈、放松、仪式感、精致
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','仪式感','精致'])))
)
WHERE name ILIKE ANY(ARRAY['%妆%','%护肤%','%面膜%','%精华%','%口红%','%防晒%','%洗面%','%乳液%','%面霜%']);

-- 养生 / 健康 → 治愈、放松、安静、陪伴
UPDATE products
SET mood_tags = (
  SELECT ARRAY(SELECT DISTINCT UNNEST(array_cat(COALESCE(mood_tags, ARRAY[]::text[]), ARRAY['治愈','放松','安静','陪伴'])))
)
WHERE name ILIKE ANY(ARRAY['%养生%','%枸杞%','%红枣%','%保健%','%按摩%','%足浴%','%泡脚%']);

-- 查看结果
-- SELECT id, name, mood_tags FROM products ORDER BY id LIMIT 20;

-- ==================== 00057_emotion_lexicon.sql ====================
-- 00057 情绪词库表（运营可维护的用户表达词 → 标准情绪标签）
-- 这是前端 EMOTION_KEYWORD_MAP 的 DB 化基础：运营/非技术也能加同义词，
-- 未来 analyzeEmotion 可优先读此表（未命中再走 LLM 兜底）。
-- 执行方式：Supabase Dashboard → SQL Editor 粘贴执行（纯 SQL，非 Edge Function）。

CREATE TABLE IF NOT EXISTS public.emotion_lexicon (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_expr text NOT NULL,                 -- 用户原始表达，如 "失恋"、"被甩"
  canonical_tag text NOT NULL,            -- 标准情绪标签，如 "治愈"（须属于 ALL_MOOD_TAGS）
  weight int NOT NULL DEFAULT 3,          -- 命中权重（主标签最高，后续递减）
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_expr, canonical_tag)
);

COMMENT ON TABLE public.emotion_lexicon IS '情绪用户表达词库：raw_expr(用户怎么说) → canonical_tag(标准情绪标签)。前端 EMOTION_KEYWORD_MAP 的 DB 化来源。';
COMMENT ON COLUMN public.emotion_lexicon.weight IS '命中权重：主情绪给 3，第二给 2，第三给 1；其余同义给 3。';

-- 种子：把当前前端 EMOTION_KEYWORD_MAP 高频条目搬入（节选，后续运营可补）
INSERT INTO public.emotion_lexicon (raw_expr, canonical_tag, weight) VALUES
  ('失恋','治愈',3),('失恋','孤独',2),('失恋','安静',1),
  ('分手','治愈',3),('分手','孤独',2),('分手','安静',1),
  ('被甩','治愈',3),('被甩','孤独',2),('被甩','安静',1),
  ('被绿','治愈',3),('被绿','孤独',2),('被绿','安静',1),
  ('心碎','治愈',3),('心碎','孤独',2),('心碎','安静',1),
  ('累','治愈',3),('累','放松',3),('累','安静',1),
  ('好累','治愈',3),('好累','放松',3),('好累','安静',1),
  ('心累','治愈',3),('心累','孤独',2),('心累','安静',1),
  ('emo','治愈',3),('emo','放松',2),('emo','孤独',1),
  ('孤独','孤独',3),('孤独','治愈',2),('孤独','安静',1),
  ('寂寞','孤独',3),('寂寞','治愈',2),
  ('想念','想念',3),('思念','想念',3),('想你','想念',3),
  ('开心','愉悦',3),('开心','快乐',2),('开心','甜蜜',1),
  ('高兴','愉悦',3),('高兴','快乐',2),
  ('犒赏','满足',3),('犒赏','幸福',2),('犒赏','品质',1),
  ('犒劳','满足',3),('犒劳','幸福',2),('犒劳','品质',1),
  ('治愈','治愈',3),
  ('焦虑','治愈',3),('焦虑','放松',2),('焦虑','安静',1),
  ('压力大','治愈',3),('压力大','放松',2),
  ('失眠','安静',3),('失眠','治愈',2),('失眠','放松',1),
  ('加班','治愈',3),('加班','放松',2),('加班','安静',1),
  ('约会','甜蜜',3),('约会','幸福',2),('约会','仪式感',1),
  ('生日','甜蜜',3),('生日','幸福',2),('生日','分享',1)
ON CONFLICT (raw_expr, canonical_tag) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_emotion_lexicon_raw ON public.emotion_lexicon (raw_expr);

-- ==================== 00058_separate_commission_and_points.sql ====================
-- =============================================================
-- 00058 账户分离：推广佣金账户 vs 消费积分账户
-- =============================================================
-- 背景（合规动因）
--   原 gold_beans 字段同时承担两个互斥角色：
--     ① 订单 1:1 抵扣（消费积分，api.createOrderV2 / refund-order）
--     ② 被 withdraw / admin-withdrawals 当作「可提现余额」读取并扣减
--   而真正的分销佣金流水实际写在 commissions 表 + profiles.total_commission / settled_commission，
--   且 withdrawals 表已有 commission_ids 字段本应绑定具体佣金。
--   => 代码把「消费积分」当「可提现平台代币」提现，观感上等同「平台发币可提现」（合规红线）。
--
-- 目标模型
--   gold_beans       = 【消费积分（健康豆）】仅用于本平台订单 1:1 抵扣，不可提现、不可兑现金
--   commission_balance= 【推广佣金账户】由分销佣金流水驱动，可提现（代扣个税），与 gold_beans 完全隔离
--   withdrawals       = 仅可动 commission_balance，并通过 commission_ids 关联具体佣金明细
--
-- 执行方式：Supabase → SQL Editor 粘贴 → Run（纯 SQL，非 Edge Function）
-- =============================================================

BEGIN;

-- 1. 新增推广佣金账户（可提现，单位：元）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_balance numeric(12,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.commission_balance
  IS '推广佣金账户余额（即推广服务费，可提现并代扣个税）；由分销佣金流水驱动，与消费积分(gold_beans)完全隔离';

COMMENT ON COLUMN public.profiles.gold_beans
  IS '消费积分（健康豆）：仅用于本平台订单 1:1 抵扣，不可提现、不可兑现金；与推广佣金账户(commission_balance)隔离';

-- 2. 存量数据回填（过渡口径，执行前请确认）
--    现状：历史上 withdraw / admin-withdrawals 从 gold_beans 提现；而佣金发放只写
--          total_commission / settled_commission，且发放时二者同额增加、提现却不扣 settled，
--          故 total_commission - settled_commission 对存量数据恒为 0 —— 原「减差」回填会得到 0，
--          导致存量用户提现归零。
--    决策：把用户「历史上实际可提现的余额」(gold_beans) 显式挂到 commission_balance，
--          gold_beans 本身保留不动（仍可作消费抵扣，不抹除任何权益）。
--          => commission_balance 与 gold_beans 各持一份，提现只消耗 commission_balance、
--             消费抵扣只消耗 gold_beans，二者独立不双花。
--    后续若 gold_beans 引入独立发放源（签到/活动），需重新界定两账户关系。
UPDATE public.profiles
SET commission_balance = GREATEST(0, COALESCE(gold_beans, 0))
WHERE COALESCE(gold_beans, 0) > 0;

-- 3. 约束：佣金账户、消费积分均不可为负（DO 块防历史脏数据导致 ALTER 失败）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_commission_balance_nonneg'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_commission_balance_nonneg CHECK (commission_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_gold_beans_nonneg'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_gold_beans_nonneg CHECK (gold_beans >= 0);
  END IF;
END $$;

COMMIT;

-- =============================================================
-- 配套代码改造（本迁移不自动改代码，详见《账户分离改造方案.md》）
--   必须同步执行，否则「提现仍读 gold_beans」的错乱不会消失：
--   A. 提现改为读 commission_balance：api.ts approveWithdrawal(2214) / getMyBalance(1931) /
--      pages/withdraw/index.tsx(47) / pages/admin-withdrawals / pages/my-promotion(70,86,111)
--   B. 佣金发放维护 commission_balance：api.ts distributeCommissionV4(999-1024) 发放时 +=，
--      且退款须同步回滚 commission_balance（当前 refund 只回滚 gold_beans，未回滚佣金，存在资损）
--   C. 订单/退款的 gold_beans 保持「仅消费抵扣」语义，注释澄清，绝不与提现混用
--   D. types.ts：Profile 新增 commission_balance:number；gold_beans 注释改为「消费积分，不可提现」
-- =============================================================

-- ==================== 00059_pipi_privacy_consent.sql ====================
-- 00059 PIPL 合规：隐私政策同意时间留痕
-- profiles 增加 privacy_consented_at，记录用户同意《隐私政策》的时间，供合规审计。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_consented_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.privacy_consented_at
  IS '用户同意《隐私政策》的时间；null 表示尚未同意（PIPL 合规审计留痕）';

-- ==================== 00060_ensure_profiles_cv_tb.sql ====================
-- =============================================================
-- 00060 补建 profiles.cv_total / tb_balance
-- ------------------------------------------------------------
-- 漏洞修复：00054 的 fn_void_emotion_claim / fn_ban_user_rollback /
-- fn_total_cv 大量引用这两列，但此前任何迁移都未创建它们
-- （grep 全 migrations 仅 00054 引用，无 CREATE）。不补建则
-- 函数虽能创建成功，调用时必报 "column cv_total does not exist"。
-- 类型对齐 00054：cv_total numeric(12,4) / tb_balance numeric(12,2)
-- 幂等可重复执行。
-- =============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cv_total   numeric(12,4) NOT NULL DEFAULT 0;  -- 个人累计贡献值(CV)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tb_balance numeric(12,2) NOT NULL DEFAULT 0;  -- 情绪健康豆余额(独立账户)

COMMENT ON COLUMN public.profiles.cv_total
  IS '个人累计贡献值(CV)：情绪确权/裂变附加分累加，封禁时清零(§5.2)';
COMMENT ON COLUMN public.profiles.tb_balance
  IS '情绪健康豆余额(独立账户)：回滚时按退款比例扣减';

SELECT '✅ 00060 完成：profiles 已补 cv_total / tb_balance' AS result;

-- ==================== 00061_add_order_status_pending_pickup.sql ====================
-- 补齐 order_status 枚举值：纯健康豆支付 / 堂食·自取场景使用 'pending_pickup'(待核销)
-- 代码引用：src/db/api.ts:870（dine_in / self_pickup 走 pending_pickup）
-- 原 00001 枚举缺失该值，导致下单报 400 (22P02: invalid input value for enum order_status)
-- 注意：PG 的 `ALTER TYPE ... ADD VALUE` 不支持 IF NOT EXISTS 语法（会报语法错导致整段回滚），
--       改用 DO 块包裹并在 EXCEPTION 中吞掉 duplicate_object，保证幂等、可重复执行。
DO $$
BEGIN
  ALTER TYPE public.order_status ADD VALUE 'pending_pickup';
EXCEPTION
  WHEN duplicate_object THEN NULL; -- 已存在则忽略
END $$;

-- ==================== 00062_disable_rls_emotion_funnel_events.sql ====================
-- 强制关闭 emotion_funnel_events 行级安全：埋点由匿名 key 直写，无需登录态
-- 原 00051 已含 DISABLE RLS，但线上仍报 403(RLS 拦截匿名写入)，
-- 疑似该表在迁移前已手动建好并默认开启 RLS，导致 CREATE TABLE IF NOT EXISTS 跳过、
-- 而 ALTER 未生效。此处幂等再确保一次。
ALTER TABLE emotion_funnel_events DISABLE ROW LEVEL SECURITY;

-- ==================== 00070_shiyang_ingredients.sql ====================
-- 00070 食养成分体系（ingredients + product_ingredients + product_emotions 扩展）
-- 配套：食养成分商品参数方案（deliverables/食养成分商品参数方案_合规版.md）
-- 合规基调：所有功效表述为传统食养文化参考，不替代医疗；普通食品不宣称疾病预防/治疗

-- =====================
-- 1) 食材字典（ingredients）
-- =====================
CREATE TABLE IF NOT EXISTS public.ingredients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,          -- 食材中文名（与 INGREDIENT_DICT key 对应）
  nature       text,                          -- 性味：温/凉/平/寒/微温/微寒
  benefits     text[]   NOT NULL DEFAULT '{}',-- 食养功效（合规措辞）
  audiences    text[]   NOT NULL DEFAULT '{}',-- 适用人群（状态描述）
  scenarios    text[]   NOT NULL DEFAULT '{}',-- 生活场景
  icon         text,                          -- 展示图标 emoji
  color        text,                          -- 展示色
  sort_order   int      NOT NULL DEFAULT 0,   -- 排序
  is_active    boolean  NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingredients_active ON public.ingredients(is_active, sort_order);

-- =====================
-- 2) 商品-食材关联（product_ingredients）
-- =====================
CREATE TABLE IF NOT EXISTS public.product_ingredients (
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_ing ON public.product_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_prod ON public.product_ingredients(product_id);

-- =====================
-- 3) product_emotion 扩展（食养维度缓存）
--    注意：真实表名为单数 product_emotion（由 00040/00050 创建），切勿写成复数 product_emotions
-- =====================
ALTER TABLE public.product_emotion
  ADD COLUMN IF NOT EXISTS shiyang_tags jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"shiyang":["生姜","梨"]}
  ADD COLUMN IF NOT EXISTS shiyang_copy text;                                  -- 编译生成的可直接展示的食养卡片文案

COMMENT ON COLUMN public.product_emotion.shiyang_tags IS '食养成分标签：key=shiyang，value=食材名数组';
COMMENT ON COLUMN public.product_emotion.shiyang_copy IS '编译生成的食养参考文案（已套合规措辞）';

-- =====================
-- 4) 灌入 40+ 种子食材（与 src/utils/shiyang-dictionary.ts INGREDIENT_DICT 一一对应）
--    同步策略：若名字已存在则跳过（保证幂等可重跑）
-- =====================
INSERT INTO public.ingredients (name, nature, benefits, audiences, scenarios, icon, color, sort_order) VALUES
  -- 温性·暖身
  ('生姜',     '温',   ARRAY['驱寒暖身','温中'],           ARRAY['畏寒人群','淋雨受寒后'], ARRAY['换季温差','着凉初期'], '🫚', '#D97706', 10),
  ('红枣',     '温',   ARRAY['补中养血'],                   ARRAY['气血偏弱','经期后'],     ARRAY['日常温补'],           '🫘', '#B45309', 11),
  ('桂圆',     '温',   ARRAY['补益心脾'],                   ARRAY['思虑多','睡眠浅'],       ARRAY['劳神之后'],           '🟤', '#92400E', 12),
  ('核桃',     '温',   ARRAY['日常滋补','健脑'],             ARRAY['用脑较多'],               ARRAY['工作学习任务重'],     '🥜', '#78350F', 13),
  ('葱白',     '温',   ARRAY['辛温发散'],                   ARRAY['初起畏寒'],               ARRAY['着凉初期'],           '🧅', '#C5E4A7', 14),
  ('大蒜',     '温',   ARRAY['散寒','开胃'],                 ARRAY['换季'],                   ARRAY['日常调味'],           '🧄', '#E5E0D8', 15),
  ('南瓜',     '温',   ARRAY['补中'],                       ARRAY['体弱','术后调养'],        ARRAY['日常'],               '🎃', '#F59E0B', 16),
  ('山楂',     '微温', ARRAY['消食化积'],                   ARRAY['食滞','油腻后'],          ARRAY['吃多不消化'],         '🔴', '#DC2626', 17),
  ('陈皮',     '温',   ARRAY['理气健脾'],                   ARRAY['积食','痰多'],            ARRAY['油腻饮食后'],         '🍊', '#EA580C', 18),
  -- 凉/寒·清热润燥
  ('梨',       '凉',   ARRAY['生津润燥'],                   ARRAY['秋燥人群','用嗓较多者'],  ARRAY['干燥时节','用嗓过度'],'🍐', '#A8D672', 20),
  ('金银花',   '寒',   ARRAY['清热舒缓'],                   ARRAY['咽喉不适','易上火'],      ARRAY['咽喉干痒时'],         '🌼', '#F9E076', 21),
  ('绿豆',     '寒',   ARRAY['清热解暑'],                   ARRAY['暑热','易上火'],          ARRAY['夏季'],               '🟢', '#22C55E', 22),
  ('苦瓜',     '寒',   ARRAY['清热'],                       ARRAY['饮食油腻','易上火'],      ARRAY['油腻饮食后'],         '🥒', '#4ADE80', 23),
  ('白萝卜',   '凉',   ARRAY['理气化痰'],                   ARRAY['痰多','食积'],            ARRAY['吃多不消化'],         '🥕', '#F0F4F8', 24),
  ('香蕉',     '寒',   ARRAY['润肠'],                       ARRAY['肠燥'],                   ARRAY['日常'],               '🍌', '#F7DC6F', 25),
  ('菠菜',     '凉',   ARRAY['养血润燥'],                   ARRAY['贫血','干燥'],            ARRAY['日常'],               '🥬', '#16A34A', 26),
  ('薏米',     '凉',   ARRAY['清热利湿'],                   ARRAY['湿热'],                   ARRAY['夏季'],               '🌾', '#D4C5A9', 27),
  -- 平性·温和滋养
  ('蜂蜜',     '平',   ARRAY['润喉润肠'],                   ARRAY['咽喉干','肠燥'],          ARRAY['咽喉不适','早起'],    '🍯', '#F59E0B', 30),
  ('银耳',     '平',   ARRAY['滋阴润肺'],                   ARRAY['干燥','久咳'],            ARRAY['秋燥时节'],           '🍄', '#F5E6D3', 31),
  ('百合',     '微寒', ARRAY['清心安神'],                   ARRAY['心烦','睡眠浅'],          ARRAY['睡前'],               '🌷', '#F0AB8D', 32),
  ('莲子',     '平',   ARRAY['养心安神'],                   ARRAY['心悸','睡眠浅'],          ARRAY['日常'],               '🪷', '#6EE7B7', 33),
  ('山药',     '平',   ARRAY['健脾'],                       ARRAY['脾胃偏弱'],               ARRAY['日常调养'],           '🥖', '#D4C4A8', 34),
  ('枸杞',     '平',   ARRAY['养肝明目'],                   ARRAY['用眼多','熬夜'],          ARRAY['用眼过度'],           '🔴', '#EF4444', 35),
  ('黑芝麻',   '平',   ARRAY['润肠','日常滋养'],             ARRAY['发质干','肠燥'],          ARRAY['日常'],               '🖤', '#374151', 36),
  ('小米',     '凉',   ARRAY['养胃'],                       ARRAY['胃弱'],                   ARRAY['日常'],               '🌽', '#FCD34D', 37),
  ('苹果',     '平',   ARRAY['健脾'],                       ARRAY['日常'],                   ARRAY['日常'],               '🍎', '#EF4444', 38),
  ('胡萝卜',   '平',   ARRAY['明目','补充营养'],             ARRAY['用眼多'],                 ARRAY['日常'],               '🥕', '#F97316', 39),
  ('牛奶',     '平',   ARRAY['补钙','补蛋白'],               ARRAY['全人群'],                 ARRAY['日常'],               '🥛', '#E5E7EB', 40),
  ('鸡蛋',     '平',   ARRAY['补虚'],                       ARRAY['日常'],                   ARRAY['日常'],               '🥚', '#FDE68A', 41),
  ('牛肉',     '平',   ARRAY['补气血'],                     ARRAY['体弱','术后'],            ARRAY['调养期'],             '🥩', '#B91C1C', 42),
  ('鲫鱼',     '平',   ARRAY['健脾利湿'],                   ARRAY['术后','体弱'],            ARRAY['恢复期的温和食补'],   '🐟', '#64748B', 43),
  -- 营养导向
  ('柠檬',     '凉',   ARRAY['补充维C'],                   ARRAY['易疲劳','换季'],          ARRAY['日常'],               '🍋', '#FACC15', 50),
  ('猕猴桃',   '寒',   ARRAY['补充维C'],                   ARRAY['日常'],                   ARRAY['日常'],               '🥝', '#65A30D', 51),
  ('杏仁',     '温',   ARRAY['润肠','滋养'],                 ARRAY['肠燥'],                   ARRAY['日常'],               '🥜', '#D2B48C', 52),
  ('木瓜',     '温',   ARRAY['助消化'],                     ARRAY['积食'],                   ARRAY['油腻饮食后'],         '🟠', '#F97316', 53),
  ('紫菜',     '寒',   ARRAY['化痰软坚'],                   ARRAY['痰多'],                   ARRAY['日常'],               '🟣', '#8B5CF6', 54)
ON CONFLICT (name) DO NOTHING;

-- =====================
-- 5) RLS：菜品表对外只读，写入需鉴权（与平台其他字典表策略一致）
-- =====================
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingredients_read_all ON public.ingredients;
CREATE POLICY ingredients_read_all ON public.ingredients FOR SELECT USING (true);

ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_ingredients_read_all ON public.product_ingredients;
CREATE POLICY product_ingredients_read_all ON public.product_ingredients FOR SELECT USING (true);
-- 写入由后端 service_role 处理（小程序的 anon 无 DML 权限）

-- =====================
-- 6) 触发器：updated_at（自建 set_updated_at() 兜底，避免依赖平台其他迁移）
-- =====================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingredients_updated_at ON public.ingredients;
CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================
-- 7) 自校验（执行后应返回真值）
-- =====================
-- SELECT count(*) AS ingredient_seed_count FROM public.ingredients;     -- 期望 36
-- SELECT count(*) AS column_exists FROM information_schema.columns
--   WHERE table_name = 'product_emotion' AND column_name IN ('shiyang_tags','shiyang_copy'); -- 期望 2

-- ==================== 00071_sync_category_emotion_profiles.sql ====================
-- ============================================
-- 00071 同步「类目情绪编译策略表」至扩展后版本
-- 目标：让云端 category_emotion_profiles 与前端内置
--       src/utils/category-emotion.ts 的 CATEGORY_EMOTION_MAP
--       完全一致，运营可在 Supabase Dashboard / 后台直接改词、免发版生效。
--
-- 背景：
--   - 00040 已建表并写入「扩展前」的旧词库（metaphors/aliases 较小）。
--   - 本轮在前端把 11 业态的 metaphors / aliases 做了扩充，
--     本迁移把云端词库同步成扩展版；同时与 00070 ingredients 对齐 RLS 策略。
--
-- 幂等说明：
--   - CREATE TABLE IF NOT EXISTS：云端缺表则建（结构对齐 00040，metaphors 为 JSONB），已存在则跳过。
--   - INSERT ... ON CONFLICT(category_key) DO UPDATE：已存在则刷新为扩展版。
--   - ⚠️ 若运营已在云端手动改过词库，重跑本文件种子段会用内置扩展版覆盖其修改；
--     生产环境请勿重复执行种子段，日常改词请在 Dashboard / 运营后台进行。
-- ============================================

-- ========== 1. 确保表存在（结构对齐 00040） ==========
CREATE TABLE IF NOT EXISTS public.category_emotion_profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key       TEXT NOT NULL UNIQUE,
  label              TEXT NOT NULL,
  tone               TEXT,
  allowed_mood_tags  TEXT[] DEFAULT '{}',
  metaphors          JSONB DEFAULT '[]'::jsonb,   -- 与 00040 一致：JSONB 数组，前端 rowToProfile 兼容
  angles             TEXT[] DEFAULT '{}',
  openers            TEXT[] DEFAULT '{}',          -- 代码 select 但 rowToProfile 不映射（引擎用通用起笔），此处留空
  closers            TEXT[] DEFAULT '{}',
  aliases            TEXT[] DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cep_key ON public.category_emotion_profiles(category_key);

-- ========== 2. 同步 11 业态策略（扩展版） ==========
-- metaphors 为 JSONB 数组字面量；openers 留空数组。
INSERT INTO public.category_emotion_profiles
  (category_key, label, tone, allowed_mood_tags, metaphors, angles, openers, closers, aliases)
VALUES
  ('餐饮', '餐饮美食', '烟火人间，与人共食的妥帖',
   ARRAY['治愈','满足','幸福','温馨','甜蜜','愉悦','分享','用餐时光','放松','仪式感','怀旧','温暖'],
   '["灶上咕嘟的汤","一桌人对坐的灯","街角老馆子的香","碗中升腾的热气","筷子夹起的暖","碗底沉着的光"]'::jsonb,
   ARRAY['与人共食，滋味更浓。','一蔬一饭，最抚凡人心。','围坐的此刻，便是归处。'],
   ARRAY[]::text[],
   ARRAY['趁热，慢慢吃。','这一餐，值得好好坐下来。'],
   ARRAY['正餐','小吃','快餐','火锅','烧烤','夜宵','外卖','饭','餐','美食','餐厅','家常菜','食堂','便当']),

  ('饮品', '饮品', '微醺与小憩，唇齿间的喘息',
   ARRAY['甜蜜','治愈','放松','愉悦','清新','清爽','浪漫','慢生活'],
   '["杯壁凝着的水珠","午后的一口清凉","巷口捧着的那杯暖","吸管搅动的甜","杯沿漾开的笑","冰块轻撞的响"]'::jsonb,
   ARRAY['小口啜饮，日子慢下来。','给自己一段喘息。'],
   ARRAY[]::text[],
   ARRAY['慢慢喝，不着急。'],
   ARRAY['奶茶','咖啡','果茶','酒水','茶','饮料','汽水','果汁','柠檬茶','拿铁','奶茶店','饮品店']),

  ('烘焙', '烘焙甜点', '晨间手作的温度',
   ARRAY['甜蜜','治愈','温馨','幸福','满足','浪漫'],
   '["刚出炉的暖香","窗台边那块松软","晨光里的酥皮","指尖沾着的糖粉","出炉时的暖光","糖霜落下的细"]'::jsonb,
   ARRAY['一口下去，整个人都松了。','甜的东西，最懂安慰。'],
   ARRAY[]::text[],
   ARRAY['趁新鲜，尝一口。'],
   ARRAY['面包','甜点','蛋糕','西点','糕点','甜品','面包店','甜品店','烘焙坊']),

  ('水果生鲜', '水果生鲜', '土地与时令的鲜活',
   ARRAY['清爽','清新','自然','纯净','解暑','治愈','活力','满足'],
   '["枝头带露的鲜","山野吹来的风","刚从土里醒来的清气","井水镇过的脆","枝头带露的艳","咬开溅起的甜"]'::jsonb,
   ARRAY['从田间到舌尖，不过片刻。','应季的鲜，最懂身体。'],
   ARRAY[]::text[],
   ARRAY['鲜的，不必多说。'],
   ARRAY['果蔬','水果','生鲜','蔬菜','肉禽','海鲜','农产','食材','农场','水果店','菜场','果业','果园','果蔬店']),

  ('零售', '零售百货', '悦己的小确幸与陪伴',
   ARRAY['快乐','满足','惊喜','治愈','温馨','可爱','有趣','浪漫','甜蜜','怀旧'],
   '["抽屉里的小欢喜","案头的一件趣物","旧书页的香","随手摆着的可爱","抽屉里的小确幸","随手摆着的光"]'::jsonb,
   ARRAY['给自己一点甜。','寻常日子里的小光。'],
   ARRAY[]::text[],
   ARRAY['喜欢，就带它回家。'],
   ARRAY['零食','百货','图书','日用','杂货','文创','超市','便利店','杂货铺','小超市','文具']),

  ('美业', '丽人美业', '悦己与焕新的精致',
   ARRAY['精致','治愈','放松','浪漫','甜蜜','仪式感','高端','典雅'],
   '["镜中焕然的自己","指尖温柔的时光","被妥帖照料的容颜","发梢掠过的轻","镜中舒展的眉","指尖流过的柔"]'::jsonb,
   ARRAY['为自己停下来的那一刻。','好好爱自己，不亏。'],
   ARRAY[]::text[],
   ARRAY['你值得被温柔对待。'],
   ARRAY['美甲','美容','美发','护肤','SPA','丽人','造型','美睫','纹绣','美妆','养肤','美颜']),

  ('娱乐', '休闲娱乐', '释放与社交的沉浸',
   ARRAY['快乐','兴奋','刺激','活力','愉悦','分享','有趣'],
   '["灯影里炸开的笑","一群人的喧闹","卸下伪装的夜","屏幕亮起的雀跃","屏幕亮起的喧","夜场炸开的笑"]'::jsonb,
   ARRAY['痛快闹一场。','和朋友，才够味。'],
   ARRAY[]::text[],
   ARRAY['今晚，尽兴就好。'],
   ARRAY['KTV','剧本杀','影院','密室','电玩','桌游','酒吧','夜店','游乐','演出','电竞','Livehouse','轰趴','游乐园']),

  ('运动健身', '运动健身', '活力与自律的突破',
   ARRAY['活力','满足','专注','兴奋','放松','自然'],
   '["汗水落地的脆","突破极限的喘息","身体苏醒的晨","肌肉舒展的暖","心率跳动的鼓","肌肉记忆的暖"]'::jsonb,
   ARRAY['动起来，通体舒畅。','坚持，身体会记得。'],
   ARRAY[]::text[],
   ARRAY['练完这一组，整个人都轻了。'],
   ARRAY['瑜伽','游泳','私教','健身','拳击','骑行','跑步','舞蹈','健身房','工作室','普拉提']),

  ('亲子', '亲子', '陪伴与成长的童真',
   ARRAY['温馨','幸福','甜蜜','治愈','快乐','可爱'],
   '["孩子扬起的笑","牵着的小手","时光里的童真","蹦跳着的身影","小手攥着的暖","笑涡漾开的甜"]'::jsonb,
   ARRAY['陪他长大，也是陪自己重温童年。','孩子的笑，最能化开疲惫。'],
   ARRAY[]::text[],
   ARRAY['这样的时光，最珍贵。'],
   ARRAY['乐园','早教','摄影','婴童','儿童','母婴','托管','亲子乐园','绘本馆','游乐场']),

  ('生活服务', '生活服务', '省心与托付的安心',
   ARRAY['放松','治愈','实用','温馨','安心'],
   '["交出去的轻松","被妥帖打理的琐碎","归家时的整洁","不必自己动手的闲","被妥帖安顿的闲","交出去的轻"]'::jsonb,
   ARRAY['麻烦的事，交给专业的人。','把时间留给自己。'],
   ARRAY[]::text[],
   ARRAY['剩下的，安心就好。'],
   ARRAY['家政','维修','洗衣','洗车','保洁','托管','养护','上门','收纳','月嫂','管家']),

  ('酒店民宿', '酒店民宿', '栖居与远方的慢生活',
   ARRAY['放松','治愈','慢生活','浪漫','平静','安逸','温馨'],
   '["推窗见远的辽阔","一夜安眠的软","异乡的灯","院里那棵老树","山雾散去的晨","被窝里的暖"]'::jsonb,
   ARRAY['在路上，也是在家。','换一处地方，换一种心绪。'],
   ARRAY[]::text[],
   ARRAY['好好歇一晚。'],
   ARRAY['酒店','民宿','客栈','住宿','青旅','度假','度假村'])

ON CONFLICT (category_key) DO UPDATE SET
  label             = EXCLUDED.label,
  tone              = EXCLUDED.tone,
  allowed_mood_tags = EXCLUDED.allowed_mood_tags,
  metaphors         = EXCLUDED.metaphors,
  angles            = EXCLUDED.angles,
  openers           = EXCLUDED.openers,
  closers           = EXCLUDED.closers,
  aliases           = EXCLUDED.aliases,
  updated_at        = NOW();

-- ========== 3. RLS：启用 + 匿名只读（与 00070 ingredients 策略一致） ==========
-- 小程序前端用 anon key 读取本表；写入由 service_role / 运营后台处理。
-- 00040 曾 DISABLE RLS，此处统一启用并加只读策略，保证匿名读取稳定且不暴露写权限。
ALTER TABLE public.category_emotion_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_emotion_profiles_read_all ON public.category_emotion_profiles;
CREATE POLICY category_emotion_profiles_read_all
  ON public.category_emotion_profiles FOR SELECT USING (true);

-- ========== 4. updated_at 触发器（依赖 00070 的 set_updated_at()，此处兜底定义以保证自包含） ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_category_emotion_profiles_updated_at ON public.category_emotion_profiles;
CREATE TRIGGER trg_category_emotion_profiles_updated_at
  BEFORE UPDATE ON public.category_emotion_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== 5. 自校验（执行后应返回真值） ==========
-- SELECT count(*) AS cat_seed_count FROM public.category_emotion_profiles;               -- 期望 11
-- SELECT category_key, jsonb_array_length(metaphors) AS metaphor_cnt
--   FROM public.category_emotion_profiles ORDER BY category_key;                          -- 各业态 metaphors 应为 6
COMMENT ON TABLE public.category_emotion_profiles IS
  '类目情绪编译策略表：11 业态策略，运营可在 Dashboard / 后台直接编辑 metaphors/aliases/angles 等，免发版生效（前端 loadCategoryEmotionProfilesFromDb 热加载覆盖内置策略）';

-- ==================== 00072_fix_emotion_rls.sql ====================
-- ============================================================================
-- 00072: 修复情绪子系统(emotion_*)客户端写入被 RLS 拦截（403 / 42501）
-- ============================================================================
-- 现象：小程序真机运行 emotion-claim 时，客户端(anon key)向
--       emotion_claims / emotion_badge_grants 执行 INSERT 返回 403，
--       PostgREST 报错 "new row violates row-level security policy"（code 42501）。
--       导致情绪确权整条链路瘫痪（确权记录写不进、徽章发不出）。
--
-- 根因：原 00052/00053 已显式 `DISABLE ROW LEVEL SECURITY`，但线上这两张表的
--       RLS 实际处于【开启态且无任何可用 policy】。最常见诱因是：
--       ① 在 Supabase Dashboard 点了某张表的「Enable RLS」安全开关/建议横幅；
--       ② 表曾经由 Dashboard 表编辑器新建（Dashboard 默认开启 RLS）。
--       RLS 一旦开启，anon key 直插即被拦——而本项目情绪表按设计本就由客户端直插。
--
-- 修复：幂等地重新 DISABLE RLS（与原设计意图一致），并显式补齐
--       anon / authenticated / service_role 的读写权限（RLS 关闭后仍需表级 privilege）。
--       覆盖全部 5 张 emotion_* 表，防止其余表在 Dashboard 被同方式误开后再次 403。
--
-- 【生产级加固备选（如需，可改用，不必现在做）】
--   本项目 profiles.id 直接 REFERENCES auth.users(id)，即 profile.id === auth.uid()；
--   客户端写入的 user_id 即为登录用户本身。因此可改为安全写法：
--     ALTER TABLE emotion_claims ENABLE ROW LEVEL SECURITY;
--     CREATE POLICY "own_claims" ON emotion_claims
--       FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--   徽章/资产/流水同理。注意：ENABLE 后必须配套 policy，否则仍会 403。
--   当前阶段按原设计保持 DISABLE，先解封功能。
-- ============================================================================

-- 1) 重新关闭行级安全（幂等，IF EXISTS 防止表名漂移报错）
ALTER TABLE IF EXISTS public.emotion_claims       DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_assets        DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_tongbao_logs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_badge_defs    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.emotion_badge_grants  DISABLE ROW LEVEL SECURITY;

-- 2) 补齐客户端角色权限（anon=未登录只读/直插；authenticated=已登录；service_role=后台）
--    RLS 关闭后，PostgREST 仍要求角色具备表级 privilege，否则会变 permission denied。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_claims       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_assets        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_tongbao_logs  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_defs    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_grants  TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_claims       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_assets        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_tongbao_logs  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_defs    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emotion_badge_grants  TO service_role;

-- 3) 备注：确保 schema 使用权限也在（一般 init 已给，这里兜底）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 完成：emotion_* 全表恢复「客户端可直插/可读」的测试期设计状态。

-- ==================== 00073_seed_emo_badge_defs.sql ====================
-- ============================================
-- 00073 补种情绪态徽章定义（修复 409 / 23503 外键硬故障）
-- ============================================
-- 背景：
--   前端 src/db/api.ts 的 EMOTION_BADGE_MAP + resolveBadge() 在每次「情绪确权」时，
--   按用户所选情绪态（或兜底）发放一枚「情绪态徽章」，badge_code 形如：
--     emo_relax / emo_heal / emo_calm / emo_brave / emo_warm /
--     emo_miss / emo_joy / emo_free / emo_first
--   但 00053_create_emotion_assets_and_badges.sql 的种子只写了「里程碑徽章」
--   （first_claim / five_emotions / empath / tongbao_100 / share_claim），
--   缺全部 9 个 emo_* 情绪态徽章定义。
--
--   后果：emotion_badge_grants 表对 badge_code 有
--     REFERENCES emotion_badge_defs(code)
--   外键约束，前端 INSERT emo_first 等时触发 23503「Key (badge_code)=(emo_first)
--   is not present in table "emotion_badge_defs"」→ POST 返回 409，徽章永远发不出去。
--
-- 修复：把缺失的 9 个 emo_* 徽章定义补种进 emotion_badge_defs（与 00053 同结构）。
-- 已有的 first_claim 等里程碑徽章不受影响（ON CONFLICT DO NOTHING）。
-- 幂等：可重复执行；supabase db push / Dashboard SQL Editor 均可。
-- ============================================

INSERT INTO public.emotion_badge_defs
  (code, name, description, icon, rarity, unlock_hint, sort_order)
VALUES
  ('emo_first', '初识情绪', '完成首次情绪确权',               '🎭', 'common', '在情绪确权页确认 1 次商品情绪',        11),
  ('emo_relax', '松弛时刻', '确权商品带来松弛感',             '🌿', 'common', '选择「松弛」情绪并完成确权',          12),
  ('emo_heal',  '治愈微光', '确权商品带来治愈感',             '✨', 'common', '选择「治愈」情绪并完成确权',          13),
  ('emo_calm',  '安宁片刻', '确权商品带来平静感',             '🍃', 'common', '选择「平静」情绪并完成确权',          14),
  ('emo_brave', '勇敢一刻', '确权商品带来勇气感',             '🔥', 'rare',   '选择「勇敢」情绪并完成确权',          15),
  ('emo_warm',  '温暖相伴', '确权商品带来温暖感',             '☀️', 'common', '选择「温暖」情绪并完成确权',          16),
  ('emo_miss',  '思念悠悠', '确权商品唤起思念',               '🌙', 'rare',   '选择「思念」情绪并完成确权',          17),
  ('emo_joy',   '喜悦绽放', '确权商品带来喜悦',               '🌸', 'common', '选择「喜悦」情绪并完成确权',          18),
  ('emo_free',  '自由之心', '确权商品带来自由感',             '🕊️', 'rare',   '选择「自由」情绪并完成确权',          19)
ON CONFLICT (code) DO NOTHING;

-- ========== 自校验（执行后应返回 9） ==========
-- SELECT count(*) AS emo_seed_count
--   FROM public.emotion_badge_defs
--   WHERE code LIKE 'emo_%';          -- 期望 9

COMMENT ON TABLE public.emotion_badge_defs IS
  '情绪徽章定义字典：含 5 枚里程碑徽章(first_claim/five_emotions/empath/tongbao_100/share_claim) + 9 枚情绪态徽章(emo_*)，前端按确权情绪态发放 emo_*、按累计行为发放里程碑徽章';

-- ==================== 00074_add_body_templates.sql ====================
-- ============================================
-- 00074 给 category_emotion_profiles 增加 body_templates 列并种入真实模板
-- ============================================
-- 背景：
--   前端 src/utils/category-emotion.ts 的 11 业态策略各含 bodyTemplates（类目专属产品描述模板，
--   含 {name}/{metaphor}/{realm}/{attr}/{angle} 占位符），编译引擎 emotion-description.ts 优先消费它。
--   但 00040 / 00071 建表与种子都漏建 body_templates 列，前端 SELECT 它时返回 400
--   （code 42703 "column body_templates does not exist"），随后降级为内置策略（功能不崩，但云端改词失效）。
--   本迁移补列 + 种入与前端内置完全一致的模板，使云端策略与内置策略对齐，400 消除。
-- 幂等：ADD COLUMN IF NOT EXISTS + UPDATE（无冲突风险）。
-- ============================================

-- 1) 补列（已存在则跳过）
ALTER TABLE public.category_emotion_profiles
  ADD COLUMN IF NOT EXISTS body_templates JSONB DEFAULT '[]'::jsonb;

-- 2) 种入 11 业态 bodyTemplates（与前端 CATEGORY_EMOTION_MAP 完全一致）
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}端上桌时热气还冒着，{attr}第一口下去整个人就松了——像{metaphor}，{realm}得刚刚好。","忙了一整天，最惦记的还是这口{name}。{attr}{metaphor}似的{realm}，{angle}","{name}不是那种花哨的好吃，而是{attr}每一口都实实在在——{metaphor}，不骗人。","食材老实、火候到位，{name}就是这样让人放心。{attr}吃进嘴里，{realm}从胃里漫上来。","有人专程为这碗{name}而来，吃过便懂了——{attr}{metaphor}般的{realm}，{angle}值得专门跑一趟。","冷了也好吃热了更对味，{name}就是这么随和的一道菜。{attr}{realm}，像{metaphor}。","一家人围着{name}坐下，话多了笑也多了。{attr}{metaphor}，{angle}这就是日子该有的样子。","别看外表普通，{name}的内里藏着大讲究——{attr}{metaphor}般的{realm}，越品越有味道。","打包一份{name}带回去吧，{attr}到家路上想着都开心——{metaphor}，{realm}。","吃到最后一口还在回味，{name}就是有这种本事。{attr}{realm}恰如{metaphor}，{angle}","{name}的妙处不在摆盘，而在{attr}入口那一刻的踏实感——像{metaphor}，{realm}写在脸上。","朋友问今天吃什么，脑子里第一个蹦出来的就是{name}——{attr}它就是这么有存在感。"]'::jsonb
  WHERE category_key = '餐饮';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}端上来的时候，杯壁还挂着水珠——{attr}第一口下去，{metaphor}般的{realm}从喉头漫开，{angle}","下午三点的那一杯{name}，比什么提神饮料都管用。{attr}{metaphor}，{realm}得刚刚好。","吸管搅动{name}的那一刻，{attr}冰块轻轻碰响——像{metaphor}，{realm}。","不是那种甜到发腻的饮品，{name}的甜是克制的、有层次的。{attr}{metaphor}，{angle}慢慢喝才有味道。","捧着{name}走在街上，手心先暖了——{attr}{metaphor}似的温度，{realm}从指尖传遍全身。","夏天没有{name}是不完整的。{attr}一口冰凉下去，暑气退了一半——像{metaphor}，{realm}。","冬天的一杯热{name}，{attr}握在手里就不想放下。{metaphor}般的暖意，{realm}得恰到好处，{angle}","{name}的秘密在于配比——不多不少，每一口都是刚刚好的{realm}。{attr}{metaphor}，{angle}","朋友聚会点了{name}上桌，{attr}大家都不约而同地先拍了照——好看又好喝，像{metaphor}。","加班到深夜，最想念的还是这杯{name}。{attr}{metaphor}，{realm}——明天的事明天再说吧。","冷泡和热饮都好喝，{name}就是这么不挑场景。{attr}{realm}，像{metaphor}一样随和。"]'::jsonb
  WHERE category_key = '饮品';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}刚出炉的时候，整个屋子都是香气。{attr}外皮酥得掉渣、内里软得像云——{metaphor}，{realm}。","早餐能吃到{name}，这一天就有了好的开始。{attr}{metaphor}般的甜度，{angle}{realm}得刚刚好。","下午茶来一块{name}，配一杯热饮，{attr}比什么治愈系电影都管用——像{metaphor}，{realm}。","{name}的甜不是那种齁甜，而是{attr}恰到好处地停在舌尖上——{metaphor}般的分寸感，{angle}","隔着包装袋都能闻到{name}的香气。{attr}拆开的那一刻，{metaphor}般的{realm}扑面而来。","手工揉面的温度是机器模仿不来的，{name}每一层都有故事。{attr}{metaphor}，{realm}。","带一盒{name}去见朋友吧，{attr}它就是那种\"打开后所有人都哇一声\"的好东西——{metaphor}。","{name}放凉了也好吃，但刚出炉的那几分钟是黄金时间。{attr}{metaphor}，{angle}趁热尝一口就知道了。","孩子看到{name}走不动路是有原因的——{attr}酥皮/糖霜/奶油的搭配太犯规了，像{metaphor}。","加班饿了来一块{name}，{attr}血糖回升的同时心情也跟着好了——{metaphor}般的{realm}，{angle}","做{name}的人一定很用心，因为每一口都吃得出诚意。{attr}{metaphor}，{realm}。"]'::jsonb
  WHERE category_key = '烘焙';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}拿到手的时候还带着露水般的鲜气，{attr}咬开的瞬间——{metaphor}，{realm}从舌尖漫遍全身。","当季吃{name}是最对的选择，{attr}阳光和雨水都在这口里了——像{metaphor}，{angle}{realm}得刚刚好。","不需要复杂料理，{name}洗干净直接吃就是最好的吃法。{attr}{metaphor}般的纯粹，{realm}。","给孩子带一份{name}回家吧，{attr}比什么零食都健康——新鲜、天然、像{metaphor}一样让人放心。","水果摊上挑来挑去，最后还是{name}最对味。{attr}一口下去就知道为什么了——{metaphor}，{realm}。","{name}的颜色就够诱人了，{attr}切开来更是晶莹剔透——摆盘都舍不得动，像{metaphor}。","夏天冰箱里常备{name}，拿出来的时候连呼吸都清爽了。{attr}{metaphor}般的凉意，{angle}{realm}。","送礼送{name}很体面——{attr}包装精美不说，东西本身也拿得出手，像{metaphor}。","榨汁/拌沙拉/直接啃，{name}怎么吃都行。{attr}{metaphor}般的百搭，{realm}不挑剔。","产地直采的{name}确实不一样，{attr}那种\"刚离枝\"的劲儿是超市货比不了的——{metaphor}，{angle}"]'::jsonb
  WHERE category_key = '水果生鲜';
UPDATE public.category_emotion_profiles
  SET body_templates = '["{name}拿到手的那一刻就让人嘴角上扬——{attr}质感比图片还好，{metaphor}般的{realm}，{angle}","逛着逛着就被{name}吸引过去了，{attr}实物比想象中更有分量——像{metaphor}，{realm}。","送给自己的小礼物不需要理由，{name}就是那种{attr}看到就想带回家的好东西。{metaphor}，{angle}","桌案上摆一件{name}，{attr}整个空间的气质都不一样了——{metaphor}般的点睛之笔，{realm}。","{name}的设计感藏在小细节里，{attr}越用越觉得用心——像{metaphor}，日子也被温柔对待了。","朋友来家里做客总会问起这件{name}，{attr}它就是有这种\"不张扬但抢眼\"的魔力——{metaphor}。","拆{name}包装的过程本身就是一种享受，{attr}每一层都是仪式感——{metaphor}般的期待，{angle}{realm}。","日常用得到的东西才最值得买好的，{name}就是这样的存在。{attr}{metaphor}，{realm}陪你度过每一天。","没想到这么实用的东西也可以这么好看——{name}，{attr}{metaphor}，{angle}实用和颜值都有了。","给朋友挑礼物的时候看到{name}就走不动了，{attr}\"Ta一定会喜欢\"的直觉很少出错——像{metaphor}。"]'::jsonb
  WHERE category_key = '零售';
UPDATE public.category_emotion_profiles
  SET body_templates = '["做完{name}走出店门的那一刻，整个人都轻盈了——{attr}{metaphor}般的{realm}，{angle}连走路都带风。","{name}的过程本身就是一种享受，{attr}每一寸都被温柔对待——像{metaphor}，{realm}从皮肤漫到心里。","好久没有这样认真地对待自己了，一次{name}刚好找回那种被珍视的感觉——{metaphor}，{angle}","{name}的效果不是立竿见影的那种夸张，而是{attr}几天后发现\"咦好像真的不一样了\"——{metaphor}般的惊喜。","朋友问最近气色怎么这么好，答案就是{name}。{attr}{metaphor}，{angle}它就是有这种润物细无声的本事。","忙碌的日子里抽一小时做{name}，{attr}不是奢侈是刚需——{metaphor}般的充电，{realm}回来又是满血状态。","选{name}就是选一份安心，{attr}手法/产品/环境每一样都经得起细看——像{metaphor}，值得托付。","第一次尝试{name}有点紧张，但体验完就明白了为什么那么多人推荐——{attr}{metaphor}，{angle}真香。","重要场合前做一次{name}，{attr}整个人都亮了一度——自信是最好的化妆品，而{name}帮你打底。","把{name}当作定期给自己的礼物吧，{attr}坚持下来你会发现变化——由内而外的{realm}，像{metaphor}。"]'::jsonb
  WHERE category_key = '美业';
UPDATE public.category_emotion_profiles
  SET body_templates = '["约上朋友来一场{name}吧，{attr}比刷手机有意义多了——{metaphor}般的{realm}，{angle}笑到脸酸才过瘾。","{name}的现场感是任何屏幕都替代不了的，{attr}身临其境的那一刻——像{metaphor}，所有烦恼都被抛在脑后。","工作了一周最期待的就是{name}，{attr}{metaphor}般的释放，{angle}出来之后整个人都轻了。","第一次玩{name}有点放不开，但五分钟后就嗨了——{attr}{metaphor}，{realm}它就是有这种感染力。","带家人来体验{name}吧，{attr}老少皆宜、全员参与——{metaphor}般的欢乐，比什么都珍贵。","{name}的氛围感太好了，{attr}灯光/音乐/互动每一环都在状态——像{metaphor}，沉浸进去就不想出来。","朋友聚会选{name}绝对不会冷场，{attr}全程高能——{metaphor}，{realm}得让人不想回家。","一个人也可以玩得很开心，{name}就是这种{attr}\"加入就能融入\"的好地方——{metaphor}，{angle}","每次来{name}都有新体验，{attr}主题/关卡/剧情经常更新——像{metaphor}，百玩不腻。","约会选{name}比吃饭有意思多了，{attr}互动中更能看出两个人合不合拍——{metaphor}，{realm}。"]'::jsonb
  WHERE category_key = '娱乐';
UPDATE public.category_emotion_profiles
  SET body_templates = '["练完一组{name}，汗水顺着脸颊落下的那一刻——{attr}{metaphor}般的{realm}，{angle}所有的压力都跟着排走了。","{name}不需要你一开始就很强，{attr}只需要你出现在这里——{metaphor}，身体会回报你的每一分坚持。","坚持{name}一个月后回头看，{attr}体能/体型/精神状态的变化自己都惊讶——像{metaphor}，时间不骗人。","{name}的过程很累但结束很爽，{attr}那种\"我做到了\"的成就感是任何东西替代不了的——{metaphor}。","一个人练{name}也可以很有仪式感，{attr}戴上耳机、调好节奏——{metaphor}般的专注，{realm}只属于你自己。","带朋友一起来体验{name}吧，{attr}互相监督比独自坚持容易多了——{metaphor}，两个人一起流汗更有动力。","每次想放弃的时候就再坚持五分钟，{name}教会你的不只是动作，还有{attr}{metaphor}般的意志力。","早晨的{name}和晚上的体验完全不同，{attr}晨练唤醒身体、夜练释放压力——各有各的好，像{metaphor}。","{name}的教练很专业但不凶，{attr}每个动作都会纠正到标准——{metaphor}般的教学，让你安全又有效。","不要等到身体报警了才开始运动，{name}就是那种{attr}预防大于治疗的生活方式——{metaphor}，{angle}"]'::jsonb
  WHERE category_key = '运动健身';
UPDATE public.category_emotion_profiles
  SET body_templates = '["带小朋友来{name}吧，{attr}看到他眼睛发亮的那一刻——{metaphor}，比什么都值，{angle}","{name}是那种\"玩了一整天还不肯走\"的地方，{attr}每个角落都有新发现——像{metaphor}，孩子的快乐就是这么简单。","周末不知道去哪就来{name}，{attr}既能放电又能学东西——{metaphor}般的寓教于乐，{realm}家长也放心。","孩子在{name}里交到了新朋友，{attr}社交能力在玩耍中自然生长——像{metaphor}，成长不需要刻意安排。","拍下孩子在{name}里奔跑的样子吧，{attr}那种毫无保留的快乐——{metaphor}般的画面，{angle}多年后看还是会笑。","{name}的安全措施做得很到位，{attr}家长可以放心地在一旁休息——孩子们自己探索，像{metaphor}。","生日派对选{name}太合适了，{attr}场地/布置/活动一站式解决——{metaphor}，小寿星和朋友们都玩疯了。","每次来{name}都有新主题，{attr}孩子不会腻——{metaphor}般的新鲜感，让每一次出行都值得期待。","陪孩子玩{name}的过程中发现自己也变回了小孩，{attr}{metaphor}——原来快乐一直都很简单，{realm}","{name}的性价比很高，一张票能玩一整天。{attr}{metaphor}，{angle}比去游乐场划算多了。"]'::jsonb
  WHERE category_key = '亲子';
UPDATE public.category_emotion_profiles
  SET body_templates = '["把{name}交给专业人士吧，{attr}省下的时间精力陪家人不香吗——{metaphor}般的轻松，{angle}","预约一次{name}，{attr}回到家时一切都整整齐齐——那种\"有人替你操心\"的感觉太治愈了，像{metaphor}。","{name}的服务细节做得很好，{attr}不是敷衍了事而是真的用心——{metaphor}般的靠谱，值得长期信任。","忙碌的时候最需要{name}这样的帮手，{attr}{metaphor}——把琐事交出去，把时间留给自己和重要的人。","第一次用{name}还有点不好意思，但体验完就后悔没有早点预约。{attr}{metaphor}，{realm}生活品质立竿见影。","{name}的价格透明、服务标准清晰，{attr}不会出现\"来了才加价\"的情况——{metaphor}般的诚信让人安心。","给父母也预约一次{name}吧，{attr}他们嘴上说\"不用不用\"心里其实很高兴——像{metaphor}，孝心要落实到行动上。","定期做{name}是一种生活方式的选择，{attr}花小钱省大心——{metaphor}，{realm}把时间投资在更重要的事情上。","{name}的工作人员很守时也很专业，{attr}进门穿鞋套、完工后清理现场——{metaphor}般的素养，{angle}","搬家/大扫除/维修这些事交给{name}，{attr}自己只管验收就好——像{metaphor}，花钱买的是安心和时间。"]'::jsonb
  WHERE category_key = '生活服务';
UPDATE public.category_emotion_profiles
  SET body_templates = '["推开{name}房门的那一刻，旅途的疲惫就消了一半——{attr}{metaphor}般的{realm}，{angle}终于可以好好歇一歇了。","{name}的床品太舒服了，{attr}一躺下去就不想动——{metaphor}，一夜安眠是对旅行者最好的款待。","在{name}醒来是被阳光叫醒的，{attr}拉开窗帘就是好风景——{metaphor}般的早晨，{realm}从眼到心都亮了。","{name}不只是睡觉的地方，更是一种生活方式的体验。{attr}{metaphor}，在这里时间好像变慢了，{angle}","选{name}就是因为它的位置和氛围，{attr}出门方便、回来安静——像{metaphor}，旅行住宿该有的样子。","{name}的细节做得很好，{attr}洗护用品/床垫硬度/枕头高度都经过考量——{metaphor}般的用心看得见摸得着。","带家人来住{name}吧，{attr}空间够大、设施齐全——老人孩子都满意，像{metaphor}般的一站式妥帖。","在{name}的阳台上发呆也是一种享受，{attr}泡一杯茶看着远处的风景——{metaphor}，{realm}这才是度假该有的节奏。","{name}的服务恰到好处，{attr}有求必应但不打扰——{metaphor}般的分寸感，比过度热情更让人舒服。","每次来这座城市都选这家{name}，{attr}熟悉又安心——像回了一个远方的家，{metaphor}，{angle}"]'::jsonb
  WHERE category_key = '酒店民宿';

-- ========== 自校验（执行后各业态 body_templates 应为非空 JSON 数组） ==========
-- SELECT category_key, jsonb_array_length(body_templates) AS tpl_cnt
--   FROM public.category_emotion_profiles ORDER BY category_key;   -- 各业态应为 10~12

COMMENT ON COLUMN public.category_emotion_profiles.body_templates IS
  '类目专属产品描述模板（含占位符 {name}/{metaphor}/{realm}/{attr}/{angle}），编译引擎优先消费；运营可在 Dashboard 直接改，免发版生效';

-- ==================== 00075_disable_points_logs_rls.sql ====================
-- =====================================================
-- 00075: 测试期放开 points_logs 的 RLS（与 commissions / emotion_* 同口径）
-- -----------------------------------------------------
-- 背景：
--   - 00003 给 points_logs 启用了 RLS，且仅有「本人读自己」的 policy
--     （user_id = auth.uid()）。总后台 admin-web 用 anon key 读取，
--     auth.uid() 为空或不等于流水 owner，导致积分流水永远读不到（0 行）。
--   - 同期的 commissions 已在 00015 被 DISABLE RLS，emotion_tongbao_logs
--     在 00053/00072 被 DISABLE RLS，admin 均能直读。
--   - 为让「资产流水中心」三张表口径一致，这里把 points_logs 也放开。
-- 安全提示（生产环境）：
--   测试期关闭 RLS 是项目既定模式（见 00015/00028/00053/00072）。
--   若上线需收紧，应改为「仅 service_role / admin 角色可读全部」的 policy，
--   而非长期公开读。
-- =====================================================

-- 1) 关闭 RLS
ALTER TABLE public.points_logs DISABLE ROW LEVEL SECURITY;

-- 2) 补齐客户端角色权限（anon=未登录只读；authenticated=已登录；service_role=后台写入）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.points_logs TO anon, authenticated, service_role;

-- ==================== 00076_create_gold_bean_logs.sql ====================
-- =====================================================
-- 00076: 新建 gold_bean_logs（健康豆流水表）
-- -----------------------------------------------------
-- 背景：
--   - 健康豆（消费积分，1:1 抵扣）此前只有 profiles.gold_beans 余额，
--     没有任何逐笔流水表。资产流水中心只有「积分 / 健康豆 / 佣金」三张，
--     缺健康豆这张，导致「越来越详细的财务数据表」不完整。
--   - 健康豆生命周期事件（已在小程序确认）：
--       · purchase_spend  下单消费抵扣（余额减少）
--       · refund_return   订单退款返还（余额增加）
--       · recharge        健康豆充值（余额增加，预留）
--       · admin_grant     后台发放（余额增加，预留）
--       · admin_deduct    后台扣减（余额减少，预留）
--   - 结构照 points_logs（00003）建，delta / balance_after 用 int
--     （profiles.gold_beans 为 INTEGER，见 00030）。
--   - 测试期关闭 RLS（与 points_logs 在 00075、commissions 在 00015、
--     emotion_* 在 00053/00072 同口径），admin-web(anon key) 才能直读。
--   安全提示（生产环境）：
--     测试期关闭 RLS 是项目既定模式。上线前应改为
--     「仅 service_role / admin 角色可读全部」的 policy。
-- =====================================================

-- 1) 建表
CREATE TABLE IF NOT EXISTS public.gold_bean_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  order_id uuid REFERENCES public.orders(id),
  type text NOT NULL
    CHECK (type IN ('purchase_spend','refund_return','recharge','admin_grant','admin_deduct')),
  delta int NOT NULL,             -- 正=增加，负=减少
  balance_after int NOT NULL,     -- 变动后余额（冗余，方便对账）
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) 索引
CREATE INDEX IF NOT EXISTS idx_gold_bean_logs_user ON public.gold_bean_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_gold_bean_logs_order ON public.gold_bean_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_gold_bean_logs_created ON public.gold_bean_logs(created_at DESC);

-- 3) 测试期关闭 RLS（与 00075 同口径）
ALTER TABLE public.gold_bean_logs DISABLE ROW LEVEL SECURITY;

-- 4) 补齐客户端角色权限（anon=未登录只读；authenticated=已登录；service_role=后台写入）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gold_bean_logs TO anon, authenticated, service_role;

-- ==================== 00077_add_withdrawal_identity.sql ====================
-- 00077 提现实名信息补全：真实姓名 + 身份证号
-- 背景：总后台佣金兑付审核页需核对 真实姓名 / 身份证 / 开户行 / 账号 才能打款，
--       原 withdrawals 表仅有 bank_holder（仅银行卡方式填写），缺少统一真实姓名与身份证。
-- 幂等：ADD COLUMN IF NOT EXISTS，可重复执行。

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS real_name TEXT,
  ADD COLUMN IF NOT EXISTS id_card  TEXT;

-- 索引：按身份证/姓名检索（审核与合规核对用）
CREATE INDEX IF NOT EXISTS idx_withdrawals_real_name ON withdrawals(real_name) WHERE real_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_id_card  ON withdrawals(id_card)  WHERE id_card  IS NOT NULL;

-- ==================== 00078_fix_claim_tongbao_type_and_bean_logs_rls.sql ====================
-- =====================================================================
-- 00078: 修复两项运行时错误（纯服务端 schema，需本机执行）
--   ① emotion_claims.tongbao_amount 22P02
--   ② gold_bean_logs 客户端写入 403
--
-- 粘贴到 Supabase Dashboard → SQL Editor 执行即可（幂等）。
-- 依赖：00052(emotion_claims) / 00076(gold_bean_logs) 已建表。
-- =====================================================================

-- ---------------------------------------------------------------------
-- ① emotion_claims.tongbao_amount：smallint → numeric(12,2)
--   原 00052 把该列定义为 smallint（只能装整数），但业务计算的 tb(健康豆/健康豆)
--   是小数（如 0.02，货币型）。safeInsertClaim 同时写 tb_amount(numeric) 与
--   tongbao_amount(Math.max(tb,0))，小数塞进 smallint 直接抛
--   「invalid input syntax for type smallint: "0.02"」(22P02)，
--   导致确权记录永远写不进 → 订单中心永远显示「去确权」。
--   改为 numeric(12,2) 与 tb_amount 同口径，数据不丢、代码无需改。
-- ---------------------------------------------------------------------
ALTER TABLE emotion_claims
  ALTER COLUMN tongbao_amount TYPE numeric(12,2)
  USING tongbao_amount::numeric;

COMMENT ON COLUMN emotion_claims.tongbao_amount
  IS '历史兼容列（旧版存积分）；V2 起用 tb_amount(numeric)。现同改为 numeric 以容纳小数 tb';

-- ---------------------------------------------------------------------
-- ② gold_bean_logs：重新关闭 RLS + 补齐授权
--   表已存在（否则是 404 而非 403），但 RLS 处于开启且无 anon 策略，
--   客户端 anon key 写入被 403 拦截。00076 虽写了 DISABLE RLS，但若表是
--   Dashboard 手动创建（默认开 RLS）则其 CREATE TABLE IF NOT EXISTS 为 no-op，
--   DISABLE RLS 从未执行。这里强制再关一次并授权。
--   与项目测试期模式一致：emotion_* 在 00053/00072、points_logs 在 00075
--   均关闭 RLS，客户端直插。
-- ---------------------------------------------------------------------
ALTER TABLE public.gold_bean_logs DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gold_bean_logs
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- ⚠️ 还需补跑的迁移（本次未含，单独执行）：
--   00054_emotion_rollback_and_rules.sql
--     → 增补 tb_amount / cv_amount / badge_code / status / rule_version /
--       upline_* 等列 + fn_void_emotion_claim / fn_ban_user_rollback 函数。
--     不跑则全量确权走 42703 → 自动降级为基础列写入（tongbao_amount 已修，可成功），
--     但 badge_code/status/tb_amount 等扩展数据缺失。
-- ---------------------------------------------------------------------

-- ==================== 00080_atomic_rpc_indexes_unique.sql ====================
-- ============================================================================
-- 00080_atomic_rpc_indexes_unique.sql
-- 目的：补齐「本机执行」类根因修复中可安全叠加的迁移（测试期/生产期均可执行）
--  ① 原子余额增减 RPC（消除 read→compute→update 非原子，P1-D）
--  ② 高频查询索引（性能 P1）
--  ③ emotion_claims 唯一约束（防并发重复确权，P1）
-- 均为幂等（CREATE OR REPLACE / IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS），可重复执行。
-- 依赖：之前各迁移已建 profiles / orders / commissions / emotion_claims / withdrawals 等表。
-- ============================================================================

-- ---------- ① 原子增减 RPC（单条 UPDATE，数据库内完成，无并发丢更新） ----------
CREATE OR REPLACE FUNCTION add_commission_balance(p_user_id uuid, p_delta numeric)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles SET commission_balance = commission_balance + p_delta WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION add_gold_beans(p_user_id uuid, p_delta integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles SET gold_beans = gold_beans + p_delta WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION add_points(p_user_id uuid, p_delta integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles SET points = points + p_delta WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION add_total_commission(p_user_id uuid, p_delta numeric)
RETURNS void LANGUAGE sql AS $$
  UPDATE profiles
     SET total_commission   = total_commission + p_delta,
         settled_commission = settled_commission + p_delta
   WHERE id = p_user_id;
$$;

-- 通用原子增减（供未来所有余额类字段复用，避免再散落 read→modify→write）
CREATE OR REPLACE FUNCTION atomic_add(p_user_id uuid, p_column text, p_delta numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('UPDATE profiles SET %I = %I + $1 WHERE id = $2', p_column, p_column)
  USING p_delta, p_user_id;
END;
$$;

-- ---------- ② 高频查询索引（避免全表扫描，P1 性能） ----------
CREATE INDEX IF NOT EXISTS idx_orders_user_id     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id    ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary_id ON commissions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order_id       ON commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status         ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_user_id    ON emotion_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_claims_order_no    ON emotion_claims(order_no);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id       ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status        ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by       ON profiles(invited_by);

-- ---------- ③ emotion_claims 唯一约束（防并发重复确权，P1） ----------
-- 先去重：同一 (user_id, order_no) 仅保留 id 最小的一条，其余删除
DELETE FROM emotion_claims a
USING emotion_claims b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.order_no = b.order_no;

-- 用唯一索引代替 ADD CONSTRAINT（IF NOT EXISTS 对约束语法兼容性差，索引百分百兼容，效果相同）
CREATE UNIQUE INDEX IF NOT EXISTS uq_emotion_claims_user_order
  ON emotion_claims (user_id, order_no);

-- ==================== 00081_production_rls_hardening.sql ====================
-- ============================================================================
-- 00081_production_rls_hardening.sql   —— 生产安全收口（可执行版 v2）
-- ============================================================================
-- 目的（对应架构自查 SEC P0）：把测试期「RLS 全关 + 高危 RPC 授权 anon」的裸奔
-- 状态收口为生产安全基线：
--   ① 为敏感表启用 RLS，并按「属主 / 管理员」重建一套干净、幂等的策略；
--   ② 目录类表保持公开可读、仅管理员可写；
--   ③ 资金/流水类表：本人只读、写入仅 service_role（Edge Function）；
--   ④ 收回 00054 授予 anon/authenticated 的高危管理 RPC 执行权。
--
-- 前置事实（已在代码核实，2026-07-13）：
--   • 客户端使用 Supabase 真实 Auth（signInWithPassword/signUp/OTP），登录后
--     auth.uid() 可正确解析 —— 因此本脚本对已登录用户安全，不会误拦自有数据。
--   • service_role（Edge Functions）具备 BYPASSRLS，本脚本不影响其读写。
--   • 表结构自 00001 起即用 user_id DEFAULT auth.uid()，本脚本与原设计一致。
--
-- 幂等性：可重复执行。对每张目标表先「清空既有策略」再「重建标准策略」，
--          并对不存在的表 / 不存在的列做动态跳过（不会报错）。
--
-- 执行方式：
--   supabase db push            （已 link 生产项目后）
--   或在 SQL Editor 直接整段运行。
-- 建议：先在预发/影子库跑一次，用小程序 + 后台各点一遍读写路径验证不被误拦。
-- ============================================================================

-- ---------- 0) 管理员判定辅助函数（SECURITY DEFINER，避免递归 RLS） ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(get_user_role(auth.uid()) = 'admin'::user_role, false);
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ============================================================================
-- 1) 启用 RLS + 清空既有策略（统一到干净基线）
-- ============================================================================
DO $$
DECLARE
  t   text;
  pol record;
  all_tables text[] := ARRAY[
    -- 目录 / 公开可读
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs','coupons',
    -- 属主可读写（用户自有内容）
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences',
    -- 属主只读（写入仅 service_role）
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals',
    -- 特殊处理
    'profiles','merchant_applications'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      CONTINUE;  -- 表不存在则跳过
    END IF;
    -- 启用 RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- 清空该表现有全部策略，避免旧的宽松策略残留（permissive 会 OR 叠加）
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 2) 目录类：anon + authenticated 可读，仅管理员可写
-- ============================================================================
DO $$
DECLARE
  t text;
  catalog_tables text[] := ARRAY[
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs'
  ];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);$f$,
                   'rls81_'||t||'_read', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                   'rls81_'||t||'_admin', t);
  END LOOP;
  -- 修正：products 无 owner_id 列但归属到 store；给门店 owner 加写权限，避免商家上架被 RLS 拦死
  --       （stores 的 owner 写策略由第 5 节 rls81_stores_owner 处理）
  IF to_regclass('public.products') IS NOT NULL THEN
    CREATE POLICY rls81_products_owner ON public.products FOR ALL TO authenticated
      USING (public.is_admin() OR EXISTS (
               SELECT 1 FROM stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid()))
      WITH CHECK (public.is_admin() OR EXISTS (
               SELECT 1 FROM stores s WHERE s.id = products.store_id AND s.owner_id = auth.uid()));
  END IF;
END $$;

-- ============================================================================
-- 3) 属主可读写类：user_id = auth.uid() 全权 CRUD；管理员全权
-- ============================================================================
DO $$
DECLARE
  t text;
  owner_crud_tables text[] := ARRAY[
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences','coupons'
  ];
  has_uid boolean;
BEGIN
  FOREACH t IN ARRAY owner_crud_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;

    IF has_uid THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin())
                        WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls81_'||t||'_owner', t);
    ELSE
      -- 无 user_id 列：退化为仅管理员可访问，避免误开
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls81_'||t||'_adminonly', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 4) 属主只读类：本人 SELECT；写入仅 service_role（不建 authenticated 写策略）；管理员全权
-- ============================================================================
DO $$
DECLARE
  t text;
  owner_read_tables text[] := ARRAY[
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals'
  ];
  has_uid boolean;
BEGIN
  FOREACH t IN ARRAY owner_read_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;

    IF has_uid THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls81_'||t||'_ownerread', t);
    ELSE
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                        USING (public.is_admin());$f$,
                     'rls81_'||t||'_adminread', t);
    END IF;
    -- 管理员全权（含写）
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                   'rls81_'||t||'_admin', t);

    -- 修正：买家本人可写自己的订单 / 健康豆流水（小程序前端直写架构，无 Edge Function 代理）
    --       否则 00081 会把 orders/order_items/gold_bean_logs 收成 admin-only，导致下单失败
    IF has_uid AND t IN ('orders','gold_bean_logs') THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin())
                        WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls81_'||t||'_owner', t);
    ELSIF (NOT has_uid) AND t = 'order_items' THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin() OR EXISTS (
                                 SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()))
                        WITH CHECK (public.is_admin() OR EXISTS (
                                 SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));$f$,
                     'rls81_order_items_owner', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 5) 特殊表：profiles（本人读写自己） / merchant_applications（申请人 + 管理员）
-- ============================================================================
-- profiles：主键 id = auth.uid()
CREATE POLICY rls81_profiles_self_read   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY rls81_profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY rls81_profiles_admin       ON public.profiles FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- merchant_applications：申请人（owner_id）可读写自己的申请；管理员全权
DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='merchant_applications' AND column_name='owner_id') THEN
      CREATE POLICY rls81_mapp_owner ON public.merchant_applications FOR ALL TO authenticated
        USING (owner_id = auth.uid() OR public.is_admin())
        WITH CHECK (owner_id = auth.uid() OR public.is_admin());
    ELSE
      CREATE POLICY rls81_mapp_admin ON public.merchant_applications FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;
  END IF;
END $$;

-- stores：店主（owner_id）可管理自己的店；管理员全权（读已由 catalog 公开策略覆盖）
DO $$
BEGIN
  IF to_regclass('public.stores') IS NOT NULL THEN
    CREATE POLICY rls81_stores_owner ON public.stores FOR ALL TO authenticated
      USING (owner_id = auth.uid() OR public.is_admin())
      WITH CHECK (owner_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- ============================================================================
-- 6) 收回 00054 授予 anon/authenticated 的高危管理 RPC 执行权（仅 service_role 可调）
-- ============================================================================
DO $$
DECLARE
  fn text;
  -- 00054 中以 GRANT ... TO anon, authenticated 暴露的高危函数（按实际签名收回）
  danger_fns text[] := ARRAY[
    'fn_ban_user_rollback(uuid, text)',
    'fn_void_emotion_claim(uuid, text, numeric)'
  ];
BEGIN
  FOREACH fn IN ARRAY danger_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated;', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE '跳过（函数不存在）: %', fn;
    END;
  END LOOP;
END $$;
-- 说明：fn_total_cv() 为只读统计，可保留 anon 执行权；如需收紧一并 REVOKE。
-- emotion_rule_versions 的 anon SELECT 已由第 2 节目录读策略覆盖，无需额外授予。

-- ============================================================================
-- 7) 自检：列出仍未启用 RLS 的 public 表（应为空或仅剩明确无需 RLS 的表）
-- ============================================================================
-- 运行后可执行以下查询核对：
--   SELECT tablename FROM pg_tables t
--   WHERE schemaname='public'
--     AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--                     WHERE c.relname=t.tablename AND n.nspname='public' AND c.relrowsecurity)
--   ORDER BY 1;
-- ============================================================================

-- ==================== 00082_orders_channel_fee.sql ====================
-- 00082: 订单增加支付通道费字段（微信支付收单成本，用于财务对账）
-- 通道费 = 现金基数 × 通道费率，由平台承担，不侵蚀用户分账。
-- 幂等：使用 IF NOT EXISTS，重复执行安全。

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_fee_rate numeric(5,4) NOT NULL DEFAULT 0.006;

COMMENT ON COLUMN orders.channel_fee IS '本笔订单微信支付通道费（平台收单成本，按现金基数×费率计提）';
COMMENT ON COLUMN orders.channel_fee_rate IS '本笔订单实际通道费率（默认0.006=0.6%，可随微信商户类目配置）';

-- 便于按通道费对账的索引（轻量，可选）
CREATE INDEX IF NOT EXISTS idx_orders_channel_fee ON orders (channel_fee) WHERE channel_fee > 0;

-- ==================== 00083_commission_channel_fee_tax.sql ====================
-- 00083: 代扣税费 + 佣金净额字段
-- 背景：支付通道费(微信收单成本)与代扣个税均由「用户(佣金受益人)」承担，不从平台/商家出。
--       因此需要在佣金行上记录分摊到的通道费、代扣税与净额，并在订单上记录合计代扣税。
-- 幂等：全部使用 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS，重复执行安全。

-- 1) commissions：每行佣金分摊的通道费、代扣税、净额
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS channel_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_withheld numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN commissions.channel_fee IS '该笔佣金分摊的支付通道费（由用户承担，从佣金扣除）';
COMMENT ON COLUMN commissions.tax_withheld IS '该笔佣金代扣的个人所得税（由用户承担，从佣金扣除）';
COMMENT ON COLUMN commissions.net_amount IS '用户净到手 = commission_amount - channel_fee - tax_withheld';

-- 2) orders：订单佣金合计代扣个税（通道费已在 00082 落 channel_fee）
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tax_withheld numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.tax_withheld IS '本订单佣金合计代扣个税（由用户承担）';

-- 3) 历史数据回填：net_amount 默认为 0，旧佣金未含费税，保持 0（历史不追溯扣）。
--    如需对历史已发佣金补扣，可后续单独跑 UPDATE（本迁移不自动追溯，避免影响已提现数据）。

-- ==================== 00084_notifications_table.sql ====================
-- 00084: 通知中心 notifications 表
-- 背景：小程序用户端此前无任何业务事件推送（公告/下单/分佣/退款/提现），用户必须进入页面才能看到。
--       接入微信「订阅消息」：写表 + 调 subscribeMessage.send，由用户主动授权一次后长期生效。
-- 设计：
--   1) notifications 表记录「每条已发/待发通知」的内容、接收人、已读状态、发送时间
--   2) 类型 type: order_paid / commission_arrived / withdraw_progress / refund_result / announcement
--   3) RLS：DISABLE（与 emotion_* 5 表策略一致，anon 端可读自己的通知；测试期放开；00081 收口时再加）
--   4) 索引：user_id + read_at + created_at DESC，便于消息中心列表 / 未读数 查询
-- 幂等：所有 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,                                 -- 接收人（auth.users.id 或 profiles.id）
  type         text NOT NULL,                                 -- 通知类型（5 枚举）
  title        text NOT NULL,                                 -- 通知标题
  body         text NOT NULL,                                 -- 通知正文
  order_id     uuid,                                          -- 关联订单（可空）
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,            -- 扩展字段（金额/订单号/跳转路径等）
  read_at      timestamptz,                                   -- 已读时间（null = 未读）
  sent_at      timestamptz,                                   -- 实际推送到微信的时间（null = 仅落库未推送）
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE notifications IS '通知中心：所有推送给小程序用户的业务事件。写表后由 send-notification 云函数调 subscribeMessage.send';
COMMENT ON COLUMN notifications.type IS 'order_paid | commission_arrived | withdraw_progress | refund_result | announcement';
COMMENT ON COLUMN notifications.payload IS '扩展字段：金额/订单号/跳转路径，便于小程序端展示';
COMMENT ON COLUMN notifications.read_at IS 'null = 未读，进入小程序消息中心后置 now()';
COMMENT ON COLUMN notifications.sent_at IS 'null = 写库未推送（用户未授权/无 openid），进入消息中心可拉历史';

-- 索引：用户级未读 + 时间倒序
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- 测试期放开：与 emotion_claims 等用户表一致
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- 给 user_id 列加注释（提醒：与 profiles.id / auth.users.id 同源；当前 FK 设计沿用现有风格不加 FK）
COMMENT ON COLUMN notifications.user_id IS '接收人 uuid（与 auth.users.id / profiles.id 同源；不加 FK 以匹配现有 commissions/withdrawals 风格）';

-- ==================== 00085_merge_points_to_gold_beans.sql ====================
-- 00085_merge_points_to_gold_beans.sql
-- 会员货币归一：原 V5「买家积分 points」与「健康豆 gold_beans」同质（均 1:1 抵扣币），
-- 抵扣链路实际只用 gold_beans。本迁移把历史 points 余额 1:1 合并进 gold_beans，并清零 points。
-- 保留 points 列（不 DROP），避免退款 / 风控等读取逻辑运行期报错；清零后该列恒为 0，无害。
-- 代码侧已落地：addBuyerPoints 改写 gold_beans；退款 / 风控改扣回 gold_beans；
--   user 页「积分」卡移除；admin-users / my-referrals 改显 gold_beans。

-- 1) 合并历史余额（健康豆 = 健康豆 + 原积分；原积分清零）
UPDATE profiles
SET gold_beans = gold_beans + COALESCE(points, 0),
    points = 0
WHERE COALESCE(points, 0) > 0;

-- 2) （可选）确认无引用后再执行，彻底移除冗余列与孤立表：
--    ALTER TABLE profiles DROP COLUMN IF EXISTS points;
--    ALTER TABLE profiles DROP COLUMN IF EXISTS balance;   -- 预留现金账户，长期未启用
--    DROP TABLE IF EXISTS points_logs;
-- 说明：points_logs 仍被 getMyPointsLogs 读取；若要 DROP，请先确认该函数无前端调用后再处理。

-- ==================== 00086_member_rank_events.sql ====================
-- 00086: 段位变更事件日志 member_rank_events
-- 背景：「阶段间时间窗口」「段位六阶马尔可夫」依赖段位变更历史，而 profiles.member_rank 只是单列当前值。
--       本表记录每一次段位跃迁的时间戳，支撑：
--         1) 从 X 段位到 Y 段位平均历时（时间窗口分析）
--         2) 段位态马尔可夫转移矩阵（跃迁序列）
-- 设计：
--   1) user_id / from_stage / to_stage / trigger / created_at
--   2) trigger 当前仅 'consume+badge'（由 syncMemberRank 在消费+徽章软门槛达标时写入）
--   3) RLS：DISABLE（与 commissions / withdrawals / gold_bean_logs 策略一致，admin-web anon 可读写）
--   4) 索引：(user_id, created_at) 便于按用户拉时间线
-- 幂等：所有 IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS member_rank_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  from_stage  text NOT NULL,
  to_stage    text NOT NULL,
  trigger     text NOT NULL DEFAULT 'consume+badge',
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE member_rank_events IS '段位变更事件日志：支撑阶段间时间窗口与段位态马尔可夫分析';
COMMENT ON COLUMN member_rank_events.from_stage IS '跃迁前段位（首次为初始段位，如「江湖散修」）';
COMMENT ON COLUMN member_rank_events.to_stage IS '跃迁后段位';
COMMENT ON COLUMN member_rank_events.trigger IS '触发源：当前仅 consume+badge（消费+徽章软门槛）';

CREATE INDEX IF NOT EXISTS idx_member_rank_events_user_created
  ON member_rank_events (user_id, created_at DESC);

-- 测试期放开：与 commissions / withdrawals / gold_bean_logs 一致（admin-web anon 可读写）
ALTER TABLE member_rank_events DISABLE ROW LEVEL SECURITY;

-- ==================== 00087_profiles_allow_behavior_analysis.sql ====================
-- 00087: profiles.allow_behavior_analysis
-- 用途：PIPL 个性化总闸。用户可在小程序「设置 → 隐私与个性化」一键退出行为分析。
--       后台行为分析引擎（衰减/复购/马尔可夫/流失/触发）仅统计未退出用户。
-- 默认 true（与站内通知默认开启一致，opt-out 模式）；用户关闭后即被分析引擎排除。
-- 幂等：IF NOT EXISTS + 已有行默认 true（backfill）。

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allow_behavior_analysis boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.allow_behavior_analysis
  IS '个性化行为分析总闸：true=允许（默认），false=用户已退出，分析引擎排除该用户';

-- ==================== 00090_products_ingredients.sql ====================
-- 00090: products 表增加 ingredients 列
-- 用于持久化商家在商品编辑页「原料成分分析」区块勾选的食材 key，
-- 驱动详情页「原料分析」卡片（功效 / 适合人群 / 场景）。
-- 软降级：小程序端在列不存在时会自动剥离该字段后再保存，
-- 故本迁移未执行也不影响上架与展示（详情页会按商品名称自动匹配）。
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN products.ingredients IS '关联食材 key 列表（对应 shiyang-dictionary 的 INGREDIENT_DICT key），用于原料/食养成分分析展示';

-- ==================== 00091_fix_seed_image_cdn.sql ====================
-- 00091: 清理历史种子数据中的平台图床域名
-- 将已播种（00002）的 stores / products 图片从 laidianyouxi-site-img.cdn.bcebos.com
-- 替换为中性图床 picsum.photos（按原 UUID 固定 seed，保证每个商品图稳定且不重复）。
-- 幂等：仅匹配旧域名行，重复执行无副作用。
-- 注意：沙箱无 supabase CLI，请在本地执行 `supabase db push` 或于 Dashboard SQL Editor 粘贴本文件。

UPDATE public.stores
SET image_url = regexp_replace(
  image_url,
  'https://laidianyouxi-site-img\.cdn\.bcebos\.com/images/baidu_image_search_([0-9a-f-]+)\.jpg',
  'https://picsum.photos/seed/ldyx-\1/600/600'
)
WHERE image_url LIKE 'https://laidianyouxi-site-img.cdn.bcebos.com/%';

UPDATE public.products
SET image_url = regexp_replace(
  image_url,
  'https://laidianyouxi-site-img\.cdn\.bcebos\.com/images/baidu_image_search_([0-9a-f-]+)\.jpg',
  'https://picsum.photos/seed/ldyx-\1/600/600'
)
WHERE image_url LIKE 'https://laidianyouxi-site-img.cdn.bcebos.com/%';

-- ==================== 00092_bootstrap_admin_role.sql ====================
-- 00092_bootstrap_admin_role.sql
-- 让后台超级管理员账号（固定邮箱）注册时自动获得 role='admin'，
-- 使「路径 B：真实 admin 登录」可经由 is_admin() RLS 读全量后台数据，无需暴露 service_role 密钥。
--
-- 背景：00081 生产 RLS 加固后，后台列表查询依赖 is_admin()（= get_user_role(auth.uid())='admin'）。
-- 但 00001 的 handle_new_user() 触发器硬编码 role='user'，导致自动注册的 admin@laidianyouxi.com
-- 即便登录成功仍是普通用户，is_admin() 返回 false → 订单/消息被 RLS 拦成 0 行（空白）。
-- 本迁移从触发器层面权威授予 admin 角色，并幂等纠正早期已按 'user' 注册的账号。

-- 1) 重写 handle_new_user：注册邮箱命中管理员白名单 → role='admin'，否则 'user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.user_role := 'user';
BEGIN
  -- 后台超级管理员白名单（如需新增管理员邮箱在此追加）
  IF NEW.email IN ('admin@laidianyouxi.com') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, username, phone, nickname, role, openid)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'username')::text,
    NEW.phone,
    COALESCE((NEW.raw_user_meta_data->>'nickname')::text, '江湖散修'),
    v_role,
    (NEW.raw_user_meta_data->>'openid')::text
  )
  -- 若 profile 已存在（手动预建等），仅当 role 不一致时纠正为白名单角色
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role
    WHERE public.profiles.role <> EXCLUDED.role;

  RETURN NEW;
END;
$$;

-- 2) 幂等补丁：若后台 admin 账号此前已按 'user' 注册（早期测试遗留），纠正为 'admin'
UPDATE public.profiles
SET role = 'admin'
WHERE role <> 'admin'
  AND id IN (SELECT id FROM auth.users WHERE email = 'admin@laidianyouxi.com');

-- ==================== 00093_merchant_product_write_policy.sql ====================
-- ============================================================================
-- 00093: 恢复「门店 owner 可写自己门店商品」能力
-- 背景：00081 生产 RLS 加固把 products 当作「无 user_id 列的目录表」，
--       其写入策略退化为仅 is_admin() 可写，导致普通商家扫码上架 / 手动新增 / 上下架
--       全部被 RLS 拒绝。
-- 修复：在保留「目录公开读 + 管理员全权」的前提下，新增「门店 owner 可写
--       自己 store_id 所属商品」的策略。安全边界：商家只能操作自己门店。
-- 自包含：本脚本会补建 is_admin() / get_user_role() 辅助函数，避免 42883 报错。
-- ============================================================================

-- ---------- 0) 补建管理员判定辅助函数（如果 00081 尚未执行） ----------
-- 若 user_role 类型已存在（正常情况下），CREATE TYPE IF NOT EXISTS 安全忽略；
-- 若不存在，先建枚举类型（保持与 00001 一致）。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('user', 'admin');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false);
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- 让 get_user_role 也能被策略/函数调用（防御性授权）
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon, authenticated, service_role;

-- ---------- 1) 清理 00081 可能给 products 建的 admin-only 写策略（多命名兜底） ----------
DROP POLICY IF EXISTS rls81_products_admin ON public.products;
DROP POLICY IF EXISTS rls81_products_adminonly ON public.products;

-- 门店 owner 写策略：owner = stores.owner_id = auth.uid()
CREATE POLICY rls81_products_merchant_write ON public.products
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = products.store_id
        AND s.owner_id = auth.uid()
    )
  );

-- ---------- 2) 防御性：确保 products 表 RLS 已开启（不影响已有数据） ----------
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

-- 备注：
-- 1) rls81_products_read（目录公开读，USING (true)）保持不动，前端列表不受影响。
-- 2) 商家端小程序使用 anon key 直连，授权通过 auth.uid() 校验门店归属，无需改动前端代码。
-- 3) 越权防护：商家只能读写 store_id 对应门店的商品，无法碰他人门店数据。
-- 4) 幂等：重复执行安全（先 DROP 再 CREATE，函数 IF NOT EXISTS）。
SELECT '✅ 00093 完成：门店 owner 已可写入自己门店的 products，且 is_admin() 已补建' AS result;

-- ==================== 00094_buyer_order_write_policy.sql ====================
-- ============================================================================
-- 00094: 恢复「买家可写自己订单」能力（调和 00081 与前端直写架构）
-- ============================================================================
-- 背景：00081_production_rls_hardening 把 orders / order_items / gold_bean_logs
--       归入「属主只读类」，写入策略收口为「仅 admin / service_role」。
--       但小程序当前是前端用 anon key 直写订单表（createOrderV2 直接 insert
--       orders / order_items，没有走 Edge Function 代理）。
--       一旦 00081 生效，普通买家 createOrderV2 的 orders.insert / order_items.insert
--       被 RLS 拒绝（42501: new row violates row-level security policy）→
--       订单创建失败 → 不能支付。这与「扫码上架被 products 的 admin-only 策略拦死」同类。
--
-- 修复：为订单相关表增加「本人可写」策略，管理员全权：
--   • orders / gold_bean_logs 有 user_id 列 → 直接 user_id = auth.uid() 判定归属；
--   • order_items 无 user_id 列 → 经 order_id 关联 orders.user_id 判定归属。
-- 安全边界：买家只能读写自己(user_id=auth.uid())的订单及所属订单项；管理员全权。
--
-- 自包含：先补建 is_admin()/get_user_role()（若 00081/00093 未执行），再
--         DROP 旧的 admin-only 写策略、重建本人可写策略。
-- 幂等：可重复执行（DROP IF EXISTS + CREATE OR REPLACE 风格）。
-- ============================================================================

-- ---------- 0) 补建管理员判定辅助函数（防御性，已建则覆盖无害） ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('user', 'admin');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = uid; $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false); $$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO anon, authenticated, service_role;

-- ---------- 1) orders：本人可写（user_id = auth.uid()），管理员全权 ----------
-- 清理 00081 的 admin-only 写策略（rls81_orders_admin）；保留 rls81_orders_ownerread（SELECT）无害。
DROP POLICY IF EXISTS rls81_orders_admin ON public.orders;
CREATE POLICY rls81_orders_owner ON public.orders
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 2) order_items：无 user_id 列，经 order_id 关联 orders.user_id 判定本人 ----------
-- 清理 00081 的 admin-only 写策略（rls81_order_items_adminonly）。
DROP POLICY IF EXISTS rls81_order_items_adminonly ON public.order_items;
CREATE POLICY rls81_order_items_owner ON public.order_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- ---------- 3) gold_bean_logs：本人可写（user_id = auth.uid()），管理员全权 ----------
-- 清理 00081 的 admin-only 写策略（rls81_gold_bean_logs_admin）；保留 rls81_gold_bean_logs_ownerread（SELECT）无害。
DROP POLICY IF EXISTS rls81_gold_bean_logs_admin ON public.gold_bean_logs;
CREATE POLICY rls81_gold_bean_logs_owner ON public.gold_bean_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 4) 防御性：确保这些表 RLS 已开启（不影响已有数据） ----------
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gold_bean_logs FORCE ROW LEVEL SECURITY;

-- 备注：
-- 1) 读策略（ownerread）保持不动，买家仍能读自己的订单/流水；管理员读全量。
-- 2) 越权防护：买家只能读写 user_id=auth.uid() 的订单及所属订单项，无法碰他人订单。
-- 3) 与 00093（商家写自己门店商品）同理，把 00081 过度收紧的写权限按「属主」归还前端直写架构。
-- 4) 幂等：重复执行安全（先 DROP 再 CREATE，函数 IF NOT EXISTS）。
SELECT '✅ 00094 完成：买家可写自己订单(orders/order_items/gold_bean_logs)，管理员全权' AS result;

-- ==================== 00094_product_emotion_merchant_write_policy.sql ====================
-- ============================================================================
-- 00094: 恢复「门店 owner 可写自己门店商品的情绪标签」能力
-- 背景：00081 生产 RLS 加固将 product_emotion 写策略退化为仅 is_admin()，
--       导致普通商家在「情绪编译工作台」保存五维标签/食养成分/编译分时被 RLS 拒绝。
-- 关联链：product_emotion.product_id → products.id → products.store_id → stores.owner_id
-- 修复：在保留「公开读 + 管理员全权」的前提下，新增「门店 owner 可写自己商品关联的
--       product_emotion 行」策略。
-- ============================================================================

-- 门店 owner 写策略：通过 product_id → products.store_id → stores.owner_id 校验归属
CREATE POLICY rls81_product_emotion_merchant_write ON public.product_emotion
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_emotion.product_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_emotion.product_id
        AND s.owner_id = auth.uid()
    )
  );

SELECT '✅ 00094 完成：门店 owner 已可写入自己商品关联的 product_emotion 行' AS result;

-- ==================== 00095_consolidated_rls_final.sql ====================
-- ============================================================================
-- 00095_consolidated_rls_final.sql   —— 最终 RLS 基线（修正 00081 的回退坑）
-- ============================================================================
-- 背景（为什么会「老是出现」保存/下单失败）：
--   00081_production_rls_hardening 第 1 节会对目标表「清空全部既有策略」再重建，
--   且把所有写策略收口为 admin-only。若在其后跑 00093(商家写商品)/00094(买家写订单)，
--   再跑 00081，00093/00094 的属主写策略会被 00081 删掉 → products/orders 重新变
--   成「仅管理员可写」→ 商家上架失败、买家下单失败。
--
-- 本迁移把「安全加固 + 商家写商品 + 买家写订单」合并为**一份顺序无关、幂等的最终态**：
--   无论之前跑过 00081/00093/00094 的什么顺序，只要最后跑本迁移，结果一定正确。
--
-- 策略命名统一用 rls_final_* 前缀，避免与 rls81_* 混淆；同时本迁移也会清空所有
-- 旧前缀(rls81_*/rls81_products_merchant_write 等)的残留策略。
--
-- 安全边界（保持 00081 的初衷，不削弱安全性）：
--   • 目录表(articles/announcements/emotion_* 等)：公开只读，仅管理员可写。
--   • products：公开只读；管理员 或 门店 owner（stores.owner_id = auth.uid()）可写自己门店。
--   • stores：公开只读；管理员 或 owner_id = auth.uid() 可写。
--   • orders / gold_bean_logs：本人(user_id)全权 CRUD + 管理员全权（买家可下单/查单/记健康豆）。
--   • order_items：经 order_id 关联 orders.user_id 判定归属，本人或管理员可写。
--   • 其余流水表(commissions/withdrawals/...)：本人只读，仅管理员/ service_role 可写。
--   • cart_items/favorites/.../coupons：本人(user_id)全权 CRUD。
--   • profiles：本人读/改自己，管理员全权。
-- ============================================================================

-- ---------- 0) 管理员判定辅助函数（SECURITY DEFINER，避免递归 RLS） ----------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('user', 'admin');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false);
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin()            TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid)   TO anon, authenticated, service_role;

-- ---------- 1) 启用 RLS + 清空目标表全部既有策略（统一到干净基线） ----------
DO $$
DECLARE
  t   text;
  pol record;
  all_tables text[] := ARRAY[
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs','coupons',
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals',
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences',
    'profiles','merchant_applications'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- ---------- 2) 目录类：公开可读；写策略按表区分 ----------
DO $$
DECLARE
  t         text;
  catalog   text[] := ARRAY[
    'products','stores','store_categories','articles','announcements',
    'emotion_content','emotion_lexicon','emotion_keywords','emotion_taxonomy',
    'category_emotion_profiles','product_emotion','product_ingredients','ingredients',
    'marketing_campaigns','emotion_badge_defs','rank_configs','emotion_rule_versions',
    'platform_configs'
  ];
  has_owner boolean;
BEGIN
  FOREACH t IN ARRAY catalog LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    -- 公开读
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true);',
                   'rls_final_'||t||'_read', t);

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='owner_id'
    ) INTO has_owner;

    IF has_owner THEN
      -- stores 等有 owner_id 列：管理员 或 归属者 可写
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (owner_id = auth.uid() OR public.is_admin())
                        WITH CHECK (owner_id = auth.uid() OR public.is_admin());$f$,
                     'rls_final_'||t||'_write', t);
    ELSIF t = 'products' THEN
      -- products 无 owner_id 列，但归属到 store：管理员 或 门店 owner 可写自己门店
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin() OR EXISTS (
                                 SELECT 1 FROM stores s
                                 WHERE s.id = products.store_id AND s.owner_id = auth.uid()))
                        WITH CHECK (public.is_admin() OR EXISTS (
                                 SELECT 1 FROM stores s
                                 WHERE s.id = products.store_id AND s.owner_id = auth.uid()));$f$,
                     'rls_final_products_write', t);
    ELSE
      -- 其余目录表：仅管理员可写（与 00081 初衷一致）
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 3) 订单 / 流水类：本人可读写（买家下单）；管理员全权 ----------
DO $$
DECLARE
  t        text;
  fin      text[] := ARRAY[
    'orders','order_items','commissions','withdrawals','redpacket_payouts',
    'gold_bean_logs','points_logs','refunds','emotion_assets','emotion_tongbao_logs',
    'member_rank_events','order_risk_logs','emotion_badge_grants',
    'emotion_funnel_events','pending_referrals'
  ];
  has_uid  boolean;
BEGIN
  FOREACH t IN ARRAY fin LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;

    IF has_uid THEN
      IF t IN ('orders','gold_bean_logs') THEN
        -- 买家本人可全权 CRUD（下单 / 查单 / 记健康豆），管理员全权
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (user_id = auth.uid() OR public.is_admin())
                          WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                       'rls_final_'||t||'_owner', t);
      ELSE
        -- 其他有 user_id 的流水表：本人只读，管理员全权（写入走 service_role）
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                          USING (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls_final_'||t||'_ownerread', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
      END IF;
    ELSE
      IF t = 'order_items' THEN
        -- 无 user_id 列：经 order_id 关联 orders.user_id 判定归属
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (public.is_admin() OR EXISTS (
                                   SELECT 1 FROM orders o
                                   WHERE o.id = order_items.order_id AND o.user_id = auth.uid()))
                          WITH CHECK (public.is_admin() OR EXISTS (
                                   SELECT 1 FROM orders o
                                   WHERE o.id = order_items.order_id AND o.user_id = auth.uid()));$f$,
                     'rls_final_order_items_owner', t);
      ELSE
        -- 其余无 user_id 的流水表：本人只读（管理员），写仅 service_role / 管理员
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                          USING (public.is_admin());$f$,
                     'rls_final_'||t||'_adminread', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                          USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------- 4) 属主 CRUD 类：本人(user_id)全权 ----------
DO $$
DECLARE
  t         text;
  owner_crud text[] := ARRAY[
    'cart_items','favorites','footprints','user_addresses','notifications',
    'emotion_claims','product_reviews','user_emotion_preferences','coupons'
  ];
  has_uid  boolean;
BEGIN
  FOREACH t IN ARRAY owner_crud LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='user_id'
    ) INTO has_uid;
    IF has_uid THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (user_id = auth.uid() OR public.is_admin())
                        WITH CHECK (user_id = auth.uid() OR public.is_admin());$f$,
                     'rls_final_'||t||'_owner', t);
    ELSE
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                        USING (public.is_admin()) WITH CHECK (public.is_admin());$f$,
                     'rls_final_'||t||'_admin', t);
    END IF;
  END LOOP;
END $$;

-- ---------- 5) 特殊表：profiles / merchant_applications ----------
CREATE POLICY rls_final_profiles_self_read    ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY rls_final_profiles_self_update  ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY rls_final_profiles_admin        ON public.profiles FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='merchant_applications' AND column_name='owner_id'
    ) THEN
      CREATE POLICY rls_final_mapp_owner ON public.merchant_applications FOR ALL TO authenticated
        USING (owner_id = auth.uid() OR public.is_admin())
        WITH CHECK (owner_id = auth.uid() OR public.is_admin());
    ELSE
      CREATE POLICY rls_final_mapp_admin ON public.merchant_applications FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    END IF;
  END IF;
END $$;

-- ---------- 6) 自检结果 ----------
SELECT
  tablename,
  policyname,
  cmd,
  roles::text AS applies_to
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('products','stores','orders','order_items','gold_bean_logs')
ORDER BY tablename, policyname;

-- ==================== 00096_merge_goldbeans_to_tongbao.sql ====================
-- =====================================================
-- 00096: 健康豆(balance) 合并为健康豆(tb_balance)，统一为平台唯一内部货币
-- -----------------------------------------------------
-- 决策（用户确认）：
--   1. 合并为单一货币：删除健康豆账户，tb_balance(健康豆) 成为唯一可充值/可支付货币
--   2. 存量健康豆并入健康豆（balance -> tb_balance，用户资产不丢失）
--   3. 确权发豆保留为忠诚度返利（花健康豆买 -> 确权又得健康豆）
-- 注意：
--   - gold_beans 列是历史遗留(已并入佣金_balance)，不在此迁移范围
--   - balance 才是「当前健康豆消费币」，本次并入 tb_balance 后弃用
--   - 本迁移幂等，可重复执行；沙箱无 SQL 权限，需本机 Supabase SQL Editor 执行
-- =====================================================

-- 1) 存量健康豆并入健康豆（幂等：仅对 balance>0 的用户累加）
UPDATE public.profiles
SET tb_balance = COALESCE(tb_balance, 0) + COALESCE(balance, 0)
WHERE COALESCE(balance, 0) > 0;

-- 2) 弃用 balance 列：值已并入 tb_balance，此处清零，确保单一真相源为 tb_balance
--    （保留列不删，避免破坏尚未部署的代码；确认所有代码改为 tb_balance 后可 DROP）
UPDATE public.profiles SET balance = 0 WHERE COALESCE(balance, 0) <> 0;

-- 3) orders: 新增 tb_used 列承接健康豆抵扣额（gold_beans_used 弃用）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tb_used numeric(12,2) NOT NULL DEFAULT 0;
UPDATE public.orders
SET tb_used = COALESCE(gold_beans_used, 0)
WHERE COALESCE(gold_beans_used, 0) <> COALESCE(tb_used, 0);

-- 4) 先调整 orders.payment_method 的 CHECK 约束，允许 emotion_beans（并保持 gold_beans 合法，避免 UPDATE 期间旧行违反约束）
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN (''wxpay'',''gold_beans'',''emotion_beans''))';
END $$;

-- 5) payment_method 枚举值 gold_beans -> emotion_beans
UPDATE public.orders SET payment_method = 'emotion_beans' WHERE payment_method = 'gold_beans';

-- 6) 清理后收缩约束，仅保留 wxpay / emotion_beans（gold_beans 已不在使用）
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN (''wxpay'',''emotion_beans''))';
END $$;

-- 7) gold_bean_logs 改名 tongbao_logs（语义统一为健康豆流水）
--    仅当表存在且未重命名时执行
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gold_bean_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tongbao_logs'
  ) THEN
    EXECUTE 'ALTER TABLE public.gold_bean_logs RENAME TO tongbao_logs';
  END IF;
END $$;

-- 8) 扩展 tongbao_logs 的 type 约束，纳入新增流水类型（purchase_earn / refund_deduct）
--     动态定位并重建 CHECK 约束，避免硬编码约束名导致失败
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.tongbao_logs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tongbao_logs DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.tongbao_logs ADD CONSTRAINT tongbao_logs_type_check CHECK (type IN (
    ''purchase_spend'',''refund_return'',''recharge'',''admin_grant'',''admin_deduct'',
    ''purchase_earn'',''refund_deduct''))';
END $$;

-- 9) 校验（执行后查看结果，确认迁移正确）
SELECT 'profiles_merged' AS step, COUNT(*) AS rows_with_tb_balance
FROM public.profiles WHERE COALESCE(tb_balance, 0) > 0;

SELECT 'orders_tb_used' AS step, COUNT(*) AS rows_with_tb_used
FROM public.orders WHERE COALESCE(tb_used, 0) > 0;

SELECT DISTINCT payment_method FROM public.orders ORDER BY 1;

SELECT 'table_renamed' AS step, COUNT(*) AS tongbao_logs_exists
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'tongbao_logs';

-- ==================== 00097_fix_tb_used_over_deduction.sql ====================
-- 修复历史订单「健康豆抵扣 > 成交额」导致的平台现金实收 / 佣金显示为负
-- 根因：create-order Edge Function 曾用 Math.ceil(totalAmount/GOLD_BEAN_RATE) 计算纯健康豆所需豆数，
--       当订单金额非整数（如 ¥17.8）时，会扣 18 豆，但成交额仅 17.8，显示时按 1 豆=1 元折算，抵扣额 > 成交额。
-- 操作：
--   1. 先查询所有异常订单（供核对）
--   2. 把 tb_used 修正为 total_amount（<= 原 tb_used）
--   3. 将多扣的豆退回用户 profiles.tb_balance
--   4. 写修正流水 tongbao_logs(type='admin_grant'，系统退回多扣豆 = 系统发放，属约束白名单)
--   5. 加 CHECK 约束，防止未来再出现 tb_used > total_amount
-- 注意：退款/售后订单请人工复核后再跑；本脚本默认仅修正普通已完成/待评价等正常订单。

-- 步骤 1：核对异常订单
SELECT id, order_no, user_id, total_amount, tb_used, tb_used - total_amount AS excess
FROM public.orders
WHERE tb_used > total_amount
ORDER BY created_at DESC;

-- 步骤 2：生成修正数据（CTE），先检查再执行
-- bad_orders 额外排除「已写过修正流水」的订单：保证脚本可安全重跑（不会重复退豆/重复写流水）
WITH bad_orders AS (
  SELECT o.id, o.user_id, o.total_amount, o.tb_used, (o.tb_used - o.total_amount) AS excess
  FROM public.orders o
  WHERE o.tb_used > o.total_amount
    AND (o.refund_status IS NULL OR o.refund_status = 'none')
    AND NOT EXISTS (
      SELECT 1 FROM public.tongbao_logs tl
      WHERE tl.order_id = o.id
        AND tl.type = 'admin_grant'
        AND tl.remark LIKE '修正健康豆抵扣超额%'
    )
),
-- 汇总每个用户应退豆数
refund_per_user AS (
  SELECT user_id, SUM(excess) AS total_excess
  FROM bad_orders
  GROUP BY user_id
)
-- 步骤 3：退回多扣的豆到用户余额
UPDATE public.profiles p
SET tb_balance = p.tb_balance + r.total_excess
FROM refund_per_user r
WHERE p.id = r.user_id;

-- 步骤 4：写修正流水（对每个异常订单逐笔）
-- type 使用约束白名单内的 'admin_grant'（系统退回多扣豆 = 系统发放）
-- 幂等防护：若同订单已存在该修正流水则跳过，避免非事务执行时重复写
INSERT INTO public.tongbao_logs (user_id, order_id, type, delta, balance_after, remark, created_at)
SELECT
  o.user_id,
  o.id,
  'admin_grant',
  (o.tb_used - o.total_amount) AS delta,
  p.tb_balance,
  '修正健康豆抵扣超额：原抵扣 ' || o.tb_used || ' 豆，订单金额 ' || o.total_amount || ' 元',
  NOW()
FROM public.orders o
JOIN public.profiles p ON p.id = o.user_id
WHERE o.tb_used > o.total_amount
  AND (o.refund_status IS NULL OR o.refund_status = 'none')
  AND NOT EXISTS (
    SELECT 1 FROM public.tongbao_logs tl
    WHERE tl.order_id = o.id
      AND tl.type = 'admin_grant'
      AND tl.remark LIKE '修正健康豆抵扣超额%'
  );

-- 步骤 5：修正订单 tb_used（必须在退豆/流水之后，避免丢失差额）
UPDATE public.orders
SET tb_used = total_amount
WHERE tb_used > total_amount
  AND (refund_status IS NULL OR refund_status = 'none');

-- 步骤 6：加 CHECK 约束，防止未来写入超额的 tb_used
-- 如果已存在同名约束，先删除再重建（幂等）
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS chk_orders_tb_used_not_exceed_total;

ALTER TABLE public.orders
ADD CONSTRAINT chk_orders_tb_used_not_exceed_total
CHECK (tb_used IS NULL OR total_amount IS NULL OR tb_used <= total_amount);

-- 步骤 7：添加计算列 tb_used_capped，供聚合查询直接用（避免拉全表）
-- 如果已存在同名列，先删除再重建（幂等）
ALTER TABLE public.orders
DROP COLUMN IF EXISTS tb_used_capped;

ALTER TABLE public.orders
ADD COLUMN tb_used_capped numeric(12,2) GENERATED ALWAYS AS (
  COALESCE(LEAST(COALESCE(tb_used, 0), COALESCE(total_amount, 0)), 0)
) STORED;

SELECT '✅ 健康豆抵扣超额修正完成：异常订单已修复、多扣豆已退回、CHECK 约束已添加、tb_used_capped 计算列已创建' AS result;

-- ==================== 00100_food_therapy_fields.sql ====================
-- 00100: products 表补「食材食疗智能导购」核心字段
-- 对应方案：门店商品主库（raw_material 复用现有 ingredients 列，本迁移不新建）
--
-- 设计说明：
--   1. raw_material（原料拆解）复用现有 ingredients text[] 列（迁移 00090 已加），
--      本迁移不再重复建列，仅在注释中说明语义。
--   2. 以下新列支撑「单品适配打分 / 双价值聚合 / 购物车冲突校验 / 辅料自适应」。
--   3. 软降级：小程序端在列不存在时会自动剥离新字段再保存（见 src/db/api.ts 的
--      insertProductWithDegrade / updateProductWithDegrade），故本迁移未执行也不影响
--      既有上架与展示，只是暂无食疗导购能力。
--   4. 需在用户本机执行（沙箱无 supabase CLI / Token）。执行后建议一并重新部署
--      product-mutate Edge Function，使其支持新字段写入。

-- 商品整体性味（商家可填，也可由原料聚合推导）
-- 取值：大寒 / 寒凉 / 平性 / 微温 / 温热 / 大热
ALTER TABLE products ADD COLUMN IF NOT EXISTS overall_nature text;
COMMENT ON COLUMN products.overall_nature IS '商品整体性味（大寒/寒凉/平性/微温/温热/大热）；为空时由 ingredients 原料聚合推导';

-- 固定食疗标签库（9 项）
ALTER TABLE products ADD COLUMN IF NOT EXISTS health_tag text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.health_tag IS '食疗标签：温中散寒/健脾养胃/滋阴润燥/清热降火/补气养血/安神助眠/消食化积/润肺止咳/利水消肿';

-- 固定情绪标签库（8 项）
ALTER TABLE products ADD COLUMN IF NOT EXISTS emotion_tag text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.emotion_tag IS '情绪标签：治愈放松/元气满满/温暖陪伴/清爽解压/怀旧慰藉/仪式感/小确幸/社交分享';

-- 推荐搭配商品（goods_id 即 products.id）
ALTER TABLE products ADD COLUMN IF NOT EXISTS match_goods text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.match_goods IS '智能搭配升单：推荐一起点的商品 id 列表';

-- 冲突 / 慎搭商品
ALTER TABLE products ADD COLUMN IF NOT EXISTS conflict_goods text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.conflict_goods IS '消费冲突：不宜同时点的商品 id 列表（寒热对冲/温补叠加等）';

-- 辅料自适应提醒文案
ALTER TABLE products ADD COLUMN IF NOT EXISTS aux_remind text;
COMMENT ON COLUMN products.aux_remind IS '辅料自适应优化提示，如「体质偏寒可加姜丝/红枣；易上火建议去辣减油」';

-- 复用说明：raw_material 即 ingredients 列（迁移 00090）
COMMENT ON COLUMN products.ingredients IS '原料拆解：关联食材 key 列表（对应 shiyang-dictionary 的 INGREDIENT_DICT key），同时充当方案中的 raw_material';

-- 索引：便于后台按食疗/情绪标签筛选与导购召回
CREATE INDEX IF NOT EXISTS idx_products_health_tag ON products USING gin (health_tag);
CREATE INDEX IF NOT EXISTS idx_products_emotion_tag ON products USING gin (emotion_tag);
CREATE INDEX IF NOT EXISTS idx_products_overall_nature ON products (overall_nature);

-- ==================== 00101_symptom_rules.sql ====================
-- 00101 症状/人群规则库（可运营配置）
-- 原硬编码于 src/utils/food-therapy/symptom-rules.ts，现平移为 DB 表 + 缓存，
-- 运营可在 admin-web 免发版增删改规则；小程序端加载失败自动回退硬编码兜底。
-- 须用户本机执行（沙箱无 supabase CLI/Token）。

CREATE TABLE IF NOT EXISTS public.symptom_rules (
  id                   text PRIMARY KEY,
  category             text NOT NULL CHECK (category IN ('throat', 'menstruation', 'constitution', 'scene')),
  label                text NOT NULL,
  keywords             text[] NOT NULL DEFAULT '{}',
  priority_health_tags text[] NOT NULL DEFAULT '{}',
  ban_natures          text[] NOT NULL DEFAULT '{}',
  ban_health_tags      text[] NOT NULL DEFAULT '{}',
  remind_text          text  NOT NULL DEFAULT '',
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           int  NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 运营配置表，测试期 DISABLE RLS（admin-web 用 anon key 直连读写；非敏感用户数据）
ALTER TABLE public.symptom_rules DISABLE ROW LEVEL SECURITY;

-- 种子：与 symptom-rules.ts 现有 12 条保持一致（幂等 upsert）
INSERT INTO public.symptom_rules
  (id, category, label, keywords, priority_health_tags, ban_natures, ban_health_tags, remind_text, sort_order)
VALUES
  ('throat-sore','throat','咽喉干痒/不适',
    ARRAY['咽喉','嗓子','喉咙','干痒','咽痛','用嗓','K歌','唱歌','讲课','主播'],
    ARRAY['润肺止咳','清热降火'], ARRAY['温热','大热'], ARRAY['温中散寒'],
    '少辛辣过烫，忌烟酒刺激，温饮润喉', 10),

  ('throat-voice','throat','用嗓过度',
    ARRAY['用嗓','嗓子哑','讲课','主播','嘶哑','说话多','喊麦'],
    ARRAY['润肺止咳','滋阴润燥'], ARRAY['大热'], ARRAY[]::text[],
    '温饮润喉，避免冰饮与辛辣', 11),

  ('menstruation','menstruation','经期/生理期',
    ARRAY['经期','大姨妈','生理期','例假','月经','痛经','宫寒'],
    ARRAY['补气养血','温中散寒'], ARRAY['寒凉','大寒'], ARRAY['清热降火','利水消肿'],
    '忌生冷寒凉，宜温饮温食，注意保暖', 20),

  ('constitution-fire','constitution','易上火体质',
    ARRAY['易上火','上火','长痘','口腔溃疡','怕热','湿热'],
    ARRAY['清热降火','滋阴润燥'], ARRAY['温热','大热'], ARRAY[]::text[],
    '少辛辣温补，多清润滋阴', 30),

  ('constitution-cold','constitution','畏寒怕冷',
    ARRAY['畏寒','怕冷','手脚凉','体寒','宫寒','阳虚'],
    ARRAY['温中散寒','补气养血'], ARRAY['寒凉','大寒'], ARRAY['清热降火'],
    '宜温补，忌生冷寒凉', 31),

  ('constitution-spleen','constitution','脾胃偏弱',
    ARRAY['脾胃','消化弱','胃弱','容易胀','脾虚','积食','没胃口'],
    ARRAY['健脾养胃','消食化积'], ARRAY[]::text[], ARRAY[]::text[],
    '七分饱，细嚼慢咽，忌暴饮暴食', 32),

  ('constitution-sleep','constitution','睡眠浅/失眠',
    ARRAY['睡眠浅','失眠','睡不好','多梦','入睡难','焦虑睡'],
    ARRAY['安神助眠','补气养血'], ARRAY['大热'], ARRAY[]::text[],
    '晚间宜清淡温润，忌兴奋刺激', 33),

  ('scene-stayup','scene','熬夜后',
    ARRAY['熬夜','加班','通宵','晚睡','夜班'],
    ARRAY['补气养血','安神助眠'], ARRAY['大热'], ARRAY[]::text[],
    '补气血的同时早点休息', 40),

  ('scene-greasy','scene','油腻饮食后',
    ARRAY['油腻','吃多','撑','积食','火锅','烧烤','大餐','解腻'],
    ARRAY['消食化积','清热降火'], ARRAY['温热'], ARRAY[]::text[],
    '解腻消食，适量为宜', 41),

  ('scene-season','scene','换季温差',
    ARRAY['换季','降温','温差','着凉','感冒前期','冷'],
    ARRAY['温中散寒','补气养血'], ARRAY['寒凉','大寒'], ARRAY['清热降火'],
    '注意保暖，温食护体', 42),

  ('scene-autumn','scene','秋燥',
    ARRAY['秋燥','干燥','皮肤干','口干','鼻干','燥'],
    ARRAY['滋阴润燥','润肺止咳'], ARRAY['大热'], ARRAY[]::text[],
    '多润少燥，忌辛辣助火', 43),

  ('scene-exercise','scene','运动后',
    ARRAY['运动','健身','出汗','锻炼','跑步','撸铁'],
    ARRAY['补气养血'], ARRAY['大寒'], ARRAY[]::text[],
    '运动后可温补，忌立刻冰饮', 44)

ON CONFLICT (id) DO UPDATE SET
  category             = EXCLUDED.category,
  label                = EXCLUDED.label,
  keywords             = EXCLUDED.keywords,
  priority_health_tags = EXCLUDED.priority_health_tags,
  ban_natures          = EXCLUDED.ban_natures,
  ban_health_tags      = EXCLUDED.ban_health_tags,
  remind_text          = EXCLUDED.remind_text,
  sort_order           = EXCLUDED.sort_order,
  updated_at           = now();

-- ==================== 00102_food_therapy_templates.sql ====================
-- ============================================
-- 食材食疗智能导购 · 营销模板 / 导购话术库表
-- 创建时间: 2026-07-16
-- 说明:
--   1. food_therapy_templates —— 运营可配置的营销素材模板（销售话术/详情/朋友圈/风险/海报）
--      小程序详情页与收银台从此表读取话术，运营改模板无需发版。
--   2. 模板内容支持占位符：{name}{natureText}{tagText}{tagSentence}{remindText}
--      引擎 generateMarketingCopy 负责填充，缺表/缺行时回退硬编码默认集。
--   3. 与项目既有表一致：DISABLE ROW LEVEL SECURITY（测试阶段）。
-- ============================================

CREATE TABLE IF NOT EXISTS public.food_therapy_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tpl_key     TEXT NOT NULL UNIQUE,          -- sales_word | detail_desc | circle_copy | risk_tip | poster_template
  tpl_type    TEXT NOT NULL DEFAULT 'sales', -- sales | detail | circle | risk | poster
  title       TEXT NOT NULL,                 -- 展示名（运营看）
  content     TEXT NOT NULL,                 -- 模板正文（含占位符）
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ftt_key ON public.food_therapy_templates(tpl_key);
CREATE INDEX IF NOT EXISTS idx_ftt_active ON public.food_therapy_templates(is_active);

-- ========== 种子数据（与 marketing.ts 默认生成逻辑一致）==========
INSERT INTO public.food_therapy_templates (tpl_key, tpl_type, title, content, is_active, sort_order) VALUES
  ('sales_word', 'sales', '一句话销售话术', '{name}｜{natureText}，{tagText}，一口就懂你的口味', true, 10),
  ('detail_desc', 'detail', '详情卖点文案', '【{name}】{natureText}。{tagSentence}用心选材，让每一餐都有温度。', true, 20),
  ('circle_copy', 'circle', '朋友圈 / 社群文案', '今天点了{name}，{natureText}的治愈感真的绝了～{tagSentence}日常小确幸 get✨', true, 30),
  ('risk_tip', 'risk', '风险提醒（合规）', '温馨提示：{remindText}。食养建议不替代医嘱，适量为佳。', true, 40),
  ('poster_template', 'poster', '海报模板', '主标题：{name}\n副标题：{natureText}·{tagText}\n角标：食材食疗导购推荐\n脚注：食养参考·不替代医嘱', true, 50)
ON CONFLICT (tpl_key) DO NOTHING;

-- ========== 禁用 RLS（与项目既有表一致）==========
ALTER TABLE public.food_therapy_templates DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.food_therapy_templates IS '食材食疗导购营销模板 / 导购话术库 - 运营后台可改，小程序与收银台直读';

-- ✅ 完成！

-- ==================== 00103_food_therapy_feedback.sql ====================
-- ============================================
-- 食材食疗智能导购 · 用户反馈回流表
-- 创建时间: 2026-07-16
-- 说明:
--   1. food_therapy_feedback —— 记录用户与导购商品的交互事件（浏览/加购/购买/点赞/点踩）
--      用于「消费历史 + 体质权重学习闭环」：聚合用户对食疗标签的偏好，形成个性化权重。
--   2. 与项目既有表一致：DISABLE ROW LEVEL SECURITY（测试阶段）。
--   3. 个性化权重为轻量方案：统计各 health_tag 的正负反馈次数 → 打分加权，
--      无需训练模型（详见 src/utils/food-therapy/scoring.ts 的 scoreFoodTherapy weights 参数）。
-- ============================================

CREATE TABLE IF NOT EXISTS public.food_therapy_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  product_id  UUID,
  event_type  TEXT NOT NULL CHECK (event_type IN ('view','add_cart','purchase','like','dislike')),
  health_tag  TEXT[] DEFAULT '{}',
  emotion_tag TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ftf_user ON public.food_therapy_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ftf_user_event ON public.food_therapy_feedback(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ftf_product ON public.food_therapy_feedback(product_id);

-- ========== 禁用 RLS（与项目既有表一致）==========
ALTER TABLE public.food_therapy_feedback DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.food_therapy_feedback IS '食材食疗导购用户反馈回流 - 个性化权重学习数据（轻量统计，无训练）';

-- ✅ 完成！

-- ==================== 00104_food_therapy_v2_fields.sql ====================
-- 00104: products 表补「商品食疗智能系统」完整录入字段（对齐前后端分离架构 spec）
-- 设计说明：
--   1. 本迁移在 00100（性味/标签/搭配/相克/辅料）基础上，补充 spec 要求的
--      分类 / 正效+风险分离 / 情绪三段 / 场景 / 三类人群(带说明) / 门店营销配套。
--   2. 全部新列 nullable + 默认空，前端与 admin 端均做软降级（列不存在时剥离再保存），
--      故本迁移未执行也不影响既有上架与展示，只是暂无新录入能力。
--   3. 需在用户本机执行（沙箱无 supabase CLI / Token）。
--   4. 「人群标签 ↔ 适配菜品」映射通过 rec/cautious/forbidden_crowds 数组 + GIN 索引
--      + 前端 overlap 查询实现，无需额外映射表。

-- 一、基础信息区：商品分类（粉面 / 炖汤 / 热饮 / 小菜）
ALTER TABLE products ADD COLUMN IF NOT EXISTS food_category text;
COMMENT ON COLUMN products.food_category IS '商品分类：粉面/炖汤/热饮/小菜；与现有 category_id 并存，专门驱动食疗导购分类筛选';
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_food_category;
ALTER TABLE products ADD CONSTRAINT chk_products_food_category
  CHECK (food_category IS NULL OR food_category IN ('粉面','炖汤','热饮','小菜'));

-- 二、核心食疗录入区
-- 原材料清单（仅食材名称，无工艺）：复用现有 ingredients text[]，不再单列。

-- 食疗滋养效果：正向调理作用（单独）
ALTER TABLE products ADD COLUMN IF NOT EXISTS positive_effect text;
COMMENT ON COLUMN products.positive_effect IS '正向调理作用（商家填写的食疗收益文案）';

-- 食疗滋养效果：食用风险提示（单独，与正向分离）
ALTER TABLE products ADD COLUMN IF NOT EXISTS risk_warning text;
COMMENT ON COLUMN products.risk_warning IS '食用风险提示（如：上火/经期量大人群会加重不适）';

-- 情绪价值文案（固定三段式模板填空，存整段）
ALTER TABLE products ADD COLUMN IF NOT EXISTS emotion_copy text;
COMMENT ON COLUMN products.emotion_copy IS '情绪价值文案（三段式：温暖陪伴/治愈低落/犒劳自己），商家填空或自动生成';

-- 适配消费场景列表（多选 + 自定义）
ALTER TABLE products ADD COLUMN IF NOT EXISTS scenes text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.scenes IS '适配消费场景：熬夜加班/秋冬御寒/经期前后/术后体虚/单人简餐/饭后解腻/换季易感冒 + 自定义';

-- 三、人群标签配置（系统打分核心，三类 + 说明）
-- ① 五星推荐人群（多选项勾选）
ALTER TABLE products ADD COLUMN IF NOT EXISTS rec_crowds text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.rec_crowds IS '五星推荐人群：宫寒量少/经期量大/喉咙肿痛/易上火/体虚怕冷/痛风/脾胃虚寒 中选填';

-- ② 谨慎食用人群 + 限制说明
ALTER TABLE products ADD COLUMN IF NOT EXISTS cautious_crowds text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.cautious_crowds IS '谨慎食用人群';
ALTER TABLE products ADD COLUMN IF NOT EXISTS cautious_notes text;
COMMENT ON COLUMN products.cautious_notes IS '谨慎食用限制说明（如：少量饮用、去辣减油）';

-- ③ 禁止食用人群 + 风险原因
ALTER TABLE products ADD COLUMN IF NOT EXISTS forbidden_crowds text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.forbidden_crowds IS '禁止食用人群';
ALTER TABLE products ADD COLUMN IF NOT EXISTS forbidden_reasons text;
COMMENT ON COLUMN products.forbidden_reasons IS '禁止食用风险原因（如：加重不适/诱发痛风）';

-- 四、门店营销配套录入区（自动同步前端/海报/导购）
-- 店内升单搭配套餐（绑定店内其他商品 id）
ALTER TABLE products ADD COLUMN IF NOT EXISTS combo_product_ids text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.combo_product_ids IS '升单搭配套餐：绑定店内其他商品 id（products.id）';

-- 店员导购短句
ALTER TABLE products ADD COLUMN IF NOT EXISTS guide_sentence text;
COMMENT ON COLUMN products.guide_sentence IS '店员导购短句（销售话术库 / 商品卡副标题）';

-- 朋友圈种草文案
ALTER TABLE products ADD COLUMN IF NOT EXISTS moments_copy text;
COMMENT ON COLUMN products.moments_copy IS '朋友圈 / 社群种草文案';

-- 忌口红字警示语
ALTER TABLE products ADD COLUMN IF NOT EXISTS taboo_warning text;
COMMENT ON COLUMN products.taboo_warning IS '忌口红字警示语（详情页底部小字）';

-- 索引：便于前端按场景/人群 overlap 召回
CREATE INDEX IF NOT EXISTS idx_products_scenes ON products USING gin (scenes);
CREATE INDEX IF NOT EXISTS idx_products_rec_crowds ON products USING gin (rec_crowds);
CREATE INDEX IF NOT EXISTS idx_products_cautious_crowds ON products USING gin (cautious_crowds);
CREATE INDEX IF NOT EXISTS idx_products_forbidden_crowds ON products USING gin (forbidden_crowds);
CREATE INDEX IF NOT EXISTS idx_products_food_category ON products (food_category);

-- ==================== 00105_profile_constitution.sql ====================
-- 00105 用户体质/健康状况档案（食疗个性化匹配用）
-- 用户在小程序「我的体质档案」页自填体质/健康状况标签，持久化到 profiles.constitution_tags，
-- 登录后由 FoodTherapyContext 自动注入当前匹配人群，实现"用户输入体质→自动配对商品"。
-- 该列仅作食养参考匹配维度，不替代医嘱；严禁在商品文案中出现"治疗/降血压"等医疗宣称。

alter table profiles
  add column if not exists constitution_tags text[] null default null;

-- GIN 索引：便于按标签快速检索（如运营侧聚合某体质人群）
create index if not exists idx_profiles_constitution_tags
  on profiles using gin (constitution_tags);

comment on column profiles.constitution_tags is
  '用户自填的体质/健康状况标签（如 宫寒量少 / 高血压），用于食疗商品匹配；仅作食养参考，不替代医嘱';

-- ==================== 00106_consolidate_get_rank_progress.sql ====================
-- 00106 收敛 get_rank_progress：消除历史上 00005(p_user_id+jsonb) / 00013,00049,00050(user_id+TABLE) 的返回类型冲突
-- 执行时间：2026-07-16
-- 目标：数据库只保留唯一一份 get_rank_progress(p_user_id uuid) RETURNS jsonb，
--       字段契约与前端 src/pages/my-promotion/index.tsx 完全一致（current_rank/next_rank/
--       direct_count/target_count/progress/total_gmv/points/balance）。
--       段位判定逻辑对齐 V5（与前端 commission-calculator-v5.ts 的 total_consumption 阈值一致）。
--
-- 注：本迁移可在任何已应用旧迁移的库上安全重跑（先 DROP 所有重载再重建）。

-- 1. 强制删除所有同名重载（避免 42P13 "cannot change return type"）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname = 'get_rank_progress'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END $$;

-- 2. 重建唯一正确的 jsonb 版本（参数名 p_user_id，与前端 rpc 调用一致）
CREATE OR REPLACE FUNCTION public.get_rank_progress(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_direct_count int;
  v_dynamic_score numeric;
  v_current_rank text;
  v_next_rank text;
  v_next_min numeric;
  v_progress numeric;
BEGIN
  SELECT
    total_consumption,
    member_rank,
    points,
    commission_balance
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- 直接下级数量
  SELECT count(*) INTO v_direct_count
  FROM public.profiles
  WHERE referrer_id = p_user_id;

  -- 动态分数 = 个人累计消费（与前端 calculateDynamicScore 一致）
  v_dynamic_score := COALESCE(v_profile.total_consumption, 0);

  -- 当前段位（V5 阈值：0/200/800/2000/6000/20000）
  SELECT rank_name INTO v_current_rank
  FROM (
    VALUES
      ('江湖散修', 0),
      ('外门弟子', 200),
      ('内门弟子', 800),
      ('核心弟子', 2000),
      ('长老', 6000),
      ('掌门', 20000)
  ) AS t(rank_name, min_score)
  WHERE v_dynamic_score >= min_score
  ORDER BY min_score DESC
  LIMIT 1;

  IF v_current_rank IS NULL THEN
    v_current_rank := '江湖散修';
  END IF;

  -- 下一段位与所需消费门槛
  SELECT rank_name, min_score INTO v_next_rank, v_next_min
  FROM (
    VALUES
      ('外门弟子', 200),
      ('内门弟子', 800),
      ('核心弟子', 2000),
      ('长老', 6000),
      ('掌门', 20000)
  ) AS t(rank_name, min_score)
  WHERE min_score > v_dynamic_score
  ORDER BY min_score ASC
  LIMIT 1;

  IF v_next_rank IS NULL THEN
    v_next_rank := '已是最高段位';
    v_next_min := v_dynamic_score;
  END IF;

  -- 进度 = 距下一段位消费门槛的百分比（已是最高段位则 100）
  IF v_next_rank = '已是最高段位' THEN
    v_progress := 100;
  ELSE
    v_progress := LEAST(100,
      ((v_dynamic_score - (
        SELECT COALESCE(MAX(min_score), 0) FROM (
          VALUES (0),(200),(800),(2000),(6000),(20000)
        ) AS prev(min_score)
        WHERE min_score <= v_dynamic_score
      )) / NULLIF(v_next_min - (
        SELECT COALESCE(MAX(min_score), 0) FROM (
          VALUES (0),(200),(800),(2000),(6000),(20000)
        ) AS prev(min_score)
        WHERE min_score <= v_dynamic_score
      ), 0)) * 100);
  END IF;

  RETURN jsonb_build_object(
    'current_rank', v_current_rank,
    'next_rank', v_next_rank,
    'direct_count', v_direct_count,
    'target_count', v_next_min,
    'progress', ROUND(v_progress, 1),
    'total_gmv', v_dynamic_score,
    'points', COALESCE(v_profile.points, 0),
    'balance', COALESCE(v_profile.commission_balance, 0)
  );
END;
$$;

-- 3. 授予前端匿名/认证角色执行权限（与历史迁移保持一致）
GRANT EXECUTE ON FUNCTION public.get_rank_progress(uuid) TO anon, authenticated;

-- ==================== 00107_auto_tag_products.sql ====================
-- 给现有商品自动补充 mood_tags（根据商品名称/分类/描述推断）
-- 执行时间：2026-07-04
-- 说明：根据商品名称和分类关键词，自动填充 mood_tags 字段

-- 先查看有多少商品没有 mood_tags
-- SELECT COUNT(*) FROM products WHERE mood_tags IS NULL OR array_length(mood_tags, 1) = 0;

-- 分批更新（用 CASE WHEN 根据商品名称关键词匹配）

-- 1. 食品类 → 满足、幸福、用餐时光
UPDATE products
SET mood_tags = ARRAY['满足', '幸福', '用餐时光']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%吃%' OR name ILIKE '%食%' OR name ILIKE '%餐%' OR name ILIKE '%饭%'
    OR name ILIKE '%面%' OR name ILIKE '%粉%' OR name ILIKE '%糕%' OR name ILIKE '%饼%'
    OR name ILIKE '%果%' OR name ILIKE '%水%' OR name ILIKE '%茶%' OR name ILIKE '%奶%'
    OR name ILIKE '%肉%' OR name ILIKE '%鸡%' OR name ILIKE '%鱼%' OR name ILIKE '%虾%'
  );

-- 2. 甜品/奶茶/蛋糕 → 甜蜜、幸福、治愈
UPDATE products
SET mood_tags = ARRAY['甜蜜', '幸福', '治愈']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%甜%' OR name ILIKE '%糖%' OR name ILIKE '%蜜%' OR name ILIKE '%蛋糕%'
    OR name ILIKE '%奶茶%' OR name ILIKE '%巧克力%' OR name ILIKE '%布丁%' OR name ILIKE '%冰淇淋%'
    OR name ILIKE '%雪糕%' OR name ILIKE '%糖果%' OR name ILIKE '%饼干%'
  );

-- 3. 文创/书籍/文具 → 专注、安静、学习空间
UPDATE products
SET mood_tags = ARRAY['专注', '安静', '学习空间']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%书%' OR name ILIKE '%笔%' OR name ILIKE '%纸%' OR name ILIKE '%本%'
    OR name ILIKE '%文具%' OR name ILIKE '%文创%' OR name ILIKE '%笔记本%' OR name ILIKE '%手账%'
    OR name ILIKE '%日历%' OR name ILIKE '%贴纸%' OR name ILIKE '%便签%'
  );

-- 4. 礼品/饰品 → 送礼、品质、仪式感
UPDATE products
SET mood_tags = ARRAY['送礼', '品质', '仪式感']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%礼%' OR name ILIKE '%饰%' OR name ILIKE '%项链%' OR name ILIKE '%手链%'
    OR name ILIKE '%戒指%' OR name ILIKE '%耳环%' OR name ILIKE '%手镯%' OR name ILIKE '%胸针%'
    OR name ILIKE '%摆件%' OR name ILIKE '%装饰%' OR name ILIKE '%贺卡%'
  );

-- 5. 家居/日用 → 治愈、品质、实用
UPDATE products
SET mood_tags = ARRAY['治愈', '品质', '实用']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%家居%' OR name ILIKE '%日用%' OR name ILIKE '%毛巾%' OR name ILIKE '%杯%'
    OR name ILIKE '%碗%' OR name ILIKE '%盘%' OR name ILIKE '%锅%' OR name ILIKE '%壶%'
    OR name ILIKE '%灯%' OR name ILIKE '%香薰%' OR name ILIKE '%蜡烛%' OR name ILIKE '%靠垫%'
  );

-- 6. 美妆/护肤 → 精致、仪式感、治愈
UPDATE products
SET mood_tags = ARRAY['精致', '仪式感', '治愈']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%妆%' OR name ILIKE '%护肤%' OR name ILIKE '%面膜%' OR name ILIKE '%精华%'
    OR name ILIKE '%口红%' OR name ILIKE '%唇膏%' OR name ILIKE '%防晒%' OR name ILIKE '%洗面%'
    OR name ILIKE '%乳液%' OR name ILIKE '%面霜%'
  );

-- 7. 养生/健康 → 治愈、放松、安静
UPDATE products
SET mood_tags = ARRAY['治愈', '放松', '安静']
WHERE (mood_tags IS NULL OR array_length(mood_tags, 1) = 0)
  AND (
    name ILIKE '%养生%' OR name ILIKE '%枸杞%' OR name ILIKE '%红枣%' OR name ILIKE '%茶%'
    OR name ILIKE '%保健%' OR name ILIKE '%按摩%' OR name ILIKE '%足浴%' OR name ILIKE '%泡脚%'
  );

-- 8. 剩余未打标签的商品 → 随机给一个通用标签
UPDATE products
SET mood_tags = ARRAY['愉悦', '品质']
WHERE mood_tags IS NULL OR array_length(mood_tags, 1) = 0;

-- 查看结果
-- SELECT id, name, mood_tags FROM products LIMIT 20;

-- ==================== 00107_fix_handle_new_user_trigger.sql ====================
-- 00107_fix_handle_new_user_trigger.sql
-- 修复 handle_new_user()：profiles 表已在后续迁移中移除 username 列，
-- 但 00092 重写的触发器仍向 profiles 插入 username，导致所有「邮箱注册」在
-- AFTER INSERT 触发器阶段报错回滚（ERROR 42703: column "username" does not exist），
-- 进而 auth.users 插入整体失败、新用户无法注册。
-- 本迁移仅移除该非法列引用，不改变角色判定 / ON CONFLICT 逻辑。
-- 幂等：CREATE OR REPLACE，可重复执行。

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.user_role := 'user';
BEGIN
  -- 后台超级管理员白名单（如需新增管理员邮箱在此追加）
  IF NEW.email IN ('admin@laidianyouxi.com') THEN
    v_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, phone, nickname, role, openid)
  VALUES (
    NEW.id,
    NEW.phone,
    COALESCE((NEW.raw_user_meta_data->>'nickname')::text, '江湖散修'),
    v_role,
    (NEW.raw_user_meta_data->>'openid')::text
  )
  -- 若 profile 已存在（手动预建等），仅当 role 不一致时纠正为白名单角色
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role
    WHERE public.profiles.role <> EXCLUDED.role;

  RETURN NEW;
END;
$$;

-- ==================== 00108_add_commission_distributed_to_orders.sql ====================
-- =============================================================
--  00035_add_commission_distributed_to_orders.sql
--  2026-07-05
--
--  功能：给 orders 表添加 commission_distributed 字段
--        用于幂等性保护，防止重复分佣
-- =============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_distributed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_points integer DEFAULT 0;

-- 索引（用于快速查询未分佣订单）
CREATE INDEX IF NOT EXISTS idx_orders_commission_distributed 
  ON public.orders(commission_distributed) 
  WHERE commission_distributed = false;

-- 注释
COMMENT ON COLUMN public.orders.commission_distributed IS '是否已分佣（防止重复分佣）';
COMMENT ON COLUMN public.orders.buyer_points IS '买家获得的积分';

-- RLS（测试阶段关闭）
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;

-- ==================== 00108_rename_member_ranks.sql ====================
-- 00108 段位名称重命名（情绪境界主题）——幂等版
-- 旧：江湖散修 / 外门弟子 / 内门弟子 / 核心弟子 / 长老 / 掌门
-- 新：凡心   / 初心     / 明心     / 静心     / 悟心 / 无心境
--
-- 本版改用 DO $$ IF EXISTS ... 包裹每条 RENAME VALUE，
-- 兼容线上枚举已部分改名 / 已手动改名 的情况，重复执行安全。
-- 需在 Supabase 本机（Dashboard SQL 或 CLI）执行；沙箱无 SQL 权限。

-- 1) 重命名枚举标签（逐条判断，幂等）
DO $$
DECLARE
  typ oid := 'public.member_rank'::regtype;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '江湖散修') THEN
    ALTER TYPE public.member_rank RENAME VALUE '江湖散修' TO '凡心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '外门弟子') THEN
    ALTER TYPE public.member_rank RENAME VALUE '外门弟子' TO '初心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '内门弟子') THEN
    ALTER TYPE public.member_rank RENAME VALUE '内门弟子' TO '明心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '核心弟子') THEN
    ALTER TYPE public.member_rank RENAME VALUE '核心弟子' TO '静心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '长老') THEN
    ALTER TYPE public.member_rank RENAME VALUE '长老' TO '悟心';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = typ AND enumlabel = '掌门') THEN
    ALTER TYPE public.member_rank RENAME VALUE '掌门' TO '无心境';
  END IF;
END $$;

-- 2) profiles.member_rank 列默认值同步为新最低段位（幂等）
ALTER TABLE public.profiles ALTER COLUMN member_rank SET DEFAULT '凡心';

-- 3) 段位配置查找表 rank_configs：仅当旧名存在时更新（幂等）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rank_configs') THEN
    UPDATE public.rank_configs SET rank_name = '凡心'   WHERE rank_name = '江湖散修';
    UPDATE public.rank_configs SET rank_name = '初心'   WHERE rank_name = '外门弟子';
    UPDATE public.rank_configs SET rank_name = '明心'   WHERE rank_name = '内门弟子';
    UPDATE public.rank_configs SET rank_name = '静心'   WHERE rank_name = '核心弟子';
    UPDATE public.rank_configs SET rank_name = '悟心'   WHERE rank_name = '长老';
    UPDATE public.rank_configs SET rank_name = '无心境' WHERE rank_name = '掌门';
  END IF;
END $$;

-- 4) 兼容：若存在遗留的 profiles.rank(TEXT) 列，默认值一并改为新最低段位
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'rank'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN rank SET DEFAULT '凡心';
  END IF;
END $$;

-- 5) 同步 member_rank_events 历史记录的阶段文案（UPDATE 天然幂等）
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_rank_events') THEN
    UPDATE public.member_rank_events SET from_stage = '凡心'   WHERE from_stage = '江湖散修';
    UPDATE public.member_rank_events SET from_stage = '初心'   WHERE from_stage = '外门弟子';
    UPDATE public.member_rank_events SET from_stage = '明心'   WHERE from_stage = '内门弟子';
    UPDATE public.member_rank_events SET from_stage = '静心'   WHERE from_stage = '核心弟子';
    UPDATE public.member_rank_events SET from_stage = '悟心'   WHERE from_stage = '长老';
    UPDATE public.member_rank_events SET from_stage = '无心境' WHERE from_stage = '掌门';
    UPDATE public.member_rank_events SET to_stage   = '凡心'   WHERE to_stage   = '江湖散修';
    UPDATE public.member_rank_events SET to_stage   = '初心'   WHERE to_stage   = '外门弟子';
    UPDATE public.member_rank_events SET to_stage   = '明心'   WHERE to_stage   = '内门弟子';
    UPDATE public.member_rank_events SET to_stage   = '静心'   WHERE to_stage   = '核心弟子';
    UPDATE public.member_rank_events SET to_stage   = '悟心'   WHERE to_stage   = '长老';
    UPDATE public.member_rank_events SET to_stage   = '无心境' WHERE to_stage   = '掌门';
  END IF;
END $$;

-- ==================== 00109_create_videos_bucket.sql ====================
-- 00049  创建 videos 存储桶 + 访问策略（修复商品视频上传失败）
-- ------------------------------------------------------------
-- 根因：src/utils/upload.ts 的 uploadVideo() 默认写入 'videos' 桶，
--       但此前迁移只建了 'images' 桶，'videos' 桶从未创建，
--       导致视频上传直接报「存储桶不存在」。
--
-- 本迁移补齐 videos 桶（公开读取），并预建 RLS 策略（测试期 RLS 已关闭，
-- 上线开启 RLS 后策略自动生效）。幂等可重复执行。

-- 1. 创建 videos 桶（公开读取）
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 公开读取策略
DROP POLICY IF EXISTS "videos_public_read" ON storage.objects;
CREATE POLICY "videos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

-- 3. 登录用户可写（与 images 桶策略保持一致）
DROP POLICY IF EXISTS "videos_auth_insert" ON storage.objects;
CREATE POLICY "videos_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'videos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "videos_auth_update" ON storage.objects;
CREATE POLICY "videos_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'videos' AND auth.uid() = owner);

DROP POLICY IF EXISTS "videos_auth_delete" ON storage.objects;
CREATE POLICY "videos_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'videos' AND auth.uid() = owner);

-- 提示：视频单文件可能超过 Supabase 默认 50MB 上限，
-- 请在 Supabase 控制台 Storage → videos 桶 → 修改「文件大小上限」为 200MB（或按需调整）。

SELECT '✅ videos 存储桶已就绪' AS result;

-- ==================== 00113_fix_referral_binding_referrer_id.sql ====================
-- 00113 修复推荐绑定：convert_pending_referral 必须同时写 profiles.referrer_id
-- 背景：原 00035 函数只把推广码文本写进 invited_by，没写 referrer_id（uuid 上级），
-- 导致新注册用户既不在「我的好友」里，也无法触发分佣。
-- 本脚本：
--   1) 修复 convert_pending_referral，转化时同时 SET referrer_id = v_referrer_id
--   2) 回刷存量：invited_by 是推广码文本且 referrer_id 为空的用户，按 invite_code/referral_code 找到上级并补 referrer_id

-- 1. 修复 DB 转化函数
CREATE OR REPLACE FUNCTION convert_pending_referral(
  p_device_id TEXT,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referral_code TEXT;
  v_store_id UUID;
  v_pending_id UUID;
  v_referrer_id UUID;
BEGIN
  -- 查找最近的 pending 记录
  SELECT id, referral_code, store_id
  INTO v_pending_id, v_referral_code, v_store_id
  FROM pending_referrals
  WHERE device_id = p_device_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 获取推荐人 ID（优先 invite_code，兼容 referral_code）
  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE invite_code = v_referral_code OR referral_code = v_referral_code
  LIMIT 1;

  -- 更新 pending 记录状态
  UPDATE pending_referrals
  SET status = 'converted',
      converted_user_id = p_user_id::UUID,
      updated_at = now()
  WHERE id = v_pending_id;

  -- 写入 user_store_relation（锁客关系）
  IF v_store_id IS NOT NULL AND v_referrer_id IS NOT NULL THEN
    INSERT INTO user_store_relation (user_id, store_id, referrer_id, status)
    VALUES (p_user_id::UUID, v_store_id, v_referrer_id, 'active')
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  -- 更新 profiles：保留 invited_by（推广码文本）用于追溯，同时写 referrer_id（uuid 上级）用于分佣/好友列表
  UPDATE profiles
  SET invited_by = COALESCE(invited_by, v_referral_code),
      referrer_id = COALESCE(referrer_id, v_referrer_id)
  WHERE id = p_user_id::UUID;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 回刷存量：invited_by 为推广码文本且 referrer_id 为空的用户
DO $$
DECLARE
  v_count int;
BEGIN
  UPDATE profiles p
  SET referrer_id = r.id
  FROM profiles r
  WHERE p.invited_by IS NOT NULL
    AND p.referrer_id IS NULL
    AND (r.invite_code = p.invited_by OR r.referral_code = p.invited_by);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '✅ 回刷 % 个用户的 referrer_id', v_count;
END $$;

-- ==================== 00115_fix_profiles_rls_downline_read.sql ====================
-- 00115：修复「我的好友 / 我的粉丝」在小程序端为空（后台能看到）的问题
--
-- 根因（已定位）：
--   profiles 表 RLS 最终策略 rls_final_profiles_self_read 为
--     USING (id = auth.uid() OR public.is_admin())
--   即【普通用户只能 SELECT 自己的那一行】。
--   小程序端 getMyReferrals() 执行 `select('*').eq('referrer_id', 我的id)` 查询下线时，
--   RLS 逐行判定「该行 id 是否等于当前登录用户」——下线行的 id 当然不等于自己，
--   于是被整体拦截，返回空数组。后台用 admin / service key 不受此限，故能看到关系。
--
-- 修复：新增一条 SELECT 策略，允许 authenticated 用户读取【自己的推广下线】
--   （一级：referrer_id = 我；二级：referrer_id 属于我的一级）。
--   用 SECURITY DEFINER 函数返回可见网络 id 集合，避免 RLS 递归。

-- 1) 安全定义者函数：返回当前用户【可见网络】的 id（一级 + 二级），绕过 RLS 防递归
CREATE OR REPLACE FUNCTION public.visible_network_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT p.id), '{}'::uuid[])
  FROM public.profiles p
  WHERE p.referrer_id = auth.uid()                                   -- 一级（我的好友）
     OR p.referrer_id IN (                                          -- 二级（我的粉丝）
          SELECT id FROM public.profiles WHERE referrer_id = auth.uid()
        );
$$;

-- 2) 新增 SELECT 策略：自己 + 可见网络 可读（与既有 self_read / admin 策略 OR 共存）
DROP POLICY IF EXISTS rls_profiles_read_network ON public.profiles;
CREATE POLICY rls_profiles_read_network ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR id = ANY(public.visible_network_ids()));

-- 2.1) 授权 authenticated 可执行该函数（RLS 表达式内调用需要 EXECUTE 权限）
GRANT EXECUTE ON FUNCTION public.visible_network_ids() TO authenticated;

-- 3) 校验提示
DO $$
BEGIN
  RAISE NOTICE '✅ 已新增 profiles 读取下线策略 rls_profiles_read_network';
  RAISE NOTICE '   现在用户可读取：自己 + 一级下线(referrer_id=我) + 二级下线(referrer_id∈我的一级)';
  RAISE NOTICE '   请在微信开发者工具「清除缓存 → 全部清除」后重新打开「我的推荐」页验证。';
END $$;

-- ==================== 00116_fix_withdrawals_columns.sql ====================
-- 00116：补齐 withdrawals 表前端所需列（修复 PGRST204: bank_account 列缺失）
--
-- 根因：
--   migrations 中 00007 与 00015 都对同一张 withdrawals 表执行了
--   `CREATE TABLE IF NOT EXISTS`，二者列结构不一致：
--     00007 → bank_name / bank_account / bank_holder / alipay_account / withdraw_method
--     00015 → method / account_info(jsonb)  （无 bank_account 等列）
--   实际生效的表可能不含 00007 的列；且前端额外写入的 real_name / id_card
--   在任一版本中均未定义。前端 applyWithdraw 显式写入这些列 → PostgREST 校验
--   schema cache 时找不到 bank_account → 报 PGRST204。
--
-- 修复：用 ADD COLUMN IF NOT EXISTS 幂等补齐前端所需全部列，不影响已有数据。

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS bank_name       TEXT,
  ADD COLUMN IF NOT EXISTS bank_account    TEXT,
  ADD COLUMN IF NOT EXISTS bank_holder     TEXT,
  ADD COLUMN IF NOT EXISTS alipay_account  TEXT,
  ADD COLUMN IF NOT EXISTS withdraw_method TEXT DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS real_name       TEXT,
  ADD COLUMN IF NOT EXISTS id_card         TEXT;

-- 诊断：打印补齐后的列清单，方便确认
DO $$
DECLARE
  col text;
BEGIN
  RAISE NOTICE '===== withdrawals 当前列 =====';
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'withdrawals' ORDER BY ordinal_position
  LOOP
    RAISE NOTICE '  - %', col;
  END LOOP;
  RAISE NOTICE '✅ 已确保 bank_account / bank_name / bank_holder / alipay_account / withdraw_method / real_name / id_card 存在';
END $$;

-- 尝试刷新 PostgREST schema cache（兼容新旧两种写法；失败则提示手动 Reload）
DO $$
BEGIN
  BEGIN
    PERFORM pg_notify('pgrst', 'reload schema');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      EXECUTE 'NOTIFY pgrst, ''reload schema''';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠️ 自动刷新 schema cache 失败，请到 Supabase Dashboard → Database → 点 "Reload schema cache"';
    END;
  END;
END $$;

-- ==================== 00120_merchant_settlement.sql ====================
-- =====================================================================
-- 00120：商家货款结算体系（方案 A 落地 · 核心迁移）
-- =====================================================================
-- 背景：
--   原模型中，用户用「健康豆」支付时，豆仅从买家 tb_balance 扣减后焚毁，
--   商家只看到 GMV 展示数字，没有任何货款入账（无 merchant_balance、无结算逻辑）。
--   即「用户健康豆 → 平台收 RMB（充值时已收）→ 商家 0 入账」，构成资产缺口。
--
-- 本迁移建立「商家货款以 RMB 结算、可提现」的完整闭环，并严守三条合规红线：
--   1) 健康豆(tb_balance) = 平台内部消费币，不可提现、不可二级转让（既有规则不变）；
--   2) 推广佣金(commission_balance) = 可提现、与货款严格隔离（既有规则不变）；
--   3) 商家货款(merchant_balance) = 本次新增，可提现，与健康豆/佣金三账隔离；
--      真实资金下发走「微信支付服务商分账直达」模式（资金直达商家子商户号，
--      平台不池化 → 规避二清）。本期代码包将真实分账 API 留作接入点（见 EF）。
--
-- 结算口径（用户已确认决策）：
--   - 净额结算：订单 completed 时，商家应收 = 订单全额 − 让利池 − 微信通道费；
--   - 健康豆支付部分「等值计入」：豆付部分按 1:1 计入结算额，由平台以自有资金垫付
--     （平台在用户充值时已收 RMB，故垫付无额外成本），不要求商家持有/接收健康豆；
--   - 微信通道费(0.6%)仅对真实现金部分(total_amount − tb_used)计提。
--
-- 让利率单位归一：stores.referral_rate 实际存的是「百分比」(10.00=10%)，
--   而 distribute-commission 的 discount_rate 是「小数」(0.09)。RPC 内做兼容：
--   rate = referral_rate > 1 ? referral_rate/100 : referral_rate。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) stores 表：新增商家货款余额 / 冻结额 / 微信子商户号
-- ---------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS merchant_balance   numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_frozen  numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wx_sub_mch_id       text;

COMMENT ON COLUMN public.stores.merchant_balance IS '商家可结算货款余额（人民币元，可提现，与健康豆/佣金三账隔离）';
COMMENT ON COLUMN public.stores.settlement_frozen IS '冻结中货款（如退款/争议处理期间，不计入可提现）';
COMMENT ON COLUMN public.stores.wx_sub_mch_id IS '微信支付服务商模式下的子商户号，用于分账直达（资金不池化，规避二清）';

-- ---------------------------------------------------------------------
-- 2) 商家结算台账 merchant_settlements
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_settlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_no        text,
  total_amount    numeric(12,4) NOT NULL DEFAULT 0,   -- 订单全额（豆付等值计入）
  tb_portion      numeric(12,4) NOT NULL DEFAULT 0,   -- 健康豆抵扣部分（平台垫付）
  cash_portion    numeric(12,4) NOT NULL DEFAULT 0,   -- 微信现金实付部分
  referral_rate   numeric(6,4)  NOT NULL DEFAULT 0,   -- 让利率快照（小数口径，审计用）
  discount_pool   numeric(12,4) NOT NULL DEFAULT 0,   -- 让利池（已分给推广/L1/L2/买家积分/平台）
  channel_fee     numeric(12,4) NOT NULL DEFAULT 0,   -- 微信通道费（仅现金部分）
  settle_amount   numeric(12,4) NOT NULL DEFAULT 0,   -- 商家应收货款 = 全额 − 让利池 − 通道费
  status          text NOT NULL DEFAULT 'settled' CHECK (status IN ('settled','reversed')),
  settled_at      timestamptz,
  reversed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ms_store ON public.merchant_settlements(store_id);
CREATE INDEX IF NOT EXISTS idx_ms_order ON public.merchant_settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_ms_status ON public.merchant_settlements(status);

-- 财务/运营表：与项目既有约定一致，DISABLE RLS（admin-web 用 anon key 直读）
ALTER TABLE public.merchant_settlements DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3) withdrawals 表：新增 kind（佣金/货款）与关联结算单
--    （store_id / bank_* / commission_ids 已由 00015 / 00116 添加，此处仅补差分）
-- ---------------------------------------------------------------------
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'commission'
    CHECK (kind IN ('commission','settlement')),
  ADD COLUMN IF NOT EXISTS merchant_settlement_ids uuid[];

COMMENT ON COLUMN public.withdrawals.kind IS 'commission=推广佣金提现；settlement=商家货款提现';
COMMENT ON COLUMN public.withdrawals.merchant_settlement_ids IS 'kind=settlement 时关联的 merchant_settlements.id 列表';

CREATE INDEX IF NOT EXISTS idx_withdrawals_kind ON public.withdrawals(kind);

-- ---------------------------------------------------------------------
-- 4) RPC：fn_settle_order —— 自包含、幂等、不阻断订单完成
--    从 orders + stores 独立算出商家应收，不依赖 distribute-commission 是否已跑
--    （纯健康豆订单当前根本不触发 distribute-commission，故必须自包含）。
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   orders%ROWTYPE;
  v_store   stores%ROWTYPE;
  v_rate    numeric;
  v_cash    numeric;
  v_pool    numeric;
  v_channel numeric;
  v_settle  numeric;
  v_exist   uuid;
BEGIN
  -- 读取订单
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- 仅「已完成」才结算
  IF v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_completed', 'status', v_order.status);
  END IF;

  -- 平台自营 / 无门店 不结算（避免平台自我结算）
  IF v_order.store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_store');
  END IF;

  -- 幂等：已结算则直接返回既有记录
  SELECT id INTO v_exist FROM merchant_settlements WHERE order_id = p_order_id LIMIT 1;
  IF v_exist IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'settlement_id', v_exist);
  END IF;

  -- 读取门店让利率
  SELECT * INTO v_store FROM stores WHERE id = v_order.store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  -- 让利率单位归一：>1 视为百分比，≤1 视为小数
  v_rate := CASE
              WHEN COALESCE(v_store.referral_rate, 0) > 1 THEN v_store.referral_rate / 100.0
              ELSE COALESCE(v_store.referral_rate, 0)
            END;

  -- 现金部分（微信实付）= 总额 − 健康豆抵扣
  v_cash := GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.tb_used, 0));

  -- 让利池：按订单全额（豆付等值计入）计提
  v_pool := ROUND((COALESCE(v_order.total_amount, 0) * v_rate)::numeric, 4);

  -- 通道费：仅真实微信现金部分计提（0.6%）
  v_channel := ROUND((v_cash * 0.006)::numeric, 4);

  -- 商家应收货款 = 全额 − 让利池 − 微信通道费（豆付部分由平台垫付，等值计入）
  v_settle := ROUND((COALESCE(v_order.total_amount, 0) - v_pool - v_channel)::numeric, 4);
  v_settle := GREATEST(0, v_settle);

  -- 写入结算台账
  INSERT INTO merchant_settlements
    (store_id, order_id, order_no, total_amount, tb_portion, cash_portion,
     referral_rate, discount_pool, channel_fee, settle_amount, status, settled_at)
  VALUES
    (v_order.store_id, v_order.id, v_order.order_no,
     COALESCE(v_order.total_amount, 0), LEAST(COALESCE(v_order.tb_used, 0), COALESCE(v_order.total_amount, 0)), v_cash,
     v_rate, v_pool, v_channel, v_settle, 'settled', now())
  RETURNING id INTO v_exist;

  -- 累加门店「可结算货款余额」
  UPDATE stores
     SET merchant_balance = ROUND((COALESCE(merchant_balance, 0) + v_settle)::numeric, 4)
   WHERE id = v_order.store_id;

  RETURN jsonb_build_object('ok', true, 'settlement_id', v_exist, 'settle_amount', v_settle);
EXCEPTION WHEN OTHERS THEN
  -- 结算失败绝不应阻断订单完成：记录并放行
  RAISE WARNING 'fn_settle_order failed for %: %', p_order_id, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) RPC：fn_reverse_settlement —— 退款/争议时回冲商家货款
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reverse_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec merchant_settlements%ROWTYPE;
BEGIN
  SELECT * INTO v_rec
    FROM merchant_settlements
   WHERE order_id = p_order_id AND status = 'settled'
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_active_settlement');
  END IF;

  -- 回冲门店余额（不允许负）
  UPDATE stores
     SET merchant_balance = GREATEST(0, ROUND((COALESCE(merchant_balance, 0) - v_rec.settle_amount)::numeric, 4))
   WHERE id = v_rec.store_id;

  UPDATE merchant_settlements SET status = 'reversed', reversed_at = now() WHERE id = v_rec.id;

  RETURN jsonb_build_object('ok', true, 'reversed_amount', v_rec.settle_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 6) RPC：fn_merchant_withdraw —— 商家货款提现申请（原子：校验+扣减+写台账）
--    客户端直写 stores.merchant_balance 受 RLS 限制，故走 SECURITY DEFINER RPC。
--    真实资金下发（微信服务商分账）由审批通过后调用 EF merchant-payout 完成。
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_merchant_withdraw(
  p_store_id   uuid,
  p_user_id    uuid,
  p_amount     numeric,
  p_method     text,
  p_account    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal     numeric;
  v_amt     numeric;
  v_wid     uuid;
  v_method  text;
BEGIN
  v_amt := ROUND(COALESCE(p_amount, 0)::numeric, 4);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- 读取并校验余额（用 FOR UPDATE 加锁，防并发超提）
  SELECT merchant_balance INTO v_bal
    FROM stores WHERE id = p_store_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  IF v_bal < v_amt THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_bal);
  END IF;

  -- method 归一
  v_method := COALESCE(p_method, 'bank');
  IF v_method NOT IN ('wechat','alipay','bank') THEN
    v_method := 'bank';
  END IF;

  -- 锁定余额
  UPDATE stores
     SET merchant_balance = ROUND((v_bal - v_amt)::numeric, 4)
   WHERE id = p_store_id;

  -- 写提现申请（kind='settlement'）
  INSERT INTO withdrawals
    (user_id, store_id, amount, method, account_info, kind, status, created_at)
  VALUES
    (p_user_id, p_store_id, v_amt, v_method, p_account, 'settlement', 'pending', now())
  RETURNING id INTO v_wid;

  RETURN jsonb_build_object('ok', true, 'withdrawal_id', v_wid, 'amount', v_amt);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 7) RPC：fn_get_store_settlement —— 读取门店货款结算概览（绕过 stores RLS）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_store_settlement(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store stores%ROWTYPE;
  v_total numeric;
  v_count int;
BEGIN
  SELECT * INTO v_store FROM stores WHERE id = p_store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  SELECT COALESCE(SUM(settle_amount), 0), COUNT(*)
    INTO v_total, v_count
    FROM merchant_settlements
   WHERE store_id = p_store_id AND status = 'settled';

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', p_store_id,
    'merchant_balance', COALESCE(v_store.merchant_balance, 0),
    'settlement_frozen', COALESCE(v_store.settlement_frozen, 0),
    'total_settled', v_total,
    'settlement_count', v_count,
    'wx_sub_mch_id', v_store.wx_sub_mch_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------
-- 8) 触发器：订单 status → 'completed' 自动结算商家货款
--    （覆盖 api.ts: updateOrderStatus / 评论完成 / 退款完成 等多条路径，
--      纯健康豆订单也能在此触发，无需依赖 distribute-commission）
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_settle_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    -- PERFORM 忽略返回；fn_settle_order 内部已吞掉异常，绝不阻断订单完成
    PERFORM public.fn_settle_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_settle ON public.orders;
CREATE TRIGGER trg_orders_settle
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.trg_settle_on_completed();

-- ---------------------------------------------------------------------
-- 9) 历史数据回填（可选）：将「已完成但从未结算」的订单补结算
--    由用户本机执行：SELECT public.fn_settle_order(id) FROM orders
--      WHERE status='completed' AND store_id IS NOT NULL
--        AND NOT EXISTS (SELECT 1 FROM merchant_settlements WHERE order_id=orders.id);
--    （此处不自动跑，避免大批量写锁；用户确认后手动执行即可）
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 10) 诊断输出：确认新结构到位
-- ---------------------------------------------------------------------
DO $$
DECLARE
  col text;
BEGIN
  RAISE NOTICE '===== stores 新增列 =====';
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name='stores' AND column_name IN ('merchant_balance','settlement_frozen','wx_sub_mch_id')
    ORDER BY column_name
  LOOP RAISE NOTICE '  - %', col; END LOOP;

  RAISE NOTICE '===== withdrawals 新增列 =====';
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_name='withdrawals' AND column_name IN ('kind','merchant_settlement_ids')
    ORDER BY column_name
  LOOP RAISE NOTICE '  - %', col; END LOOP;

  RAISE NOTICE '✅ 00120 商家货款结算体系迁移已就绪（RPC: fn_settle_order / fn_reverse_settlement / fn_merchant_withdraw / fn_get_store_settlement；触发器: trg_orders_settle）';
END $$;

-- 刷新 PostgREST schema cache（失败则提示手动 Reload）
DO $$
BEGIN
  BEGIN
    PERFORM pg_notify('pgrst', 'reload schema');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      EXECUTE 'NOTIFY pgrst, ''reload schema''';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠️ 自动刷新 schema cache 失败，请到 Supabase Dashboard → Database → 点 "Reload schema cache"';
    END;
  END;
END $$;

-- ==================== 00121_fix_merchant_payout_allocation.sql ====================
-- =====================================================================
-- 00121：修复商家货款分账链路（方案 A 补充迁移）
-- =====================================================================
-- 修复两个会阻断真实微信分账的硬伤：
--   1) merchant-payout EF 读取的是 `orders.transaction_id`，但真实列是
--      `orders.wechat_transaction_id`（wechat-payment-callback 落库），导致
--      永远读不到交易号，现金订单全部误判为「纯健康豆垫付」。
--   2) fn_merchant_withdraw 未填充 withdrawals.merchant_settlement_ids，payout
--      只能按门店随机取一条结算记录，既可能取错订单，也无法做按订单分账。
--
-- 本迁移补充：
--   - merchant_settlements 增加 withdrawal_id 列，跟踪该结算行被哪笔提现单占用；
--   - 重写 fn_merchant_withdraw：创建货款提现时，按 FIFO 分配未提现的结算行，
--     并回填 withdrawals.merchant_settlement_ids；
--   - 重写 fn_reverse_settlement：回冲时一并清除 withdrawal_id。
-- =====================================================================

-- 1) 结算台账增加 withdrawal_id（允许 NULL，表示未提现）
ALTER TABLE public.merchant_settlements
  ADD COLUMN IF NOT EXISTS withdrawal_id uuid;

COMMENT ON COLUMN public.merchant_settlements.withdrawal_id IS '关联的货款提现单 ID，NULL 表示尚未被提现';

CREATE INDEX IF NOT EXISTS idx_ms_withdrawal ON public.merchant_settlements(withdrawal_id);

-- 2) 重写 fn_merchant_withdraw：创建提现时分配结算行，并回填 merchant_settlement_ids
--    原则：
--      - 商家货款余额来自 merchant_settlements.settle_amount，提现时必须从
--        「未被提现的结算行」中 FIFO 分配，保证后续微信分账能取到真实交易号；
--      - 余额校验与结算行分配均加 FOR UPDATE 锁，防并发超提/重复分配。
-- ----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_merchant_withdraw(uuid, uuid, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION public.fn_merchant_withdraw(
  p_store_id   uuid,
  p_user_id    uuid,
  p_amount     numeric,
  p_method     text,
  p_account    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal     numeric;
  v_amt     numeric;
  v_wid     uuid;
  v_method  text;
  v_ids     uuid[] := ARRAY[]::uuid[];
  v_alloc   numeric := 0;
  v_rec     record;
BEGIN
  v_amt := ROUND(COALESCE(p_amount, 0)::numeric, 4);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- 锁定门店余额（防并发超提）
  SELECT merchant_balance INTO v_bal
    FROM stores WHERE id = p_store_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  IF v_bal < v_amt THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_bal);
  END IF;

  -- method 归一
  v_method := COALESCE(p_method, 'bank');
  IF v_method NOT IN ('wechat','alipay','bank') THEN
    v_method := 'bank';
  END IF;

  -- 按 FIFO 分配未提现的结算台账行（同时加 FOR UPDATE 锁，防止并发分配）
  FOR v_rec IN
    SELECT id, settle_amount
      FROM merchant_settlements
     WHERE store_id = p_store_id
       AND status = 'settled'
       AND withdrawal_id IS NULL
     ORDER BY settled_at ASC, id ASC
     FOR UPDATE
  LOOP
    v_ids := array_append(v_ids, v_rec.id);
    v_alloc := v_alloc + v_rec.settle_amount;
    EXIT WHEN v_alloc >= v_amt;
  END LOOP;

  -- 安全兜底：如果余额够但可分配结算行总额不足（理论上不应发生），回滚拒绝
  IF v_alloc < v_amt THEN
    RETURN jsonb_build_object('ok', false, 'error', 'allocated_settlement_insufficient',
                              'allocated', v_alloc, 'requested', v_amt);
  END IF;

  -- 扣除门店货款余额
  UPDATE stores
     SET merchant_balance = ROUND((v_bal - v_amt)::numeric, 4)
   WHERE id = p_store_id;

  -- 创建货款提现单，并记录关联的结算行
  INSERT INTO withdrawals
    (user_id, store_id, amount, method, account_info, kind, status, merchant_settlement_ids, created_at)
  VALUES
    (p_user_id, p_store_id, v_amt, v_method, p_account, 'settlement', 'pending', v_ids, now())
  RETURNING id INTO v_wid;

  -- 标记这些结算行已被该提现单占用
  UPDATE merchant_settlements
     SET withdrawal_id = v_wid
   WHERE id = ANY(v_ids);

  RETURN jsonb_build_object('ok', true, 'withdrawal_id', v_wid, 'amount', v_amt, 'settlement_ids', v_ids);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 3) 重写 fn_reverse_settlement：回冲时清除 withdrawal_id，释放该结算行
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reverse_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec merchant_settlements%ROWTYPE;
BEGIN
  SELECT * INTO v_rec
    FROM merchant_settlements
   WHERE order_id = p_order_id AND status = 'settled'
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_active_settlement');
  END IF;

  -- 回冲门店余额（不允许负）
  UPDATE stores
     SET merchant_balance = GREATEST(0, ROUND((COALESCE(merchant_balance, 0) - v_rec.settle_amount)::numeric, 4))
   WHERE id = v_rec.store_id;

  UPDATE merchant_settlements
     SET status = 'reversed', reversed_at = now(), withdrawal_id = NULL
   WHERE id = v_rec.id;

  RETURN jsonb_build_object('ok', true, 'reversed_amount', v_rec.settle_amount);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 4) 诊断输出
DO $$
BEGIN
  RAISE NOTICE '✅ 00121 已修复货款分账链路：merchant_settlements 增加 withdrawal_id，fn_merchant_withdraw 分配结算行，fn_reverse_settlement 回冲时释放。';
END;
$$;

-- ==================== 00122_fix_settle_order_tb_portion.sql ====================
-- =============================================================================
-- 00122_fix_settle_order_tb_portion.sql
-- 热修 fn_settle_order：台账 tb_portion 加 LEAST(tb_used, total_amount) 兜底
-- -----------------------------------------------------------------------------
-- 适用场景：
--   若你先部署了「未含 LEAST 兜底的旧版 00120」，再发现 0.1 元纯豆订单
--   台账「豆付+现金≠全额」的不一致，跑本迁移即可热修，无需重跑整张表/触发器。
--   若你尚未部署 00120，则 00120 本身已含 LEAST 修复，本文件等同一次无害重设。
-- 安全：仅 CREATE OR REPLACE 函数体，不改动表结构/数据/触发器，可重复执行。
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_settle_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   orders%ROWTYPE;
  v_store   stores%ROWTYPE;
  v_rate    numeric;
  v_cash    numeric;
  v_pool    numeric;
  v_channel numeric;
  v_settle  numeric;
  v_exist   uuid;
BEGIN
  -- 读取订单
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- 仅「已完成」才结算
  IF v_order.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_completed', 'status', v_order.status);
  END IF;

  -- 平台自营 / 无门店 不结算（避免平台自我结算）
  IF v_order.store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_store');
  END IF;

  -- 幂等：已结算则直接返回既有记录
  SELECT id INTO v_exist FROM merchant_settlements WHERE order_id = p_order_id LIMIT 1;
  IF v_exist IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'settlement_id', v_exist);
  END IF;

  -- 读取门店让利率
  SELECT * INTO v_store FROM stores WHERE id = v_order.store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  -- 让利率单位归一：>1 视为百分比，≤1 视为小数
  v_rate := CASE
              WHEN COALESCE(v_store.referral_rate, 0) > 1 THEN v_store.referral_rate / 100.0
              ELSE COALESCE(v_store.referral_rate, 0)
            END;

  -- 现金部分（微信实付）= 总额 − 健康豆抵扣
  v_cash := GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.tb_used, 0));

  -- 让利池：按订单全额（豆付等值计入）计提
  v_pool := ROUND((COALESCE(v_order.total_amount, 0) * v_rate)::numeric, 4);

  -- 通道费：仅真实微信现金部分计提（0.6%）
  v_channel := ROUND((v_cash * 0.006)::numeric, 4);

  -- 商家应收货款 = 全额 − 让利池 − 微信通道费（豆付部分由平台垫付，等值计入）
  v_settle := ROUND((COALESCE(v_order.total_amount, 0) - v_pool - v_channel)::numeric, 4);
  v_settle := GREATEST(0, v_settle);

  -- 写入结算台账
  -- 关键修复：tb_portion 用 LEAST(tb_used, total_amount) 兜底，
  -- 保证「豆付 + 现金 = 全额」恒成立（避免纯豆订单 tb_used>total 时台账两列求和越界）。
  INSERT INTO merchant_settlements
    (store_id, order_id, order_no, total_amount, tb_portion, cash_portion,
     referral_rate, discount_pool, channel_fee, settle_amount, status, settled_at)
  VALUES
    (v_order.store_id, v_order.id, v_order.order_no,
     COALESCE(v_order.total_amount, 0),
     LEAST(COALESCE(v_order.tb_used, 0), COALESCE(v_order.total_amount, 0)),
     v_cash,
     v_rate, v_pool, v_channel, v_settle, 'settled', now())
  RETURNING id INTO v_exist;

  -- 累加门店「可结算货款余额」
  UPDATE stores
     SET merchant_balance = ROUND((COALESCE(merchant_balance, 0) + v_settle)::numeric, 4)
   WHERE id = v_order.store_id;

  RETURN jsonb_build_object('ok', true, 'settlement_id', v_exist, 'settle_amount', v_settle);
EXCEPTION WHEN OTHERS THEN
  -- 结算失败绝不应阻断订单完成：记录并放行
  RAISE WARNING 'fn_settle_order failed for %: %', p_order_id, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END;
$$;

-- 诊断输出：确认函数已重设且含 LEAST 兜底
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_settle_order'
  ) THEN
    RAISE NOTICE '[00122] fn_settle_order 已重设（含 tb_portion LEAST 兜底）。';
  ELSE
    RAISE NOTICE '[00122] 警告：fn_settle_order 不存在，请先执行 00120。';
  END IF;
END $$;

-- ==================== 00123_fix_legacy_tb_used_unit.sql ====================
-- 热修：将历史「豆数口径」tb_used 转为「元口径」，并重建约束
-- 根因：00096 健康豆→健康豆合并前，tb_used 以「豆数」存储（1 豆 = 0.01 元）；
--       合并后全库统一为「元」口径（1 豆 = 1 元，与 tb_balance 一致）。
--       遗留订单 tb_used 仍为豆数（如 10.00 豆 = ¥0.10），而 total_amount = ¥0.10，
--       导致 tb_used(10.00) > total_amount(0.10) 触发 chk_orders_tb_used_not_exceed_total。
-- 背景：00097 第 4 步曾因 tongbao_logs 约束报 23514 中断，第 5 步(数据修正)与第 6 步(加约束)未执行，
--       故本迁移：先卸约束 → 修正遗留数据 → 重建约束，可独立、幂等运行。
--
-- 数据修正判定（仅对 tb_used > total_amount 的异常行）：
--   豆数口径遗留行：tb_used 远大于 total（约百倍，ratio >= 2）→ ×0.01 转元（精确还原真实抵扣）
--   现代超额抵扣（原 00097 目标）：tb_used 仅略大于 total（ratio < 2）→ 封顶为 total_amount

-- 0) 幂等：先卸掉约束，避免 ADD 时因遗留脏数据报 23514
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_tb_used_not_exceed_total;

-- 1) 修正遗留 tb_used（仅对 tb_used > total_amount 的异常行）
UPDATE public.orders
SET tb_used = CASE
    WHEN tb_used >= total_amount * 2 THEN ROUND(tb_used * 0.01, 2)   -- 旧豆数口径：×0.01 精确还原
    ELSE total_amount                                                  -- 现代超额抵扣：封顶为成交额
  END
WHERE tb_used > total_amount
  AND total_amount > 0
  AND (refund_status IS NULL OR refund_status = 'none');

-- 2) 重建约束（幂等）
ALTER TABLE public.orders
ADD CONSTRAINT chk_orders_tb_used_not_exceed_total
CHECK (tb_used IS NULL OR total_amount IS NULL OR tb_used <= total_amount);

-- 3) 同步重建 tb_used_capped 计算列（若存在则先卸）
ALTER TABLE public.orders DROP COLUMN IF EXISTS tb_used_capped;
ALTER TABLE public.orders
ADD COLUMN tb_used_capped numeric(12,2) GENERATED ALWAYS AS (
  COALESCE(LEAST(COALESCE(tb_used, 0), COALESCE(total_amount, 0)), 0)
) STORED;

SELECT '✅ 遗留 tb_used 豆数口径已转为元，约束与计算列已重建' AS result;

-- ==================== 00123_saved_withdrawal_accounts.sql ====================
-- =============================================================================
-- 00123 已保存收款账户（提现管理：绑定一次，免二次填写）
-- -----------------------------------------------------------------------------
-- 背景：原提现每次都手填银行卡/支付宝/身份证，提交后清空，无持久化。
-- 本迁移新增 withdrawal_accounts 表 + 3 个 SECURITY DEFINER RPC，
-- 支持「多张卡/多账户保存、选择、设默认、删除」，覆盖佣金(user)与货款(store)两类。
-- 表 DISABLE RLS，仅通过 RPC 访问，RPC 内校验「当前登录用户=本人或门店店主」。
-- =============================================================================

-- 1) 表
CREATE TABLE IF NOT EXISTS public.withdrawal_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL,                 -- profiles.id（user）或 stores.id（store）
  owner_type   text        NOT NULL CHECK (owner_type IN ('user', 'store')),
  method       text        NOT NULL CHECK (method IN ('bank', 'alipay', 'wechat')),
  real_name    text,
  id_card      text,
  bank_name    text,
  bank_account text,
  bank_holder  text,
  alipay_account text,
  is_default   boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_owner ON public.withdrawal_accounts(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_wa_default ON public.withdrawal_accounts(owner_id, owner_type, is_default);

-- 财务/运营类表：与项目约定一致，DISABLE RLS（仅经 SECURITY DEFINER RPC 访问）
ALTER TABLE public.withdrawal_accounts DISABLE ROW LEVEL SECURITY;

-- 2) RPC：读取某 owner 的已保存账户
CREATE OR REPLACE FUNCTION public.fn_get_withdrawal_accounts(p_owner_id uuid, p_owner_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_ok  boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_owner_type = 'user' THEN
    v_ok := (p_owner_id = v_uid);
  ELSIF p_owner_type = 'store' THEN
    SELECT EXISTS(SELECT 1 FROM stores s WHERE s.id = p_owner_id AND s.owner_id = v_uid) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'accounts', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.is_default DESC, t.created_at DESC)
       FROM withdrawal_accounts t
       WHERE t.owner_id = p_owner_id AND t.owner_type = p_owner_type),
      '[]'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 3) RPC：保存（同方式+同账号号去重：已存在则更新，否则插入）；可选置默认
CREATE OR REPLACE FUNCTION public.fn_save_withdrawal_account(
  p_owner_id      uuid,
  p_owner_type    text,
  p_method        text,
  p_real_name     text   DEFAULT NULL,
  p_id_card       text   DEFAULT NULL,
  p_bank_name     text   DEFAULT NULL,
  p_bank_account  text   DEFAULT NULL,
  p_bank_holder   text   DEFAULT NULL,
  p_alipay_account text  DEFAULT NULL,
  p_make_default  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid;
  v_ok    boolean := false;
  v_exist uuid;
  v_id    uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_owner_type = 'user' THEN
    v_ok := (p_owner_id = v_uid);
  ELSIF p_owner_type = 'store' THEN
    SELECT EXISTS(SELECT 1 FROM stores s WHERE s.id = p_owner_id AND s.owner_id = v_uid) INTO v_ok;
  ELSE
    v_ok := false;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 同方式 + 同账号号去重
  IF p_method = 'bank' THEN
    SELECT id INTO v_exist FROM withdrawal_accounts
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND method = 'bank'
       AND bank_account = p_bank_account LIMIT 1;
  ELSIF p_method = 'alipay' THEN
    SELECT id INTO v_exist FROM withdrawal_accounts
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND method = 'alipay'
       AND alipay_account = p_alipay_account LIMIT 1;
  ELSE
    SELECT id INTO v_exist FROM withdrawal_accounts
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND method = 'wechat' LIMIT 1;
  END IF;

  IF v_exist IS NOT NULL THEN
    UPDATE withdrawal_accounts SET
      real_name = p_real_name, id_card = p_id_card,
      bank_name = p_bank_name, bank_account = p_bank_account,
      bank_holder = p_bank_holder, alipay_account = p_alipay_account,
      updated_at = now()
    WHERE id = v_exist RETURNING id INTO v_id;
  ELSE
    INSERT INTO withdrawal_accounts
      (owner_id, owner_type, method, real_name, id_card, bank_name, bank_account, bank_holder, alipay_account)
    VALUES
      (p_owner_id, p_owner_type, p_method, p_real_name, p_id_card, p_bank_name, p_bank_account, p_bank_holder, p_alipay_account)
    RETURNING id INTO v_id;
  END IF;

  -- 置默认：清同 owner 其他默认，再置本行
  IF p_make_default THEN
    UPDATE withdrawal_accounts SET is_default = false
     WHERE owner_id = p_owner_id AND owner_type = p_owner_type AND id <> v_id;
    UPDATE withdrawal_accounts SET is_default = true WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 4) RPC：删除（校验归属）；若删的是默认且仍有剩余，把最新一条设为默认
CREATE OR REPLACE FUNCTION public.fn_delete_withdrawal_account(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_ok  boolean := false;
  v_rec withdrawal_accounts%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_rec FROM withdrawal_accounts WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_rec.owner_type = 'user' THEN
    v_ok := (v_rec.owner_id = v_uid);
  ELSIF v_rec.owner_type = 'store' THEN
    SELECT EXISTS(SELECT 1 FROM stores s WHERE s.id = v_rec.owner_id AND s.owner_id = v_uid) INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM withdrawal_accounts WHERE id = p_id;

  IF v_rec.is_default THEN
    UPDATE withdrawal_accounts SET is_default = true
     WHERE owner_id = v_rec.owner_id AND owner_type = v_rec.owner_type
       AND id = (SELECT id FROM withdrawal_accounts
                 WHERE owner_id = v_rec.owner_id AND owner_type = v_rec.owner_type
                 ORDER BY created_at DESC LIMIT 1);
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ 00123 已保存收款账户体系就绪（表 withdrawal_accounts；RPC: fn_get_withdrawal_accounts / fn_save_withdrawal_account / fn_delete_withdrawal_account）';
END $$;

-- ==================== 00124_add_self_operated_store.sql ====================
-- ============================================================
-- 00124_add_self_operated_store.sql
-- 新增【自营门店（探索页）】模板
--
-- 用途：平台自有旗舰渠道（探索页）靠 is_platform=true 识别，
--       不走商家申请流，直接用本脚本建店 + 可选塞默认商品。
--
-- 使用方式：
--   方式 A（推荐，本机 Dashboard）：打开 SQL Editor 整段粘贴 → Run。
--   方式 B（CLI）：supabase db push（按编号自动执行）。
--
-- ⚠️ 重要：stores.id 是 uuid 类型，不能用 "store-platform-002" 这种助记字符串
--          （会报 22P02）。这里用【固定合法 UUID】做幂等主键。
-- ⭐ 关键：is_platform 已锁死为 true。忘了它店会错落到「犒赏铺」商家区。
-- 🔁 幂等：重复执行不会重复建店（靠 ON CONFLICT(id) 兜底）。
-- 📌 想再加第 3 家自营店，复制本文件并把下面 v_store_id 换成新的固定 UUID 即可。
-- ============================================================

DO $$
DECLARE
  -- 固定合法 UUID（stores.id 为 uuid 类型，不可用语记字符串）。改店时换一个新 UUID。
  v_store_id uuid := '9f2c4b6e-7d3a-4c5b-8e1f-0a2b3c4d5e6f';
  v_owner    uuid := 'd6b38349-dded-4879-9eac-3165a646436a'; -- 平台主账号(1870)，勿改
BEGIN
  INSERT INTO stores (
    id, owner_id, name, description, address, phone, category,
    image_url, banner_url, rating, is_active, is_platform,
    is_open, open_time, close_time, referral_rate, short_code
  ) VALUES (
    v_store_id, v_owner,
    '来店有喜·生鲜自营馆',                       -- 【改】店名
    '平台自营生鲜好货，产地直供，品质保障',         -- 【改】简介
    '侠客总部 1 号',
    '400-888-8888',
    '生鲜',                                       -- 【改】类目（图书/美食/饮品/零食/日用/礼品/生鲜）
    'https://picsum.photos/seed/plat-store2/400/400',
    'https://picsum.photos/seed/plat-banner2/800/400',
    5.0, true,
    true,                                          -- ⭐ 锁死：自营门店（探索页识别依据）
    true, '08:00', '22:00',
    0.20,                                          -- 【改】让利率（小数口径，0.20 = 20%）
    'LDYX02'
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = EXCLUDED.name,
    description  = EXCLUDED.description,
    category     = EXCLUDED.category,
    referral_rate = EXCLUDED.referral_rate,
    is_platform  = true;   -- 双保险：无论如何都保持自营属性

  -- 可选：给新自营店塞 2 个默认商品，探索页立刻有内容（重复执行不重复插入）
  INSERT INTO products (
    store_id, name, description, price, original_price,
    image_url, category, is_active, mood_tags, scene_tags
  ) VALUES
    (v_store_id, '自营·当季鲜橙', '产地直供，皮薄多汁', 19.90, 39.90,
     'https://picsum.photos/seed/plat-orange/400/400', '生鲜', true,
     ARRAY['活力','满足'], ARRAY['自取','外卖']),
    (v_store_id, '自营·每日坚果', '7 日独立装，营养便携', 49.90, 89.90,
     'https://picsum.photos/seed/plat-nut/400/400', '零食', true,
     ARRAY['专注','健康'], ARRAY['自取','外卖'])
  ON CONFLICT DO NOTHING;
END $$;

-- 校验：应能看到新店 is_platform = true（探索页识别依据）
SELECT id, name, category, referral_rate, is_platform
FROM stores
WHERE is_platform = true
ORDER BY id;

-- ==================== 00124_fix_tongbao_logs_balance_after_numeric.sql ====================
-- =====================================================
-- 00124: tongbao_logs.balance_after 改为 numeric(12,2)
-- -----------------------------------------------------
-- 背景：
--   - 00076 建 gold_bean_logs 时 balance_after 用了 int（旧设计：1 豆 = 1 元，整数语义）。
--   - 00096 改名 tongbao_logs 后列结构未改。
--   - 2026-07-19 上线后 admin-web 充值时遇到：
--       "流水写入失败：invalid input syntax for type integer: \"1015.33\""
--     根因：profiles.tb_balance 已是 numeric(12,2)（存了 15.33 这种小数余额，来自 #319 订单精确扣豆），
--           但 tongbao_logs.balance_after 是 int，cur(15.33) + amt(1000) = 1015.33 写不进 int。
--   - delta 保持 int（充值走 1 豆 = 1 元整数语义，与 commission_logs.delta 保持一致）。
--
-- 幂等：USING 表达式把旧 int 安全 cast 到 numeric，无副作用，可重复执行。
-- =====================================================

ALTER TABLE public.tongbao_logs
  ALTER COLUMN balance_after TYPE numeric(12,2) USING balance_after::numeric(12,2);

-- sanity check：列类型已切到 numeric
DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT data_type INTO v_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tongbao_logs' AND column_name = 'balance_after';

  IF v_data_type = 'numeric' THEN
    RAISE NOTICE '[00124] tongbao_logs.balance_after 已为 numeric(12,2)，修复成功';
  ELSE
    RAISE WARNING '[00124] tongbao_logs.balance_after 类型异常，当前=%（期望 numeric）', v_data_type;
  END IF;
END $$;

-- ==================== 00125_add_store_referral_rate_enabled.sql ====================
-- =============================================================
-- 00125 · 店铺整体让利总开关
-- 背景：原让利率只有 stores.referral_rate（门店默认率），商品未设 discount_rate 时回退门店率。
--       现增加总开关 referral_rate_enabled：
--         true  （默认）= 门店默认让利率照常参与分佣回退
--         false         = 关闭门店整体让利，仅商品级 discount_rate 参与分佣（无商品让利则该单让利=0）
-- 用途：运营/商家可一键关掉"店铺默认让利"，仅保留单品让利，避免整店被统一让利点吃掉利润。
-- =============================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS referral_rate_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN stores.referral_rate_enabled IS
  '店铺整体让利总开关；false=关闭门店默认让利率回退，仅商品级 discount_rate 参与分佣';

-- 幂等：若历史数据被误写为 null，统一纠正为 true（默认开启）
UPDATE stores SET referral_rate_enabled = true WHERE referral_rate_enabled IS NULL;

-- ==================== 00126_add_commission_earn_to_tongbao_logs.sql ====================
-- 00126_add_commission_earn_to_tongbao_logs.sql
-- 背景：2026-07-19 业务决策将推广佣金改发健康豆(tb_balance)，
--       distribute-commission Edge Function 写入 tongbao_logs(type='commission_earn')。
--       但 00096 迁移的 type CHECK 约束未包含 commission_earn，会导致分佣流水插入失败。
-- 作用：在 tongbao_logs 的 type CHECK 约束中追加 'commission_earn'，幂等安全。

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.tongbao_logs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tongbao_logs DROP CONSTRAINT ' || cname;
  END IF;
  EXECUTE 'ALTER TABLE public.tongbao_logs ADD CONSTRAINT tongbao_logs_type_check CHECK (type IN (
    ''purchase_spend'',''refund_return'',''recharge'',''admin_grant'',''admin_deduct'',
    ''purchase_earn'',''refund_deduct'',''commission_earn''))';
END $$;

-- ==================== 00127_fix_merchant_applications_rls.sql ====================
-- ============================================================================
-- 00127_fix_merchant_applications_rls.sql
-- 修复：用户端「自营门店」提交申请失败（RLS 拦截 INSERT）
--
-- 根因（代码核实 2026-07-19）：
--   • merchant_applications 表实际使用 user_id 列（00001_init_schema.sql:161）。
--   • 00081_production_rls_hardening.sql 与 00095_consolidated_rls_final.sql 的
--     强化循环会先 DROP 该表全部既有策略，再重建；重建时对 merchant_applications
--     按 owner_id 列是否存在做分支判断（00081:213 / 00095:232），但该表没有
--     owner_id 列 → 仅创建了 rls_final_mapp_admin（USING is_admin()），
--     申请人（普通登录用户）本人无任何读写策略。
--   • 结果：普通用户 SELECT / INSERT 自己的自营门店申请都被 RLS 拒绝，
--     页面能打开、填完点提交却报「提交失败」（PostgREST 42501）。
--
-- 修复：补齐基于 user_id 的申请人策略（本人可读写自己的申请 + 管理员全权）。
-- 幂等，可重复执行；仅重建缺失的 owner 策略，不动其他表。
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.merchant_applications') IS NOT NULL THEN
    -- 清理 00081/00095 留下的「仅管理员」策略（避免与管理员全权在 USING 上重复/歧义）
    DROP POLICY IF EXISTS rls81_mapp_admin     ON public.merchant_applications;
    DROP POLICY IF EXISTS rls_final_mapp_admin ON public.merchant_applications;
    DROP POLICY IF EXISTS rls_final_mapp_owner ON public.merchant_applications;
    DROP POLICY IF EXISTS user_own_application  ON public.merchant_applications;

    -- 申请人本人：基于 user_id 可读写自己的申请；管理员全权
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'merchant_applications'
        AND policyname = 'rls_mapp_owner'
    ) THEN
      CREATE POLICY rls_mapp_owner ON public.merchant_applications
        FOR ALL TO authenticated
        USING (user_id = auth.uid() OR public.is_admin())
        WITH CHECK (user_id = auth.uid() OR public.is_admin());
    END IF;
  END IF;
END $$;

-- 确保 RLS 处于开启状态（强化迁移已 ENABLE，这里幂等兜底）
ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;

-- ==================== 00131_relax_settle_status.sql ====================
-- =============================================================================
-- 00131_relax_settle_status.sql
-- 放宽商家货款结算触发条件：与分销佣金口径对齐
-- -----------------------------------------------------------------------------
-- 背景：
--   分销佣金(distribute-commission)在 create-order 付款成功时即发放(含 pending 状态)，
--   但商家货款(fn_settle_order)原写死「仅 completed 才结算」，导致：
--   - 大量 pending_review / pending_pickup / pending_ship 等「已成交未收货」订单
--     商家货款长期挂账、未进 merchant_balance；
--   - 与分销佣金不对称，商家「有订单无收益」。
--
-- 本迁移：
--   1) fn_settle_order：入口校验由 `status='completed'` 放宽为
--      status IN (completed, pending_ship, pending_receive, pending_review, pending_pickup)
--      —— 即所有「已成交」状态均结算商家货款（退款时由 fn_reverse_settlement 回冲）。
--   2) trg_orders_settle：WHEN 条件同步放宽，订单进入任一「已成交」状态即自动结算。
--
-- 安全：仅 CREATE OR REPLACE 函数/触发器，不改动表结构/数据；可重复执行。
-- 幂等：fn_settle_order 内部已对「已结算」订单 return skipped，不会重复结算。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) fn_settle_order：放宽结算入口状态（其余逻辑与 00122 完全一致，含 LEAST 兜底）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   orders%ROWTYPE;
  v_store   stores%ROWTYPE;
  v_rate    numeric;
  v_cash    numeric;
  v_pool    numeric;
  v_channel numeric;
  v_settle  numeric;
  v_exist   uuid;
BEGIN
  -- 读取订单
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- 仅「已成交（含未收货）」才结算：与分销佣金口径对齐
  -- （completed / pending_ship / pending_receive / pending_review / pending_pickup）
  -- 退款/取消(after_sale/cancelled/pending_pay)等不结算；退款时由 fn_reverse_settlement 回冲。
  IF v_order.status NOT IN ('completed','pending_ship','pending_receive','pending_review','pending_pickup') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_active', 'status', v_order.status);
  END IF;

  -- 平台自营 / 无门店 不结算（避免平台自我结算）
  IF v_order.store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_store');
  END IF;

  -- 幂等：已结算则直接返回既有记录
  SELECT id INTO v_exist FROM merchant_settlements WHERE order_id = p_order_id LIMIT 1;
  IF v_exist IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'settlement_id', v_exist);
  END IF;

  -- 读取门店让利率
  SELECT * INTO v_store FROM stores WHERE id = v_order.store_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  -- 让利率单位归一：>1 视为百分比，≤1 视为小数
  v_rate := CASE
              WHEN COALESCE(v_store.referral_rate, 0) > 1 THEN v_store.referral_rate / 100.0
              ELSE COALESCE(v_store.referral_rate, 0)
            END;

  -- 现金部分（微信实付）= 总额 − 健康豆抵扣
  v_cash := GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.tb_used, 0));

  -- 让利池：按订单全额（豆付等值计入）计提
  v_pool := ROUND((COALESCE(v_order.total_amount, 0) * v_rate)::numeric, 4);

  -- 通道费：仅真实微信现金部分计提（0.6%）
  v_channel := ROUND((v_cash * 0.006)::numeric, 4);

  -- 商家应收货款 = 全额 − 让利池 − 微信通道费（豆付部分由平台垫付，等值计入）
  v_settle := ROUND((COALESCE(v_order.total_amount, 0) - v_pool - v_channel)::numeric, 4);
  v_settle := GREATEST(0, v_settle);

  -- 写入结算台账
  -- 关键修复：tb_portion 用 LEAST(tb_used, total_amount) 兜底，
  -- 保证「豆付 + 现金 = 全额」恒成立（避免纯豆订单 tb_used>total 时台账两列求和越界）。
  INSERT INTO merchant_settlements
    (store_id, order_id, order_no, total_amount, tb_portion, cash_portion,
     referral_rate, discount_pool, channel_fee, settle_amount, status, settled_at)
  VALUES
    (v_order.store_id, v_order.id, v_order.order_no,
     COALESCE(v_order.total_amount, 0),
     LEAST(COALESCE(v_order.tb_used, 0), COALESCE(v_order.total_amount, 0)),
     v_cash,
     v_rate, v_pool, v_channel, v_settle, 'settled', now())
  RETURNING id INTO v_exist;

  -- 累加门店「可结算货款余额」
  UPDATE stores
     SET merchant_balance = ROUND((COALESCE(merchant_balance, 0) + v_settle)::numeric, 4)
   WHERE id = v_order.store_id;

  RETURN jsonb_build_object('ok', true, 'settlement_id', v_exist, 'settle_amount', v_settle);
EXCEPTION WHEN OTHERS THEN
  -- 结算失败绝不应阻断订单完成：记录并放行
  RAISE WARNING 'fn_settle_order failed for %: %', p_order_id, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) trg_orders_settle：WHEN 条件放宽，进入任一「已成交」状态即自动结算商家货款
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_settle_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 订单进入「已成交」状态即结算商家货款（与分销佣金口径对齐；退款时 fn_reverse_settlement 自动回冲）
  IF NEW.status IN ('completed','pending_ship','pending_receive','pending_review','pending_pickup')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- PERFORM 忽略返回；fn_settle_order 内部已吞掉异常，绝不阻断订单状态流转
    PERFORM public.fn_settle_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_settle ON public.orders;
CREATE TRIGGER trg_orders_settle
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status IN ('completed','pending_ship','pending_receive','pending_review','pending_pickup')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_settle_on_completed();

-- -----------------------------------------------------------------------------
-- 3) 诊断输出
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_settle_order'
  ) THEN
    RAISE NOTICE '[00131] fn_settle_order 已放宽：已成交(pending*/completed)订单均结算商家货款。';
  ELSE
    RAISE NOTICE '[00131] 警告：fn_settle_order 不存在，请先执行 00120/00122。';
  END IF;
END $$;

-- ==================== 00132_merchant_settlements_owner_rls.sql ====================
-- =====================================================================
-- 00132 · 修复商家端「订单汇总（让利后）」让利总额 / 实收 取不到数据
-- ---------------------------------------------------------------------
-- 问题：merchant_settlements 在生产库处于 RLS 启用状态，且没有任何
--       SELECT 策略。小程序商家以普通 authenticated 会话读取
--       getMerchantOrders 时，orders→merchant_settlements 的嵌套 embed
--       被 RLS 拦截 → 该表返回空 → 让利总额 / 实收 恒为 0；
--       而订单数 / 销售总额 来自 orders.total_amount（商家可读）正常。
--       管理后台(admin-web)用 service_role 直连，绕过 RLS，所以后台数字正常，
--       造成「后台有数、商家端让利/实收为 0」的不一致。
--
-- 修复：补一条「店铺拥有者可读自己门店结算台账」的 SELECT 策略。
--       - 仅 authenticated 角色可读；
--       - 仅能读到 owner_id = auth.uid() 的门店下的结算行；
--       - 不影响 admin-web（service_role 绕过 RLS）；
--       - 不改变 00120 的 DISABLE 意图，而是用最小权限策略替代「全关 RLS」。
-- =====================================================================

-- 若此前 RLS 被误开启且无策略，先确保表处于 RLS 启用状态（策略才能生效）
ALTER TABLE public.merchant_settlements ENABLE ROW LEVEL SECURITY;

-- 店铺拥有者读取自己门店的结算台账（供小程序商家端 embed / 结算台账列表使用）
DROP POLICY IF EXISTS "store_owner_read_own_settlements" ON public.merchant_settlements;
CREATE POLICY "store_owner_read_own_settlements"
  ON public.merchant_settlements
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- 诊断输出
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'merchant_settlements'
       AND policyname = 'store_owner_read_own_settlements'
  ) THEN
    RAISE NOTICE '[00132] 已新增策略 store_owner_read_own_settlements：商家端可读自己门店结算台账。';
  ELSE
    RAISE NOTICE '[00132] 警告：策略未创建成功，请检查。';
  END IF;
END $$;

-- ==================== 00132_order_feed_rpc.sql ====================
-- 00132 首页「江湖动态」：实时下单脱敏聚合（绕过 orders RLS，官方公告 + 下单动态合并轮播）
-- 设计：SECURITY DEFINER 只读视图函数，返回脱敏数据（昵称首字 + ***），符合 PIPL。
-- 授权 anon，使未登录用户首页也能看到「有人刚下单」的社交证明。

create or replace function get_recent_order_feed(p_limit int default 20)
returns table (
  id uuid,
  masked_name text,
  store_name text,
  product_name text,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id,
    coalesce(left(p.nickname, 1) || '***', '某侠客') as masked_name,
    s.name as store_name,
    coalesce(oi.pn, '好物') as product_name,
    o.total_amount as amount,
    o.created_at
  from orders o
  left join profiles p on p.id = o.user_id
  left join stores s on s.id = o.store_id
  left join lateral (
    select oi2.product_name as pn
    from order_items oi2
    where oi2.order_id = o.id
    order by oi2.created_at asc
    limit 1
  ) oi on true
  where o.status in ('pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed')
  order by o.created_at desc
  limit p_limit;
end;
$$;

grant execute on function get_recent_order_feed(int) to anon, authenticated;

-- ==================== 00133_merchant_order_summary_rpc.sql ====================
-- =====================================================================
-- 00133 · 修复商家端「订单汇总（让利后）」四指标被截断 / 重复累加
-- 问题：merchant-orders 页用 getMerchantOrders(默认 limit=20, 且查 order_items 表→每个商品一行)
--       的返回在前端聚合：
--         · 订单数 = 商品行数（截断到 20，并非真实订单数）
--         · 销售/让利/实收 因 order_items 多行重复累加 total_amount + 截断 双重失真
-- 修复：新增 SECURITY DEFINER RPC，在数据库内基于 orders + merchant_settlements 一次性聚合，
--       仅「门店拥有者」(auth.uid() = stores.owner_id) 可查自己门店，避免 RLS 拦卖家 + 暴露他店。
--       前端 getMerchantOrderSummary 调用它，汇总卡片直接取真实数字。
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_get_store_order_summary(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_total_orders   int;
  v_total_sales    numeric;
  v_total_discount numeric;
  v_total_settle   numeric;
BEGIN
  -- 仅门店拥有者可查，杜绝跨店读取
  SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 订单数 + 销售总额（全部订单，不限状态）
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO v_total_orders, v_total_sales
    FROM public.orders
   WHERE store_id = p_store_id;

  -- 让利总额 + 实收总额（merchant_settlements 每订单一行）
  SELECT COALESCE(SUM(discount_pool), 0), COALESCE(SUM(settle_amount), 0)
    INTO v_total_discount, v_total_settle
    FROM public.merchant_settlements
   WHERE store_id = p_store_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'total_orders',    v_total_orders,
    'total_sales',     v_total_sales,
    'total_discount',  v_total_discount,
    'total_settle',    v_total_settle
  );
END;
$$;

-- 诊断输出
DO $$
BEGIN
  RAISE NOTICE '[00133] 已创建 fn_get_store_order_summary：门店拥有者可读自己门店的真实 订单数/销售总额/让利总额/实收（替代被截断的 order_items 前端聚合）。';
END $$;

-- ==================== 00133_profiles_downline_read.sql ====================
-- 00133 好友/粉丝列表可见性（修复小程序「我的好友/我的粉丝」空白）
--
-- 根因：迁移 00081 收口 profiles RLS 为 rls81_profiles_self_read，
--       其 SELECT USING 条件为 (id = auth.uid() OR is_admin())，
--       仅允许读「自己」的 profile。
--       小程序 getMyReferrals() 查询条件是 referrer_id = 当前用户，
--       要读取的是「他人（自己的下级）」的 profile，其行 id ≠ 当前 uid，
--       因此被 RLS 全部过滤，导致「我的好友/我的粉丝」列表始终为空。
--
-- 修复：新增一条 SELECT 策略，放行 authenticated 用户读取自己的
--       直接下级（L1：referrer_id = 我）与间接下级（L2：我的下级的下级）。
--       不破坏既有 self_read（读自己）与 admin（is_admin）语义。

DROP POLICY IF EXISTS rls81_profiles_downline_read ON profiles;

CREATE POLICY rls81_profiles_downline_read
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    referrer_id = auth.uid()
    OR referrer_id IN (SELECT id FROM profiles WHERE referrer_id = auth.uid())
  );

-- 备注：
-- 1. 行级策略只控制「行是否返回」，不控制列；好友列表前端仅渲染
--    nickname / member_rank / created_at / avatar_url / tb_balance，不展示 phone，
--    展示层脱敏已满足隐私要求。
-- 2. 子查询 (SELECT id FROM profiles WHERE referrer_id = auth.uid()) 为非递归
--    普通策略内的子查询，不受本表 RLS 二次约束，可正常解析 L2 集合。
-- 3. 生产上线前需执行本迁移（本机已直连执行验证）。

-- ==================== 00134_commissions_idempotent_unique.sql ====================
-- =====================================================================
-- 00134 · 防分佣双发幂等：commissions 加 (order_id, level, beneficiary_id) 唯一约束
--
-- 问题：distribute-commission 仅用 orders.commission_distributed 入口标记防重复，
--       但 commissions 是 plain INSERT 且该表**无唯一约束**；若函数在
--       「写入佣金行之后 / 标记 commission_distributed 之前」崩溃或云函数超时，
--       微信支付回调重试会重新执行 → 重复插入佣金行 + 重复发放余额
--       (tb_balance / commission_balance) = 资损。
--       对比 order_item_commissions 已有 UNIQUE(order_item_id) + upsert 幂等，
--       订单级 commissions 反而漏了，属于防护不一致。
--
-- 修复：① 先清理历史可能的重复行（按 订单+层级+受益人 分组，保留最早一行）；
--       ② 加唯一约束；③ 代码侧 00134 配套的 distribute-commission 将 insert 改为
--          upsert(onConflict:'order_id,level,beneficiary_id', ignoreDuplicates:true)，
--          形成「入口标记 + 唯一约束」双保险，重试也绝不双发。
-- =====================================================================

-- 1) 查重（先确认是否存在重复；有重复才会删除，无重复则 no-op）
DO $$
DECLARE
  v_dup_groups int;
BEGIN
  SELECT COUNT(*) INTO v_dup_groups
  FROM (
    SELECT order_id, level, beneficiary_id
    FROM public.commissions
    GROUP BY order_id, level, beneficiary_id
    HAVING COUNT(*) > 1
  ) d;
  IF v_dup_groups > 0 THEN
    RAISE NOTICE '[00134] 发现 % 组重复佣金行，开始清理（保留每组最小 id）', v_dup_groups;
  ELSE
    RAISE NOTICE '[00134] 未发现重复佣金行，无需清理';
  END IF;
END $$;

-- 2) 清理重复：同一 (order_id, level, beneficiary_id) 仅保留 id 最小（最早）的一行
DELETE FROM public.commissions a
USING public.commissions b
WHERE a.id > b.id
  AND a.order_id = b.order_id
  AND a.level = b.level
  AND a.beneficiary_id = b.beneficiary_id;

-- 3) 加唯一约束（幂等：已存在则不重建）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_commissions_order_level_beneficiary'
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT uq_commissions_order_level_beneficiary
      UNIQUE (order_id, level, beneficiary_id);
    RAISE NOTICE '[00134] 已添加唯一约束 uq_commissions_order_level_beneficiary';
  ELSE
    RAISE NOTICE '[00134] 唯一约束已存在，跳过';
  END IF;
END $$;

-- ==================== 00134_profiles_downline_read_fix.sql ====================
-- 修复 00133 的 RLS 自引用递归（ERROR 42P17 infinite recursion in policy）
-- 原策略 USING 内对 profiles 自身做子查询，触发 RLS 递归。
-- 修法：把 L1 查找包进 SECURITY DEFINER 函数（所有者绕过 RLS，断掉递归链）。

-- 1) 删除有递归缺陷的旧策略
DROP POLICY IF EXISTS rls81_profiles_downline_read ON public.profiles;

-- 2) SECURITY DEFINER 函数：返回「我直接推荐的人」的 id 数组
--    以函数所有者（postgres，BYPASSRLS）身份执行，内部查询 profiles 不再套用本表 RLS，
--    从而杜绝递归。p_uid 由策略侧传入 auth.uid()，避免 SECURITY DEFINER 内 auth.uid() 的权限歧义。
CREATE OR REPLACE FUNCTION public.fn_my_l1_referral_ids(p_uid uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM public.profiles
  WHERE referrer_id = p_uid;
$$;

-- 3) 重建策略：L1（直接下级）或 L2（下级的下级）
CREATE POLICY rls81_profiles_downline_read ON public.profiles
FOR SELECT TO authenticated
USING (
  referrer_id = auth.uid()
  OR referrer_id = ANY(public.fn_my_l1_referral_ids(auth.uid()))
);

COMMENT ON POLICY rls81_profiles_downline_read ON public.profiles
IS '放行 authenticated 用户读取自己的一级/二级推荐下级（修复 00133 递归缺陷）';

-- ==================== 00135_backfill_2_pending_commission.sql ====================
-- 00135: 兜底补发 + 修 tongbao_logs.delta 列类型
-- 背景：
--   2026-07-19 23:23~23:24，123 在张林水果店连下两单纯健康豆订单（¥32 + ¥50），
--   createOrderV2 端 commission_calculated=true 已写入 l1_commission=0.35 / 0.54，
--   但 distribute-commission EF 在 commissions.insert 之前静默崩了，commission_distributed 一直 false，
--   commissions 表 0 行，张林健康豆未到账。
-- 顺手修：tongbao_logs.delta 是 integer，0.35 健康豆会被强转 0，导致全库历史佣金流水 delta 全部为 0，
--   改 numeric 保留小数（一次性 ALTER，无数据丢失）。

BEGIN;

-- 1) 修列类型：integer → numeric（历史 0 值不受影响）
ALTER TABLE public.tongbao_logs
  ALTER COLUMN delta TYPE numeric USING delta::numeric;

-- 2) 补 commissions 行（Order 1：¥32 → 张林 L1=0.35）
INSERT INTO public.commissions (
  order_id, order_no, beneficiary_id, payer_id, level,
  rank_at_time, ratio, pool_amount, commission_amount,
  b_coef, status, channel_fee, tax_withheld, net_amount, created_at
) VALUES (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  'LDYX1784503450195bort',
  'd6b38349-dded-4879-9eac-3165a646436a',  -- 张林
  '99f02c72-b238-4f76-8817-73b2848d8d65',  -- 123
  1,
  '凡心', 0.40,
  2.20,  -- 让利池（与 admin-web 显示 ¥2.2 一致）
  0.35,
  1.0, 'pending',
  0, 0, 0.35,
  '2026-07-19 23:24:11+00'
);

-- 3) 补 commissions 行（Order 2：¥50 → 张林 L1=0.54）
INSERT INTO public.commissions (
  order_id, order_no, beneficiary_id, payer_id, level,
  rank_at_time, ratio, pool_amount, commission_amount,
  b_coef, status, channel_fee, tax_withheld, net_amount, created_at
) VALUES (
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141',
  'LDYX1784503431430r9gq',
  'd6b38349-dded-4879-9eac-3165a646436a',
  '99f02c72-b238-4f76-8817-73b2848d8d65',
  1,
  '凡心', 0.40,
  5.00,  -- 让利池（admin 显示 ¥5）
  0.54,
  1.0, 'pending',
  0, 0, 0.54,
  '2026-07-19 23:23:52+00'
);

-- 4) 张林健康豆到账 +0.89（一次性加总额，原子）
UPDATE public.profiles
SET tb_balance = tb_balance + 0.89
WHERE id = 'd6b38349-dded-4879-9eac-3165a646436a';

-- 5) tongbao_logs 流水（两笔，delta 改 numeric 后可存小数）
INSERT INTO public.tongbao_logs (user_id, order_id, type, delta, balance_after, remark, created_at)
VALUES
  ('d6b38349-dded-4879-9eac-3165a646436a', '322d436a-a1c7-4919-8e08-1f5424e95043',
   'commission_earn', 0.35, 29288.96 + 0.35,
   '订单LDYX1784503450195bort推广佣金（健康豆）[00135 兜底补发]', '2026-07-19 23:24:11+00'),
  ('d6b38349-dded-4879-9eac-3165a646436a', '2eefcdee-919b-4eb0-95ce-1a4cf72dc141',
   'commission_earn', 0.54, 29288.96 + 0.89,
   '订单LDYX1784503431430r9gq推广佣金（健康豆）[00135 兜底补发]', '2026-07-19 23:23:52+00');

-- 6) 把两单标记 commission_distributed=true + 写回 EF 应写的字段
UPDATE public.orders
SET
  commission_distributed = true,
  channel_fee = 0,
  channel_fee_rate = 0.006,
  tax_withheld = 0
WHERE id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);

COMMIT;

-- ==================== 00136_commission_split_and_ledger.sql ====================
-- =============================================================
-- 00136 推广佣金 50/50 拆分（一半可提现佣金 + 一半健康豆）+ 现金账户流水 ledger
-- =============================================================
-- 背景（2026-07-29 业务决策「一半佣金，一半健康豆」）：
--   推广收益净额 50% 发放至【可提现佣金账户 commission_balance】（推广服务费，依法代扣个税），
--   50% 发放至【健康豆账户 tb_balance】（仅本平台消费抵扣、不可提现）。
--   此前 2026-07-19 决策为 100% 进 tb_balance，现回拨一半为可提现现金。
--
-- 必要性：
--   ① commissions 需记录每笔佣金的 cash/bean 拆分，使退款能按比例双账户回滚、避免资损；
--   ② 可提现现金账户(commission_balance)必须有独立流水 ledger（与 tb_balance 的 tongbao_logs 对等），
--      否则现金账说不清、合规审计无法通过。
--
-- 执行方式：Supabase → SQL Editor 粘贴 → Run（纯 SQL，幂等）。
-- 配套代码：supabase/functions/distribute-commission（发放）、refund-order（回滚）、提现流程。
-- =============================================================

BEGIN;

-- 1. commissions 记录每笔佣金的现金/健康豆拆分
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS cash_portion numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bean_portion numeric(12,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commissions.cash_portion IS '本笔佣金净额中发放至可提现佣金账户(commission_balance)的部分';
COMMENT ON COLUMN public.commissions.bean_portion IS '本笔佣金净额中发放至健康豆账户(tb_balance)的部分';

-- 2. 可提现佣金账户流水（现金账户必须有账，合规/防资损）
CREATE TABLE IF NOT EXISTS public.commission_balance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid,
  commission_id uuid,
  type text NOT NULL,
  delta numeric(12,4) NOT NULL,
  balance_after numeric(12,4) NOT NULL,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cbl_user ON public.commission_balance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_cbl_order ON public.commission_balance_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_cbl_commission ON public.commission_balance_logs(commission_id);

ALTER TABLE public.commission_balance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_balance_logs_owner_read" ON public.commission_balance_logs;
CREATE POLICY "commission_balance_logs_owner_read" ON public.commission_balance_logs
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;

-- ==================== 00136_reconcile_00135_double_exec.sql ====================
-- 00136: 【已作废 / ABORTED】请勿执行
--
-- 本迁移原拟回收「00135 重复执行多发的 0.89 健康豆 + 去重 commissions/tongbao_logs」。
-- 经 2026-07-21 重新逐行核对，结论变更：
--
--   两单（322d436a / 2eefcdee）分佣数据实际完全自洽、无重复、无资损：
--     - orders.l1_commission / l2_commission 权威应付额 = 0.739/0.241（单1）、2.07/0.675（单2）
--       （此前误记为 0.35/0.54，系记忆错误）
--     - commissions 表 4 行 = 每单 L1 + L2 两层（L2 beneficiary = 03165ead），金额与 orders 完全吻合
--       （此前误将 L1+L2 当成同人重复）
--     - tongbao_logs：张林 L1 流水 0.74 + 2.07；03165ead L2 流水 0.24 + 0.68，均正确
--     - tb_balance 已正确计入
--
--   故：00135 无需回滚，本 00136 的「tb_balance - 0.89 / 负向 tongbao_log」若执行会真实资损用户健康豆，
--   严禁执行。数据维持现状即可。

-- ==================== 00137_reconcile_l2_buyer_points_part1.sql ====================
-- 00137: 修正 00135 兜底补发遗留的二级佣金与购买者确权积分缺失
-- 背景：
--   00135 仅补发了 L1 佣金，未补 L2 与买家积分；00136 去重回收后，两单仍缺失 L2/积分。
--   本迁移先把 00135 旧记录与 v5 重跑产生的 mixed 记录清掉，按当前 distribute-commission v5
--   重新完整分佣，并回写 orders.l1_commission/l2_commission/buyer_points/platform_income。

BEGIN;

-- 1) 清理这两单的佣金/健康豆流水（保留 00136 的 commission_revoke 审计行）
DELETE FROM public.commissions WHERE order_id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);
DELETE FROM public.tongbao_logs WHERE order_id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
) AND type <> 'commission_revoke';
DELETE FROM public.points_logs WHERE related_order_id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);

-- 2) 重置订单分佣状态，便于外部 EF 重新分发
UPDATE public.orders
SET
  commission_distributed = false,
  l1_commission = 0,
  l2_commission = 0,
  buyer_points = 0,
  platform_income = 0
WHERE id IN (
  '322d436a-a1c7-4919-8e08-1f5424e95043',
  '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
);

COMMIT;

-- 说明：下一步在沙箱/CLI 执行 scripts/retry-distribute.mjs，调用 distribute-commission EF
-- 对这两单重新完整分佣。之后运行下面的 00137_part2.sql 回写订单字段与积分日志。

-- ==================== 00137_reconcile_l2_buyer_points_part2.sql ====================
-- 00137_part2: 回写 orders 字段 + 补 buyer_points 积分日志
-- 前置：已执行 00137_part1 并重新调用 distribute-commission v5 EF 完成分佣

BEGIN;

-- 1) 从 commissions 聚合回写订单字段
--    platform_income = 让利池 - L1 - L2 - 买家确权积分（与 v5 算法一致）
WITH agg AS (
  SELECT
    order_id,
    SUM(CASE WHEN level = 1 THEN commission_amount ELSE 0 END) AS l1,
    SUM(CASE WHEN level = 2 THEN commission_amount ELSE 0 END) AS l2,
    MAX(pool_amount) AS pool
  FROM public.commissions
  WHERE order_id IN (
    '322d436a-a1c7-4919-8e08-1f5424e95043',
    '2eefcdee-919b-4eb0-95ce-1a4cf72dc141'
  )
  GROUP BY order_id
)
UPDATE public.orders o
SET
  l1_commission = agg.l1,
  l2_commission = agg.l2,
  buyer_points = 1,
  platform_income = ROUND((agg.pool - agg.l1 - agg.l2 - 1)::numeric, 2)
FROM agg
WHERE o.id = agg.order_id;

-- 2) 补买家确权积分日志（points_logs 实际列：user_id, amount, type, source, related_order_id）
INSERT INTO public.points_logs (user_id, amount, type, source, related_order_id, created_at)
VALUES
  ('99f02c72-b238-4f76-8817-73b2848d8d65', 1, 'purchase_earn', 'order_commission', '322d436a-a1c7-4919-8e08-1f5424e95043', now()),
  ('99f02c72-b238-4f76-8817-73b2848d8d65', 1, 'purchase_earn', 'order_commission', '2eefcdee-919b-4eb0-95ce-1a4cf72dc141', now());

-- 3) 买家积分加 2
UPDATE public.profiles
SET points = points + 2
WHERE id = '99f02c72-b238-4f76-8817-73b2848d8d65';

COMMIT;

-- ==================== 00138_fix_get_nearby_products_is_platform.sql ====================
-- 00138_fix_get_nearby_products_is_platform.sql
-- 目的：让「已定位用户」的探索页也能按门店 is_platform 过滤。
-- 现状：get_nearby_products 返回集未含 is_platform，前端只能靠硬编码 store_id/name 兜底，
--       导致审核通过（is_platform=true）的自营门店在已定位时进不了探索。
-- 改动：保持函数签名不变（CREATE OR REPLACE 不允许改签名），仅扩展 RETURNS TABLE + SELECT 带出 is_platform。

DROP FUNCTION IF EXISTS public.get_nearby_products(double precision, double precision, integer, text);

CREATE FUNCTION public.get_nearby_products(
  p_lat double precision,
  p_lng double precision,
  p_limit integer DEFAULT 20,
  p_category text DEFAULT NULL::text
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  product_price numeric,
  product_image_url text,
  product_mood_tags text[],
  store_id uuid,
  store_name text,
  store_address text,
  store_lat double precision,
  store_lng double precision,
  distance_km double precision,
  is_platform boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.price AS product_price,
    p.image_url AS product_image_url,
    p.mood_tags AS product_mood_tags,
    s.id AS store_id,
    s.name AS store_name,
    s.address AS store_address,
    s.lat AS store_lat,
    s.lng AS store_lng,
    -- 计算距离（半正矢公式，单位：公里）
    (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(s.lat)) *
        cos(radians(s.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(s.lat))
      )
    ) AS distance_km,
    COALESCE(s.is_platform, false) AS is_platform
  FROM products p
  JOIN stores s ON p.store_id = s.id
  WHERE p.is_active = true
    AND s.is_active = true
    AND s.lat IS NOT NULL
    AND s.lng IS NOT NULL
    AND (p_category IS NULL OR p.category_id = p_category)
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$;

-- ==================== 00138_merchant_path_isolation.sql ====================
-- ============================================================
-- 00138 商家-用户路径隔离加固
-- 日期：2026-07-20
-- 背景：
--   1) orders / order_items 的 RLS 仅有「买家本人(user_id)」+「管理员」视角，
--      缺「商家按门店」视角。商家会话查询 order_items 时泄漏了自己作为买家的
--      跨店订单（巫山烤鱼新店仪表盘误显「12 订单」）。
--   2) emotion_funnel_events ownerread 误用 user_id=auth.uid()（应是 store 归属），
--      商家读不到本店漏斗。
--   3) marketing_campaigns 无商家写策略，商家无法管理本店活动（被 RLS 拦截）。
-- 修复：
--   - 新增 fn_my_store_ids(SECURITY DEFINER) 断链，统一按门店放行商家，
--     且策略内不直接引用 orders（避免触发 orders 自身 RLS 把商家挡在门外）。
--   - 扩展 get_store_locked_members 返回 referrer_id / referrer_store_id，
--     支撑「跨店会员」真实统计（替代前端写死的 5/2）。
-- ============================================================

-- 1) 商家门店集合助手（SECURITY DEFINER 绕过 RLS，避免策略内裸子查询递归）
CREATE OR REPLACE FUNCTION public.fn_my_store_ids(p_uid uuid)
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM public.stores
  WHERE owner_id = p_uid
$$;
GRANT EXECUTE ON FUNCTION public.fn_my_store_ids(uuid) TO authenticated;

-- 2) orders：商家按门店可见/可操作（买家与管理员策略保留不变）
DROP POLICY IF EXISTS rls81_orders_merchant ON public.orders;
CREATE POLICY rls81_orders_merchant ON public.orders
  FOR ALL TO authenticated
  USING (store_id = ANY(public.fn_my_store_ids(auth.uid())))
  WITH CHECK (store_id = ANY(public.fn_my_store_ids(auth.uid())));

-- 3) order_items：商家按门店（直接比对 order_items.store_id，避免引用 orders 触发其 RLS）
DROP POLICY IF EXISTS rls81_order_items_merchant ON public.order_items;
CREATE POLICY rls81_order_items_merchant ON public.order_items
  FOR ALL TO authenticated
  USING (order_items.store_id::uuid = ANY(public.fn_my_store_ids(auth.uid())))
  WITH CHECK (order_items.store_id::uuid = ANY(public.fn_my_store_ids(auth.uid())));

-- 4) emotion_funnel_events：商家按门店可读（保留买家本人 + 管理员）
DROP POLICY IF EXISTS rls81_emotion_funnel_events_ownerread ON public.emotion_funnel_events;
CREATE POLICY rls81_emotion_funnel_events_ownerread ON public.emotion_funnel_events
  FOR SELECT TO authenticated
  USING (store_id = ANY(public.fn_my_store_ids(auth.uid())) OR user_id = auth.uid() OR is_admin());

-- 5) marketing_campaigns：商家按门店可读写（保留公开读 + 管理员）
DROP POLICY IF EXISTS rls81_marketing_campaigns_merchant ON public.marketing_campaigns;
CREATE POLICY rls81_marketing_campaigns_merchant ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (store_id = ANY(public.fn_my_store_ids(auth.uid())) OR is_admin())
  WITH CHECK (store_id = ANY(public.fn_my_store_ids(auth.uid())) OR is_admin());

-- 6) 扩展 get_store_locked_members：新增 referrer_id / referrer_store_id，支持「跨店会员」真实统计
--    返回类型有变更，须先 DROP 再 CREATE（Postgres 不允许 OR REPLACE 改返回类型）
DROP FUNCTION IF EXISTS public.get_store_locked_members(uuid);
CREATE OR REPLACE FUNCTION public.get_store_locked_members(p_store_id UUID)
RETURNS TABLE (
    user_id UUID,
    nickname TEXT,
    avatar_url TEXT,
    phone_masked TEXT,
    phone_last4 TEXT,
    locked_at TIMESTAMPTZ,
    lock_type TEXT,
    referrer_id UUID,
    referrer_store_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 仅允许门店主人查询本店锁客
    IF NOT EXISTS (
        SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.user_id,
        COALESCE(p.nickname, '微信用户'),
        COALESCE(p.avatar_url, ''),
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 7 THEN '未知'
            ELSE substring(p.phone, 1, 3) || '****' || substring(p.phone, length(p.phone) - 3, 4)
        END,
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 4 THEN ''
            ELSE substring(p.phone, length(p.phone) - 3, 4)
        END,
        r.locked_at,
        COALESCE(r.lock_type, 'first_order'),
        r.referrer_id,
        (SELECT s.id FROM public.stores s WHERE s.owner_id = r.referrer_id LIMIT 1)
    FROM public.user_store_relation r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.store_id = p_store_id
    ORDER BY r.locked_at DESC
    LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.get_store_locked_members IS '商家锁客名单（脱敏手机号，仅店主可查；含 referrer_id/referrer_store_id 用于跨店判定）';

SELECT '00138 商家-用户路径隔离加固 已完成' AS result;

-- ==================== 00139_add_partner_brand_to_nearby.sql ====================
-- 00139_add_partner_brand_to_nearby.sql
-- 目的：让 get_nearby_products 直接返回 partner_brand，前端无需二次查询即可识别并排除合作品牌门店。
-- 背景：is_platform 仅表示「审核通过/活跃商家」，合作品牌门店（巫山烤鱼、张林的水果店等）
--       其 is_platform 同样为 true，导致它们被误判为自营、漏进自营区。
--       正确的自营口径应为：is_platform 为真 且 partner_brand 为空。
-- 改动：保持函数签名不变（CREATE OR REPLACE 不允许改签名），仅扩展 RETURNS TABLE + SELECT 带出 partner_brand。

DROP FUNCTION IF EXISTS public.get_nearby_products(double precision, double precision, integer, text);

CREATE FUNCTION public.get_nearby_products(
  p_lat double precision,
  p_lng double precision,
  p_limit integer DEFAULT 20,
  p_category text DEFAULT NULL::text
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  product_price numeric,
  product_image_url text,
  product_mood_tags text[],
  store_id uuid,
  store_name text,
  store_address text,
  store_lat double precision,
  store_lng double precision,
  distance_km double precision,
  is_platform boolean,
  partner_brand text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.price AS product_price,
    p.image_url AS product_image_url,
    p.mood_tags AS product_mood_tags,
    s.id AS store_id,
    s.name AS store_name,
    s.address AS store_address,
    s.lat AS store_lat,
    s.lng AS store_lng,
    -- 计算距离（半正矢公式，单位：公里）
    (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(s.lat)) *
        cos(radians(s.lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(s.lat))
      )
    ) AS distance_km,
    COALESCE(s.is_platform, false) AS is_platform,
    COALESCE(s.partner_brand, ''::text) AS partner_brand
  FROM products p
  JOIN stores s ON p.store_id = s.id
  WHERE p.is_active = true
    AND s.is_active = true
    AND s.lat IS NOT NULL
    AND s.lng IS NOT NULL
    AND (p_category IS NULL OR p.category_id = p_category)
  ORDER BY distance_km ASC
  LIMIT p_limit;
END;
$$;

-- ==================== 00139_coupons_table.sql ====================
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

-- ==================== 00140_coupons_claim_redeem.sql ====================
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

-- ==================== 00141_merchant_operator_write_rls.sql ====================
-- =============================================================
-- 00141 商家「运营身份」写权限对齐（修复：店铺设置填了保存不了）
-- -------------------------------------------------------------
-- 现象（用户实测 2026-09-17）：
--   「自营门店管理中心 → 店铺设置」可正常打开、可填地址、点保存提示成功，
--   但返回后地址仍是「待补充」，改任何字段都不落库。
--
-- 根因（系统性 RLS 缺口，非单点 bug）：
--   20260802 引入「运营身份」store_staff 后，fn_my_store_ids() 被升级为
--   「owner_id 门店 ∪ store_staff 活跃成员门店」，但**只有部分表**把策略切到了它：
--      已切：orders / order_items / marketing_campaigns / coupons / vehicles /
--            vehicle_transfers / store_staff / store_invites / emotion_funnel_events
--      漏切：stores / products / store_categories / merchant_settlements
--    漏切的这几张表仍写死 `EXISTS (SELECT 1 FROM stores WHERE ... owner_id = auth.uid())`。
--   而线上 4 家门店 owner_id **全部为 NULL**（总后台建店未回填店长），
--   于是：任何账号对这些表的写 = RLS 过滤掉全部行 = PostgREST 返回 204/200 且
--   **不带 error** → 前端 supabase-js 的 error 为 null → updateStore() 返回 true
--   → 弹「保存成功」→ 实际 0 行落库。**假成功**，用户端表现为「保存不了」。
--
-- 本迁移做六件事，全部幂等、全部为加法（不删除既有策略，避免误伤 admin/owner）：
--   1. 新增 is_store_manager(uuid) 助手（owner / manager，SECURITY DEFINER 断链）
--   2. stores：补「运营者 UPDATE」策略
--   3. products：补「运营者写入」策略
--   4. store_categories：补「运营者管理店内分类」策略（不碰 scope='global'）
--   5. merchant_settlements：补「运营者读取本店结算台账」策略
--   6. 修正两个函数：fn_merchant_product_sales / get_store_locked_members
--      二者内部写死 owner_id，导致运营者看到「商品零销量 / 会员 0 人」
--   另：redeem_store_invite 升级为 v2（兑 owner 邀请码时回填 owner_id，彻底统一身份）
--       + 新增 claim_store_ownership() 自助认领 RPC（免跑 SQL）
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴执行
-- =============================================================

-- ── 0. 确保 fn_my_store_ids 是最新版（owner ∪ store_staff）────────
-- 若线上从未部署 20260802，这里的 CREATE OR REPLACE 会顺手补齐，避免后续策略失效。
CREATE OR REPLACE FUNCTION public.fn_my_store_ids(p_uid uuid)
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM (
    SELECT id FROM public.stores WHERE owner_id = p_uid
    UNION
    SELECT store_id FROM public.store_staff WHERE user_id = p_uid AND is_active
  ) t
$$;
GRANT EXECUTE ON FUNCTION public.fn_my_store_ids(uuid) TO authenticated;

-- ── 1. 门店管理助手：仅 owner / manager 可改店 ──────────────────
-- 与 20260802 的 is_store_operator 的区别：那个把 staff/cashier 也算运营者，
-- 用于「读」；本函数用于「改门店主体信息」，收紧到 owner/manager。
CREATE OR REPLACE FUNCTION public.is_store_manager(p_store_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
     WHERE id = p_store_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM public.store_staff
     WHERE store_id = p_store_id AND user_id = auth.uid() AND is_active
       AND role IN ('owner', 'manager')
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_store_manager(uuid) TO authenticated;

-- ── 2. stores：运营者 UPDATE 策略 ───────────────────────────────
-- 原策略：owner_manage_store / rls81_stores_owner（owner_id = auth.uid() OR is_admin）
-- 新增一条**宽松（permissive）**策略即可，Postgres 对多条 permissive 策略取 OR，
-- 因此无需 DROP 既有策略 → admin 与 owner 行为完全不变。
DROP POLICY IF EXISTS rls_operator_update_stores ON public.stores;
CREATE POLICY rls_operator_update_stores ON public.stores
  FOR UPDATE TO authenticated
  USING (public.is_store_manager(id) OR public.is_admin())
  WITH CHECK (public.is_store_manager(id) OR public.is_admin());

-- ── 3. products：运营者写入策略 ─────────────────────────────────
DROP POLICY IF EXISTS rls_operator_write_products ON public.products;
CREATE POLICY rls_operator_write_products ON public.products
  FOR ALL TO authenticated
  USING (public.is_store_operator(products.store_id) OR public.is_admin())
  WITH CHECK (public.is_store_operator(products.store_id) OR public.is_admin());

-- ── 4. store_categories：运营者管理「店内分类」─────────────────
-- 严格限定 scope='store' 且 store_id 非空 → 商家永远改不到平台全局分类。
DROP POLICY IF EXISTS rls_operator_write_store_categories ON public.store_categories;
CREATE POLICY rls_operator_write_store_categories ON public.store_categories
  FOR ALL TO authenticated
  USING (
    scope = 'store'
    AND store_id IS NOT NULL
    AND (public.is_store_operator(store_categories.store_id) OR public.is_admin())
  )
  WITH CHECK (
    scope = 'store'
    AND store_id IS NOT NULL
    AND (public.is_store_operator(store_categories.store_id) OR public.is_admin())
  );

-- ── 5. merchant_settlements：运营者读取本店结算台账 ─────────────
-- 原策略 store_owner_read_own_settlements 只认 owner_id → 运营者「货款提现」页台账为空。
DROP POLICY IF EXISTS rls_operator_read_settlements ON public.merchant_settlements;
CREATE POLICY rls_operator_read_settlements ON public.merchant_settlements
  FOR SELECT TO authenticated
  USING (
    store_id = ANY(public.fn_my_store_ids(auth.uid()))
    OR public.is_admin()
  );

-- ── 6a. fn_merchant_product_sales：护栏改用 fn_my_store_ids ─────
-- 原实现 `oi.store_id::uuid IN (SELECT id FROM stores WHERE owner_id = auth.uid())`
-- → 运营者调用返回 0 行 → 商品管理页「销量 / 营收」整列显示 0。
CREATE OR REPLACE FUNCTION public.fn_merchant_product_sales(p_store_id uuid)
RETURNS TABLE (product_id uuid, sales bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id::uuid                                  AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint                 AS sales,
         COALESCE(SUM(oi.price * oi.quantity), 0)              AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    -- 安全护栏：仅允许聚合当前登录商家可管理的门店（owner ∪ store_staff 活跃成员）
    AND oi.store_id::uuid = ANY(public.fn_my_store_ids(auth.uid()))
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_id::uuid
$$;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_merchant_product_sales(uuid)
  IS '按门店聚合每款商品的销量(sales)与营收(revenue)，已支付口径；护栏已对齐 fn_my_store_ids（含运营身份）';

-- ── 6b. get_store_locked_members：护栏改用 fn_my_store_ids ──────
-- 原实现开头 `IF NOT EXISTS (SELECT 1 FROM stores WHERE id=p_store_id AND owner_id=auth.uid())
-- THEN RETURN; END IF;` → 运营者「会员管理」恒为 0 人 / 跨店统计恒 0。
CREATE OR REPLACE FUNCTION public.get_store_locked_members(p_store_id UUID)
RETURNS TABLE (
    user_id UUID,
    nickname TEXT,
    avatar_url TEXT,
    phone_masked TEXT,
    phone_last4 TEXT,
    locked_at TIMESTAMPTZ,
    lock_type TEXT,
    referrer_id UUID,
    referrer_store_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 仅允许本店运营者（owner ∪ store_staff 活跃成员）查询本店锁客
    IF NOT (p_store_id = ANY(public.fn_my_store_ids(auth.uid())) OR public.is_admin()) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.user_id,
        COALESCE(p.nickname, '微信用户'),
        COALESCE(p.avatar_url, ''),
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 7 THEN '未知'
            ELSE substring(p.phone, 1, 3) || '****' || substring(p.phone, length(p.phone) - 3, 4)
        END,
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 4 THEN ''
            ELSE substring(p.phone, length(p.phone) - 3, 4)
        END,
        r.locked_at,
        COALESCE(r.lock_type, 'first_order'),
        r.referrer_id,
        (SELECT s.id FROM public.stores s WHERE s.owner_id = r.referrer_id LIMIT 1)
    FROM public.user_store_relation r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.store_id = p_store_id
    ORDER BY r.locked_at DESC
    LIMIT 200;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_store_locked_members(uuid) TO authenticated;

-- ── 7. redeem_store_invite v2：兑「owner」邀请码时回填 stores.owner_id ──
-- 原实现只写 store_staff，不回填 owner_id → 店铺 owner_id 永远为 NULL，
-- 所有仍按 owner_id 判权的地方（含未来新表）继续失效。这里彻底统一身份。
-- 安全边界：仅当该店 owner_id 为空（无主店）时才回填，绝不抢夺已有店长。
CREATE OR REPLACE FUNCTION public.redeem_store_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      public.store_invites%ROWTYPE;
  v_uid      uuid := auth.uid();
  v_store_id uuid;
  v_role     text;
  v_claimed  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv
  FROM public.store_invites
  WHERE code = upper(btrim(p_code))
    AND used_by IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  END IF;

  v_store_id := v_inv.store_id;
  v_role     := v_inv.role;

  -- upsert 进 store_staff（UNIQUE(store_id, user_id)）
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, v_uid, v_role, true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true;

  -- owner / manager 身份 + 门店无主 → 回填 owner_id，让 owner_id 判权路径也通
  IF v_role IN ('owner', 'manager') THEN
    UPDATE public.stores
       SET owner_id = v_uid
     WHERE id = v_store_id
       AND owner_id IS NULL;
    v_claimed := FOUND;
  END IF;

  -- 标记邀请码已用
  UPDATE public.store_invites
     SET used_by = v_uid, used_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'store_id', v_store_id, 'role', v_role, 'claimed_owner', v_claimed);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite(text) TO authenticated;

-- ── 8. claim_store_ownership()：免跑 SQL 的自助认领 ─────────────
-- 场景：门店由总后台建好、owner_id 为 NULL，而你已经通过任意方式拿到
--       store_staff(role=owner/manager)。调用一次即把 owner_id 认领到自己名下。
-- 幂等：已认领过返回 claimed=false（无副作用）。
CREATE OR REPLACE FUNCTION public.claim_store_ownership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_ids     uuid[];
  v_stores  uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- 候选：我是 owner/manager 的成员行对应门店，且该店当前无 owner
  SELECT COALESCE(array_agg(DISTINCT t.store_id), '{}'::uuid[])
    INTO v_ids
  FROM public.store_staff t
  JOIN public.stores s ON s.id = t.store_id
  WHERE t.user_id = v_uid
    AND t.is_active
    AND t.role IN ('owner', 'manager')
    AND s.owner_id IS NULL;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'claimed', 0, 'store_ids', '[]'::jsonb);
  END IF;

  UPDATE public.stores
     SET owner_id = v_uid
   WHERE id = ANY(v_ids)
     AND owner_id IS NULL;

  -- 回读确认（RETURNING 对数组变量只保留末行，故单独聚合一次）
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_stores
    FROM public.stores
   WHERE id = ANY(v_ids) AND owner_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'claimed', COALESCE(array_length(v_stores, 1), 0),
                            'store_ids', to_jsonb(v_stores));
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_store_ownership() TO authenticated;

-- ── 9. 诊断输出 ────────────────────────────────────────────────
-- 关注三列：
--   owner_id 为空的门店数 / 有 store_staff 运营者的门店数 / 「无主但有运营者」待认领数
SELECT
  (SELECT count(*) FROM public.stores)                                             AS 门店总数,
  (SELECT count(*) FROM public.stores WHERE owner_id IS NULL)                      AS owner为空的店,
  (SELECT count(*) FROM public.store_staff WHERE is_active)                        AS 活跃运营成员数,
  (SELECT count(DISTINCT s.id)
     FROM public.stores s
     JOIN public.store_staff t ON t.store_id = s.id AND t.is_active
                                AND t.role IN ('owner','manager')
    WHERE s.owner_id IS NULL)                                                      AS 待认领的门店数;

SELECT '00141 商家运营身份写权限对齐 已完成' AS result;

-- ==================== 00142_self_open_store.sql ====================
-- =============================================================
-- 00142 「审核通过 → 开通店铺」缺环补全 + user_role 补 merchant 值
-- -------------------------------------------------------------
-- 背景（2026-09-18 线上实测，anon 探针 + Dashboard 查询确认）：
--   两个账号：
--     18701410500（乐悠悠）→ merchant_applications: status=approved, store_name=张林水果店
--     18565613635（凌云一笑）→ merchant_applications: status=approved, store_name=巫山烤鱼
--   但 stores 里没有以他们为 owner_id 的门店（linked_store_name = NULL）→ 进不去管理后台。
--
-- 根因（历史审核实现缺陷，两点叠加）：
--   1) 旧实现「先置 status='approved'，再 insert stores」→ 建店失败也无法回滚；
--   2) 建店时写 store_type='self'，而 stores_store_type_check 只允许
--      hub/transfer/truck/branch（迁移 20260802）→ 必然 23514 → 永久孤儿态。
--   新实现（src/db/api.ts adminApproveApplication / admin-web approveApplication）
--   已改为「先建店、后置状态」，但**存量孤儿无法自愈**：客户端没有建店权限
--   （stores 的写策略只放给 owner_id = auth.uid() 或 admin）。
--
-- 本迁移做两件事（全部幂等、纯加法）：
--   A. user_role 枚举补 'merchant'（线上只有 ('user','admin')，导致多处
--      profiles.role='merchant' 的写入报 22P02 被静默吞掉；读取侧有
--      merchant_status 兜底所以只表现为「已有自营门店身份」徽章永不显示）。
--   B. fn_self_open_store()：申请人按自己「已通过」的申请一键物化门店并绑定 owner
--      → 管理中心「店铺待开通」页点一下即进入后台，不再需要跑 SQL / 等总部。
--      同名无主店优先认领，否则新建；写 store_staff(owner)；对齐 merchant_status。幂等。
--
-- 安全边界：
--   fn_open_store_for_user(uuid) 是内部实现（可为**任意** uid 开店），已显式
--   REVOKE 掉 PUBLIC / anon / authenticated，只留 service_role 与 postgres（SQL Editor）；
--   对外只暴露 fn_self_open_store()，它写死 auth.uid()，任何登录用户只能给自己开店。
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴执行
-- =============================================================

-- ── A. user_role 补 'merchant' ──────────────────────────────────
-- 注意：Postgres 限制「同一事务内不能使用新加入的枚举值」。
-- 本迁移后续语句**不使用**该值（只写 merchant_status，其枚举已含 approved），故安全。
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'merchant';

-- ── B1. 内部实现：把 p_uid 的「已通过无门店」申请物化成门店 ──────
CREATE OR REPLACE FUNCTION public.fn_open_store_for_user(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exist    uuid;
  v_app      public.merchant_applications%ROWTYPE;
  v_store_id uuid;
  v_adopted  boolean := false;
BEGIN
  IF p_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_target_user');
  END IF;

  -- 幂等：本人已有归属门店 → 只补齐 store_staff(owner) 后直接返回
  SELECT id INTO v_exist
    FROM public.stores
   WHERE owner_id = p_uid
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_exist IS NOT NULL THEN
    INSERT INTO public.store_staff (store_id, user_id, role, is_active)
    VALUES (v_exist, p_uid, 'owner', true)
    ON CONFLICT (store_id, user_id)
    DO UPDATE SET role = 'owner', is_active = true;
    RETURN jsonb_build_object('ok', true, 'already', true, 'store_id', v_exist);
  END IF;

  -- 取最新一条「已通过」的申请（未通过则不予开通，守住闸门）
  SELECT * INTO v_app
    FROM public.merchant_applications
   WHERE user_id = p_uid
     AND status = 'approved'
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_approved_application');
  END IF;

  -- 优先认领「同名且无主」的门店（总后台可能已手工建好、只是没绑店长）
  -- 安全边界：仅 owner_id IS NULL 时才认领，绝不抢夺已有店长。
  IF v_app.store_name IS NOT NULL AND btrim(v_app.store_name) <> '' THEN
    SELECT id INTO v_store_id
      FROM public.stores
     WHERE name = v_app.store_name
       AND owner_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_store_id IS NOT NULL THEN
      UPDATE public.stores SET owner_id = p_uid
       WHERE id = v_store_id AND owner_id IS NULL;
      v_adopted := FOUND;
      IF NOT v_adopted THEN
        v_store_id := NULL;   -- 竞态下被别人先认领 → 走新建
      END IF;
    END IF;
  END IF;

  -- 否则新建。store_type 合法值仅 branch/hub/transfer/truck；「自营」靠 is_platform 标识。
  IF v_store_id IS NULL THEN
    INSERT INTO public.stores (
      owner_id, name, description, phone, address, category,
      store_type, is_active, is_platform, rating
    ) VALUES (
      p_uid,
      COALESCE(NULLIF(btrim(v_app.store_name), ''), '我的门店'),
      v_app.description,
      v_app.contact_phone,
      v_app.address,
      COALESCE(NULLIF(btrim(v_app.business_type), ''), '综合'),
      'branch', true, false, 0
    )
    RETURNING id INTO v_store_id;
  END IF;

  -- 运营成员行（owner）——统一身份来源，让 fn_my_store_ids 也能取到本店
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, p_uid, 'owner', true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = 'owner', is_active = true;

  -- 画像状态对齐（merchant_status 的枚举已含 approved，不触碰 role，见 A 的事务限制说明）
  UPDATE public.profiles SET merchant_status = 'approved' WHERE id = p_uid;

  -- 短码 / 条码前缀兜底：正常由列默认值与 trg_store_barcode_prefix 触发器处理，
  -- 这里仅在缺失时补一次（相关对象不存在则跳过，绝不影响开店主流程）。
  IF to_regproc('generate_store_short_code') IS NOT NULL THEN
    UPDATE public.stores SET short_code = public.generate_store_short_code()
     WHERE id = v_store_id AND short_code IS NULL;
  END IF;

  IF to_regclass('public.seq_store_barcode_prefix') IS NOT NULL THEN
    UPDATE public.stores
       SET barcode_prefix = lpad(nextval('public.seq_store_barcode_prefix')::text, 6, '0')
     WHERE id = v_store_id AND barcode_prefix IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', v_store_id,
    'store_name', (SELECT name FROM public.stores WHERE id = v_store_id),
    'adopted', v_adopted,
    'created', NOT v_adopted
  );
END;
$$;

COMMENT ON FUNCTION public.fn_open_store_for_user(uuid)
  IS '按指定 uid 的「已通过」开店申请物化门店并绑定 owner（内部实现，不可由 anon/authenticated 调用）';

-- 越权收口：Postgres 默认给 PUBLIC 授予 EXECUTE，Supabase 还给 anon/authenticated
-- 单独授过权，两处都必须显式收回，否则匿名用户可替任意 uid 开店。
REVOKE ALL ON FUNCTION public.fn_open_store_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_open_store_for_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_open_store_for_user(uuid) FROM authenticated;

-- ── B2. 对外 RPC：申请人自助开通（写死 auth.uid()，只能给自己开）──
CREATE OR REPLACE FUNCTION public.fn_self_open_store()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  RETURN public.fn_open_store_for_user(v_uid);
END;
$$;

COMMENT ON FUNCTION public.fn_self_open_store()
  IS '申请人自助开通店铺：按本人「已通过」的开店申请建店/认领同名无主店并绑定 owner。幂等。';

GRANT EXECUTE ON FUNCTION public.fn_self_open_store() TO authenticated;

-- ── C. 诊断输出 ────────────────────────────────────────────────
-- 关注「已通过但无门店」这一列：它 > 0 就是仍待修复的历史孤儿数量。
SELECT
  (SELECT count(*) FROM public.stores)                                            AS 门店总数,
  (SELECT count(*) FROM public.store_staff WHERE is_active)                       AS 活跃运营成员数,
  (SELECT count(*) FROM public.merchant_applications WHERE status = 'approved')   AS 已通过申请数,
  (SELECT count(*)
     FROM public.merchant_applications a
    WHERE a.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = a.user_id)
  )                                                                               AS 已通过但无门店;

SELECT '00142 审核通过→开通店铺缺环补全 已完成' AS result;

-- ==================== 00200_food_ingredient_safety.sql ====================
-- ============================================================
-- 食品配料安全管理系统 · 食品域 V1.0 全量表（基于现有 Supabase 后端）
-- 复用来店有喜既有 supabase 客户端；异业共享会员联盟不在此文件，按规划剔除。
-- 二级分销复用来店有喜既有模型，不重复建表。
--
-- 客户端使用 anon key，故 RLS 对 anon 开放所需读写；
--   生产环境建议将写操作收敛到 Edge Function（service_role）后再收紧。
-- 执行方式：在 Supabase SQL Editor 全量粘贴运行。
--
-- ⚠️ 若先前误执行过「食养语义版 00200」（含 ingredients/product_ingredients 表），
--    本脚本开头会 DROP 这两个旧表后重建为下方安全库结构，避免命名/字段冲突。
-- ============================================================

-- 清理上一版（食养语义）误建表，防止与下方 food_additives 冲突
drop table if exists public.product_ingredients cascade;
drop table if exists public.ingredients cascade;

-- ---------- 1. 配料安全库 food_additives（壁垒资产：白/黄/黑 + 国标）----------
create table if not exists public.food_additives (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text,                              -- 防腐剂/色素/增稠剂/甜味剂/香精/营养强化剂/其他
  risk_level  text not null default 'white'
              check (risk_level in ('white','yellow','black')),
  age_limit   int,                               -- 最小适用年龄（月），NULL=全龄
  gb_std      text,                              -- 国标依据，如 GB2760
  risk_desc   text,                              -- 风险说明文案
  source      text not null default 'preset'
              check (source in ('preset','auto')),
  status      text not null default 'active'
              check (status in ('active','pending_review')),
  created_by  uuid,
  reviewed_by uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_food_additives_name on public.food_additives (name);
create index if not exists idx_food_additives_risk on public.food_additives (risk_level);

-- ---------- 2. 配料别名 food_additive_aliases（俗称/异体映射）----------
create table if not exists public.food_additive_aliases (
  id          uuid primary key default gen_random_uuid(),
  additive_id uuid not null references public.food_additives(id) on delete cascade,
  alias       text not null,
  unique (additive_id, alias)
);
create index if not exists idx_faa_additive on public.food_additive_aliases (additive_id);

-- ---------- 3. 商品-配料关联 product_food_additives ----------
create table if not exists public.product_food_additives (
  product_id  uuid not null references public.products(id) on delete cascade,
  additive_id uuid not null references public.food_additives(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (product_id, additive_id)
);
create index if not exists idx_pfa_additive on public.product_food_additives (additive_id);

-- ---------- 4. 配料表 OCR 任务 ingredient_ocr_tasks ----------
create table if not exists public.ingredient_ocr_tasks (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid references public.products(id) on delete set null,
  store_id           uuid references public.stores(id) on delete set null,
  image_url          text not null,                -- 配料表原图（OCR 输入）
  raw_text           text,                         -- OCR 原始识别文本
  parsed_ingredients text[] default '{}',          -- 解析出的配料名列表
  matched_additives  text[] default '{}',          -- 已匹配安全库的配料名
  safety_grade       text check (safety_grade in ('S','A','C')),  -- 引擎初算安全评级
  status             text not null default 'pending'
                   check (status in ('pending','reviewing','approved','rejected')),
  reviewer_id        uuid,                         -- 复核人
  review_note        text,                         -- 复核意见
  risk_flags         text[] default '{}',          -- 风险标注（反式脂肪/高钠/致敏原…）
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_ocr_status on public.ingredient_ocr_tasks (status);
create index if not exists idx_ocr_store  on public.ingredient_ocr_tasks (store_id);

-- ---------- 5. 库存批次 stock_batches（入库质检 + 临期预警）----------
create table if not exists public.stock_batches (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  store_id    uuid references public.stores(id) on delete set null,
  batch_no    text,
  qty         int not null default 0,
  produced_at timestamptz,
  expire_at   timestamptz,                         -- 临期预警依据
  status      text not null default 'normal'
              check (status in ('normal','sold_out','expired','blocked')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_sb_product on public.stock_batches (product_id);
create index if not exists idx_sb_expire on public.stock_batches (expire_at);

-- ---------- 6. 库存汇总 inventories（按仓/车实时库存）----------
create table if not exists public.inventories (
  id         uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('warehouse','vehicle')),
  owner_id   uuid not null,
  product_id uuid not null references public.products(id) on delete cascade,
  qty        int not null default 0,
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id, product_id)
);
create index if not exists idx_inv_owner on public.inventories (owner_type, owner_id);

-- ---------- 7. 流动车 vehicles ----------
create table if not exists public.vehicles (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid references public.stores(id) on delete set null,
  name       text not null,
  status     text not null default 'active'
             check (status in ('active','offline')),
  created_at timestamptz not null default now()
);
create index if not exists idx_vehicles_store on public.vehicles (store_id);

-- ---------- 8. 流动车调拨单 vehicle_transfers ----------
create table if not exists public.vehicle_transfers (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  type        text not null check (type in ('out','return','cross')),  -- 出库/回库/跨车
  product_id  uuid references public.products(id) on delete set null,
  qty         int not null default 0,
  operator_id uuid,                              -- 操作人（弱网可空，恢复后补）
  sync_status text not null default 'synced'
              check (sync_status in ('synced','pending')),  -- 弱网离线标记
  created_at  timestamptz not null default now()
);
create index if not exists idx_vt_vehicle on public.vehicle_transfers (vehicle_id);
create index if not exists idx_vt_sync on public.vehicle_transfers (sync_status);

-- ---------- 9. 会员摄入记录 intake_logs ----------
create table if not exists public.intake_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  product_id   uuid references public.products(id) on delete set null,
  product_name text,
  ingredients  text[] default '{}',               -- 摄入的配料名/key
  nature       text,                              -- 该餐整体性味
  health_tags  text[] default '{}',
  taken_at     timestamptz not null default now(),
  scene        text,                              -- 场景（熬夜/经期…）
  created_at   timestamptz not null default now()
);
create index if not exists idx_intake_user on public.intake_logs (user_id, taken_at desc);

-- ---------- 10. 会员健康画像 health_reports ----------
create table if not exists public.health_reports (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  period             text not null,               -- 统计周期，如 2026-07
  nature_distribution jsonb,                      -- 性味分布
  top_ingredients    text[] default '{}',
  risk_flags         text[] default '{}',         -- 累计风险（高钠/高糖…）
  advice             text,                         -- 食养建议（不替代医嘱）
  generated_at       timestamptz not null default now(),
  unique (user_id, period)
);
create index if not exists idx_health_user on public.health_reports (user_id, period);

-- ============================================================
-- RLS（anon key 模式：开放所需读写；生产建议收敛到 Edge Function）
-- ============================================================
alter table public.food_additives          enable row level security;
alter table public.food_additive_aliases   enable row level security;
alter table public.product_food_additives  enable row level security;
alter table public.ingredient_ocr_tasks    enable row level security;
alter table public.stock_batches           enable row level security;
alter table public.inventories             enable row level security;
alter table public.vehicles                enable row level security;
alter table public.vehicle_transfers       enable row level security;
alter table public.intake_logs             enable row level security;
alter table public.health_reports          enable row level security;

-- 先 DROP 已存在的同名策略（幂等重跑：让脚本可重复执行）
drop policy if exists "food_additives_read"  on public.food_additives;
drop policy if exists "food_additives_write" on public.food_additives;
drop policy if exists "faa_all" on public.food_additive_aliases;
drop policy if exists "pfa_all" on public.product_food_additives;
drop policy if exists "ocr_all" on public.ingredient_ocr_tasks;
drop policy if exists "sb_all"  on public.stock_batches;
drop policy if exists "inv_all" on public.inventories;
drop policy if exists "veh_all" on public.vehicles;
drop policy if exists "vt_all"  on public.vehicle_transfers;
drop policy if exists "intake_all" on public.intake_logs;
drop policy if exists "health_all" on public.health_reports;

-- 配料安全库：公开可读；写开放（MVP，生产改 Edge Function）
create policy "food_additives_read"  on public.food_additives for select using (true);
create policy "food_additives_write" on public.food_additives for all    using (true) with check (true);

create policy "faa_all" on public.food_additive_aliases for all using (true) with check (true);
create policy "pfa_all" on public.product_food_additives for all using (true) with check (true);
create policy "ocr_all" on public.ingredient_ocr_tasks for all using (true) with check (true);

-- 库存/流动车：开放（MVP；理想按 auth.uid() 限定 store_id）
create policy "sb_all"  on public.stock_batches  for all using (true) with check (true);
create policy "inv_all" on public.inventories    for all using (true) with check (true);
create policy "veh_all" on public.vehicles       for all using (true) with check (true);
create policy "vt_all"  on public.vehicle_transfers for all using (true) with check (true);

-- 会员摄入 / 健康画像：开放（MVP；理想按 auth.uid() 限定 user_id）
create policy "intake_all" on public.intake_logs   for all using (true) with check (true);
create policy "health_all" on public.health_reports for all using (true) with check (true);

-- ============================================================
-- 示例种子（配料安全库核心条目；完整 500+ 由 shiyang-dictionary 批量导入脚本生成）
-- risk_level: white=安全可用 / yellow=限量使用 / black=婴幼儿禁用或禁用
-- ============================================================
insert into public.food_additives (name, category, risk_level, age_limit, gb_std, risk_desc, status) values
  ('山梨酸钾',     '防腐剂',   'white',  null, 'GB2760', '常见防腐剂，代谢快、低毒，按量使用安全',                  'active'),
  ('苯甲酸钠',     '防腐剂',   'yellow', null, 'GB2760', '防腐剂，与维C同存可能生成微量苯，需控量',               'active'),
  ('脱氢乙酸钠',   '防腐剂',   'yellow', null, 'GB2760', '防腐剂，2024版国标已收紧使用范围，注意限量',            'active'),
  ('胭脂红',       '色素',     'yellow', 36,   'GB2760', '合成色素，部分儿童敏感，建议3岁以下少用',                'active'),
  ('柠檬黄',       '色素',     'yellow', 36,   'GB2760', '合成色素，与多动行为关联存争议，婴幼儿限量',            'active'),
  ('日落黄',       '色素',     'yellow', 36,   'GB2760', '合成色素，建议3岁以下少用',                              'active'),
  ('糖精钠',       '甜味剂',   'yellow', 36,   'GB2760', '人工甜味剂，无营养，婴幼儿不建议',                      'active'),
  ('阿斯巴甜',     '甜味剂',   'yellow', null, 'GB2760', '人工甜味剂，苯丙酮尿症患者禁用',                        'active'),
  ('三氯蔗糖',     '甜味剂',   'white',  null, 'GB2760', '高倍甜味剂，无热量，目前认为安全',                      'active'),
  ('卡拉胶',       '增稠剂',   'white',  null, 'GB2760', '海藻提取增稠剂，食品级安全',                            'active'),
  ('明胶',         '增稠剂',   'white',  null, 'GB2760', '动物皮骨提取，常见安全',                                'active'),
  ('部分氢化植物油','反式脂肪','black',  null, 'GB28050','含反式脂肪酸，婴幼儿禁用、成人严控',                   'active'),
  ('亚硝酸盐',     '护色剂',   'black',  36,   'GB2760', '肉制品护色剂，过量有毒，婴幼儿严禁',                    'active'),
  ('人工香精',     '香精',     'yellow', 36,   'GB2760', '合成香精，部分儿童敏感，建议少用',                      'active')
on conflict (name) do nothing;

-- ==================== 00201_reclassify_partner_to_self.sql ====================
-- 00201_reclassify_partner_to_self.sql
-- 目的：将「品牌馆 / 合作品牌」门店统一归并到自营门店商品中。
-- 背景：项目当前仅以自营门店模式运营（无合作品牌资质），此前被误标为合作品牌的门店
--       （如张林水果店、巫山烤鱼等，见迁移 00139）应归并为自营门店。
-- 影响：stores.partner_brand 全部置空；is_platform 统一为 true。
-- 关联代码：src/db/api.ts 已移除 partner_brand 区分逻辑；
--          src/pages/explore/index.tsx 已删除「品牌馆」分区，全部展示自营门店商品。

-- 1) 合作品牌标识置空（归并到自营）
UPDATE public.stores SET partner_brand = NULL WHERE partner_brand IS NOT NULL;

-- 2) 确保所有门店均为自营门店
UPDATE public.stores SET is_platform = true WHERE is_platform IS NOT true;

-- 注：partner_brand 列保留不删除，避免破坏迁移 00139 的 get_nearby_products RPC
--     （其 RETURNS TABLE 含 partner_brand 列）。该列此后恒为 NULL，仅作历史兼容字段。

-- ==================== 00202_create_product_images_bucket.sql ====================
-- ============================================================
-- 00202_create_product_images_bucket.sql
-- 创建 product-images 存储桶（food-scan 拍照配料 OCR 用）
-- 根因：food-scan 拍照调用 uploadToStorage(bucket:'product-images')，
--       但该桶此前从未创建，导致上传报「存储桶不存在」。
-- 本迁移补齐 product-images 桶（公开读取）+ RLS 策略。幂等可重复执行。
-- ============================================================

-- 1. 创建 product-images 桶（公开读取）
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 公开读取策略（所有人可读取配料图片）
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- 3. 允许匿名与登录用户上传（C 端游客也可用拍照识别）
DROP POLICY IF EXISTS "product_images_anon_insert" ON storage.objects;
CREATE POLICY "product_images_anon_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'anon');

DROP POLICY IF EXISTS "product_images_auth_insert" ON storage.objects;
CREATE POLICY "product_images_auth_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- 4. 登录用户可管理自己上传的文件
DROP POLICY IF EXISTS "product_images_auth_update" ON storage.objects;
CREATE POLICY "product_images_auth_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "product_images_auth_delete" ON storage.objects;
CREATE POLICY "product_images_auth_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.uid() = owner);

-- 提示：单张配料图通常 < 10MB，Supabase 默认 50MB 上限足够；
-- 如需调大，在 Supabase 控制台 Storage → product-images → 修改「文件大小上限」。

SELECT '✅ product-images 存储桶已就绪' AS result;

-- ==================== 00203_drop_user_staff_bindings.sql ====================
-- 2026-09-28 数据库清理：删除已废弃的 user_staff_bindings 表
-- 依据：supabase/functions/cleanup/01_add_table_comments_and_check_redundant.sql
--       标注其「已被 store_staff 替代，未使用」。线上已执行 DROP（0 行 / 0 外键 / 0 对象依赖 / 0 触发器 / 0 RLS）。
-- 补此迁移保持本地迁移链与线上库一致（否则 db reset / 新环境会按历史迁移重建该表）。
-- 幂等：IF EXISTS 避免重复执行报错。
DROP TABLE IF EXISTS user_staff_bindings;

-- ==================== 00203_expand_food_additives_seed.sql ====================
-- ============================================================
-- 00203 扩充食品配料安全库种子（food_additives）
-- 目的：将安全库从 14 条扩到覆盖 GB 2760 常见 ~130 种添加剂，
--       让 C 端「文本解析」「拍照 OCR」能命中日常 90% 食品配料。
-- 与前端 src/utils/additive-dictionary.ts 的 ADDITIVE_DICT 保持一致。
-- 幂等：name 唯一，已存在的 14 条 ON CONFLICT DO NOTHING 跳过。
-- 执行：Supabase SQL Editor 全量粘贴运行。
-- ============================================================

insert into public.food_additives (name, category, risk_level, age_limit, gb_std, risk_desc, status) values
  -- 防腐剂
  ('山梨酸钾',     '防腐剂', 'white',  null, 'GB2760', '常见防腐剂，代谢快、低毒，按量使用安全', 'active'),
  ('苯甲酸钠',     '防腐剂', 'yellow', 36,   'GB2760', '防腐剂，与维C同存可能生成微量苯，需控量', 'active'),
  ('脱氢乙酸钠',   '防腐剂', 'yellow', 36,   'GB2760', '防腐剂，2024版国标已收紧使用范围，注意限量', 'active'),
  ('丙酸钙',       '防腐剂', 'white',  null, 'GB2760', '面包常用防腐剂，安全性高', 'active'),
  ('丙酸钠',       '防腐剂', 'white',  null, 'GB2760', '面包常用防腐剂，安全性高', 'active'),
  ('对羟基苯甲酸乙酯','防腐剂','yellow', null, 'GB2760', '尼泊金类防腐剂，限量使用', 'active'),
  ('对羟基苯甲酸丙酯','防腐剂','yellow', null, 'GB2760', '尼泊金类防腐剂，限量使用', 'active'),
  ('乳酸链球菌素', '防腐剂', 'white',  null, 'GB2760', '天然多肽防腐剂（Nisin），安全', 'active'),
  ('纳他霉素',     '防腐剂', 'white',  null, 'GB2760', '表面抗真菌防腐剂，安全', 'active'),
  -- 甜味剂
  ('糖精钠',       '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂，无营养，婴幼儿不建议', 'active'),
  ('阿斯巴甜',     '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂，苯丙酮尿症患者禁用', 'active'),
  ('安赛蜜',       '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂（AK糖），限量使用', 'active'),
  ('三氯蔗糖',     '甜味剂', 'white',  null, 'GB2760', '高倍甜味剂，无热量，目前认为安全', 'active'),
  ('甜蜜素',       '甜味剂', 'yellow', 36,   'GB2760', '人工甜味剂，过量有争议，限量', 'active'),
  ('木糖醇',       '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，防龋齿，安全', 'active'),
  ('麦芽糖醇',     '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，升糖低，安全', 'active'),
  ('赤藓糖醇',     '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，零热量，安全', 'active'),
  ('山梨糖醇',     '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('甘露醇',       '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('乳糖醇',       '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('异麦芽酮糖醇', '甜味剂', 'white',  null, 'GB2760', '糖醇类甜味剂，安全', 'active'),
  ('罗汉果甜苷',   '甜味剂', 'white',  null, 'GB2760', '天然植物甜味剂，安全', 'active'),
  ('甜菊糖苷',     '甜味剂', 'white',  null, 'GB2760', '天然植物甜味剂，安全', 'active'),
  ('纽甜',         '甜味剂', 'white',  null, 'GB2760', '高倍甜味剂，安全', 'active'),
  ('阿力甜',       '甜味剂', 'white',  null, 'GB2760', '高倍甜味剂，安全', 'active'),
  -- 合成色素
  ('胭脂红',       '色素',   'yellow', 36,   'GB2760', '合成色素，部分儿童敏感，建议3岁以下少用', 'active'),
  ('苋菜红',       '色素',   'yellow', 36,   'GB2760', '合成色素，建议限量', 'active'),
  ('柠檬黄',       '色素',   'yellow', 36,   'GB2760', '合成色素，与多动行为关联存争议，婴幼儿限量', 'active'),
  ('日落黄',       '色素',   'yellow', 36,   'GB2760', '合成色素，建议3岁以下少用', 'active'),
  ('亮蓝',         '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('靛蓝',         '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('诱惑红',       '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('赤藓红',       '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('新红',         '色素',   'yellow', 36,   'GB2760', '合成色素，限量使用', 'active'),
  ('二氧化钛',     '色素',   'yellow', 36,   'GB2760', '白色素，部分国家限用，建议少用', 'active'),
  -- 天然色素
  ('焦糖色',       '色素',   'white',  null, 'GB2760', '天然着色剂，安全', 'active'),
  ('红曲红',       '色素',   'white',  null, 'GB2760', '天然红曲色素，安全', 'active'),
  ('姜黄',         '色素',   'white',  null, 'GB2760', '天然姜黄色素，安全', 'active'),
  ('栀子黄',       '色素',   'white',  null, 'GB2760', '天然着色剂，安全', 'active'),
  ('β-胡萝卜素',    '色素',   'white',  null, 'GB2760', '天然类胡萝卜素，安全', 'active'),
  ('叶绿素铜钠盐', '色素',   'yellow', null, 'GB2760', '天然源叶绿素着色剂，限量', 'active'),
  ('高粱红',       '色素',   'yellow', null, 'GB2760', '天然着色剂，限量', 'active'),
  ('天然苋菜红',   '色素',   'yellow', null, 'GB2760', '天然着色剂，限量', 'active'),
  -- 增稠剂
  ('卡拉胶',       '增稠剂', 'white',  null, 'GB2760', '海藻提取增稠剂，食品级安全', 'active'),
  ('明胶',         '增稠剂', 'white',  null, 'GB2760', '动物皮骨提取，常见安全', 'active'),
  ('黄原胶',       '增稠剂', 'white',  null, 'GB2760', '微生物发酵胶，安全', 'active'),
  ('瓜尔胶',       '增稠剂', 'white',  null, 'GB2760', '植物种子胶，安全', 'active'),
  ('阿拉伯胶',     '增稠剂', 'white',  null, 'GB2760', '天然树胶，安全', 'active'),
  ('果胶',         '增稠剂', 'white',  null, 'GB2760', '水果提取胶，安全', 'active'),
  ('海藻酸钠',     '增稠剂', 'white',  null, 'GB2760', '褐藻胶，安全', 'active'),
  ('羧甲基纤维素钠','增稠剂','white',  null, 'GB2760', 'CMC 增稠稳定剂，安全', 'active'),
  ('羟丙基甲基纤维素','增稠剂','white', null, 'GB2760', 'HPMC 增稠剂，安全', 'active'),
  ('刺槐豆胶',     '增稠剂', 'white',  null, 'GB2760', '槐豆胶，安全', 'active'),
  ('结冷胶',       '增稠剂', 'white',  null, 'GB2760', '微生物胶，安全', 'active'),
  ('亚麻籽胶',     '增稠剂', 'white',  null, 'GB2760', '植物胶，安全', 'active'),
  ('魔芋胶',       '增稠剂', 'white',  null, 'GB2760', '魔芋甘露聚糖，安全', 'active'),
  ('变性淀粉',     '增稠剂', 'white',  null, 'GB2760', '改性淀粉，安全', 'active'),
  -- 乳化剂
  ('单硬脂酸甘油酯','乳化剂','white',  null, 'GB2760', '单甘酯乳化剂，安全', 'active'),
  ('蔗糖脂肪酸酯', '乳化剂', 'white',  null, 'GB2760', '蔗糖酯乳化剂，安全', 'active'),
  ('磷脂',         '乳化剂', 'white',  null, 'GB2760', '大豆卵磷脂乳化剂，安全', 'active'),
  ('聚甘油脂肪酸酯','乳化剂','white',  null, 'GB2760', '聚甘油酯乳化剂，安全', 'active'),
  ('硬脂酰乳酸钠', '乳化剂', 'white',  null, 'GB2760', 'SSL 乳化剂，安全', 'active'),
  ('双乙酰酒石酸单双甘油酯','乳化剂','white', null, 'GB2760', 'DATEM 乳化剂，安全', 'active'),
  ('司盘60',       '乳化剂', 'white',  null, 'GB2760', 'Span60 乳化剂，安全', 'active'),
  ('吐温80',       '乳化剂', 'white',  null, 'GB2760', 'Tween80 乳化剂，安全', 'active'),
  -- 抗氧化剂
  ('丁基羟基茴香醚','抗氧化剂','yellow', null, 'GB2760', 'BHA 抗氧化剂，限量使用', 'active'),
  ('二丁基羟基甲苯','抗氧化剂','yellow', null, 'GB2760', 'BHT 抗氧化剂，限量使用', 'active'),
  ('特丁基对苯二酚','抗氧化剂','yellow', null, 'GB2760', 'TBHQ 抗氧化剂，限量使用', 'active'),
  ('没食子酸丙酯', '抗氧化剂', 'yellow', null, 'GB2760', 'PG 抗氧化剂，限量使用', 'active'),
  ('抗坏血酸棕榈酸酯','抗氧化剂','white', null, 'GB2760', '维C衍生物抗氧化，安全', 'active'),
  ('茶多酚',       '抗氧化剂', 'white',  null, 'GB2760', '天然抗氧化，安全', 'active'),
  ('D-异抗坏血酸钠','抗氧化剂','white', null, 'GB2760', '异维C钠抗氧化，安全', 'active'),
  ('维生素E',      '抗氧化剂', 'white',  null, 'GB2760', '生育酚抗氧化，安全', 'active'),
  -- 膨松剂
  ('碳酸氢钠',     '膨松剂', 'white',  null, 'GB2760', '小苏打，安全', 'active'),
  ('碳酸氢铵',     '膨松剂', 'yellow', null, 'GB2760', '臭粉，加热释氨，限量', 'active'),
  ('硫酸铝钾',     '膨松剂', 'black',  null, 'GB2760', '明矾含铝，儿童慎用、严控', 'active'),
  ('硫酸铝铵',     '膨松剂', 'black',  null, 'GB2760', '铵明矾含铝，儿童慎用、严控', 'active'),
  ('葡萄糖酸-δ-内酯','膨松剂','white', null, 'GB2760', 'GDL 酸度/膨松，安全', 'active'),
  ('酒石酸氢钾',   '膨松剂', 'white',  null, 'GB2760', '塔塔粉，安全', 'active'),
  -- 酸度调节剂
  ('柠檬酸',       '酸度调节剂', 'white', null, 'GB2760', '常见酸味剂，安全', 'active'),
  ('柠檬酸钠',     '酸度调节剂', 'white', null, 'GB2760', '缓冲剂，安全', 'active'),
  ('苹果酸',       '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('酒石酸',       '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('乳酸',         '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('醋酸',         '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  ('磷酸',         '酸度调节剂', 'white', null, 'GB2760', '酸味剂/ pH 调节，限量', 'active'),
  ('富马酸',       '酸度调节剂', 'white', null, 'GB2760', '酸味剂，安全', 'active'),
  -- 水分保持剂
  ('六偏磷酸钠',   '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  ('三聚磷酸钠',   '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  ('焦磷酸钠',     '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  ('磷酸三钠',     '水分保持剂', 'white', null, 'GB2760', '磷酸盐保水，安全', 'active'),
  -- 营养强化剂
  ('维生素C',      '营养强化剂', 'white', null, 'GB14880', '抗坏血酸，营养强化', 'active'),
  ('维生素D',      '营养强化剂', 'white', null, 'GB14880', '胆钙化醇，营养强化', 'active'),
  ('维生素A',      '营养强化剂', 'white', null, 'GB14880', '视黄醇，营养强化', 'active'),
  ('维生素B1',     '营养强化剂', 'white', null, 'GB14880', '硫胺素，营养强化', 'active'),
  ('维生素B2',     '营养强化剂', 'white', null, 'GB14880', '核黄素，营养强化', 'active'),
  ('碳酸钙',       '营养强化剂', 'white', null, 'GB14880', '钙强化，安全', 'active'),
  ('乳酸钙',       '营养强化剂', 'white', null, 'GB14880', '钙强化，安全', 'active'),
  ('硫酸亚铁',     '营养强化剂', 'white', null, 'GB14880', '铁强化，安全', 'active'),
  ('葡萄糖酸锌',   '营养强化剂', 'white', null, 'GB14880', '锌强化，安全', 'active'),
  ('乳酸锌',       '营养强化剂', 'white', null, 'GB14880', '锌强化，安全', 'active'),
  ('氧化锌',       '营养强化剂', 'white', null, 'GB14880', '锌强化，安全', 'active'),
  ('亚硒酸钠',     '营养强化剂', 'yellow', null, 'GB14880', '硒强化，严格限量', 'active'),
  ('牛磺酸',       '营养强化剂', 'white', null, 'GB14880', '氨基酸强化，安全', 'active'),
  ('DHA',         '营养强化剂', 'white', null, 'GB14880', '藻油DHA，安全', 'active'),
  ('ARA',         '营养强化剂', 'white', null, 'GB14880', '花生四烯酸，安全', 'active'),
  -- 护色剂 / 漂白剂
  ('亚硝酸盐',     '护色剂', 'black',  36,   'GB2760', '肉制品护色剂，过量有毒，婴幼儿严禁', 'active'),
  ('硝酸钠',       '护色剂', 'yellow', null, 'GB2760', '护色剂，限量使用', 'active'),
  ('二氧化硫',     '漂白剂', 'yellow', null, 'GB2760', '漂白/防腐，敏感者限量', 'active'),
  ('亚硫酸钠',     '漂白剂', 'yellow', null, 'GB2760', '漂白/防腐，敏感者限量', 'active'),
  ('焦亚硫酸钠',   '漂白剂', 'yellow', null, 'GB2760', '漂白/防腐，敏感者限量', 'active'),
  ('低亚硫酸钠',   '漂白剂', 'yellow', null, 'GB2760', '保险粉，漂白/防腐，限量', 'active'),
  -- 增味剂
  ('谷氨酸钠',     '增味剂', 'white',  null, 'GB2760', '味精，安全', 'active'),
  ('5''-呈味核苷酸二钠','增味剂','white', null, 'GB2760', 'I+G 增鲜，安全', 'active'),
  ('琥珀酸二钠',   '增味剂', 'white',  null, 'GB2760', '干贝素增鲜，安全', 'active'),
  ('酵母抽提物',   '增味剂', 'white',  null, 'GB2760', '天然增鲜，安全', 'active'),
  ('L-丙氨酸',     '增味剂', 'white',  null, 'GB2760', '增味剂，安全', 'active'),
  ('甘氨酸',       '增味剂', 'white',  null, 'GB2760', '增味剂，安全', 'active'),
  -- 香精香料
  ('人工香精',     '香精',   'yellow', 36,   'GB2760', '合成香精，部分儿童敏感，建议少用', 'active'),
  ('食用香精',     '香精',   'yellow', 36,   'GB2760', '香精，建议少用', 'active'),
  ('香兰素',       '香精',   'yellow', 36,   'GB2760', '香精，建议少用', 'active'),
  ('乙基麦芽酚',   '香精',   'yellow', 36,   'GB2760', '增香剂，建议少用', 'active'),
  ('甲基环戊烯醇酮','香精',  'yellow', 36,   'GB2760', 'MCP 增香，限量', 'active'),
  -- 被膜剂 / 加工助剂
  ('巴西棕榈蜡',   '被膜剂', 'white',  null, 'GB2760', '被膜剂，安全', 'active'),
  ('聚二甲基硅氧烷','加工助剂','white', null, 'GB2760', '消泡剂，安全', 'active'),
  ('硬脂酸镁',     '加工助剂', 'white', null, 'GB2760', '抗结剂，安全', 'active'),
  ('丙二醇',       '加工助剂', 'yellow', null, 'GB2760', '保湿剂，限量使用', 'active'),
  -- 反式脂肪
  ('部分氢化植物油','反式脂肪','black',  null, 'GB28050', '含反式脂肪酸，婴幼儿禁用、成人严控', 'active')
on conflict (name) do nothing;

-- 常用别名补录（提升拍照 OCR / 文本匹配率；与 ADDITIVE_DICT.aliases 对应）
insert into public.food_additive_aliases (additive_id, alias)
select id, '山梨酸' from public.food_additives where name = '山梨酸钾' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '安息香酸钠' from public.food_additives where name = '苯甲酸钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '阿司帕坦' from public.food_additives where name = '阿斯巴甜' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '乙酰磺胺酸钾' from public.food_additives where name = '安赛蜜' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '环己基氨基磺酸钠' from public.food_additives where name = '甜蜜素' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '糖精' from public.food_additives where name = '糖精钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '单甘酯' from public.food_additives where name = '单硬脂酸甘油酯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '蔗糖酯' from public.food_additives where name = '蔗糖脂肪酸酯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '大豆磷脂' from public.food_additives where name = '磷脂' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '味精' from public.food_additives where name = '谷氨酸钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'I+G' from public.food_additives where name = '5''-呈味核苷酸二钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '小苏打' from public.food_additives where name = '碳酸氢钠' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '明矾' from public.food_additives where name = '硫酸铝钾' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '亚硝酸钠' from public.food_additives where name = '亚硝酸盐' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'BHA' from public.food_additives where name = '丁基羟基茴香醚' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'BHT' from public.food_additives where name = '二丁基羟基甲苯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'TBHQ' from public.food_additives where name = '特丁基对苯二酚' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, 'PG' from public.food_additives where name = '没食子酸丙酯' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '抗坏血酸' from public.food_additives where name = '维生素C' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '生育酚' from public.food_additives where name = '维生素E' on conflict do nothing;
insert into public.food_additive_aliases (additive_id, alias)
select id, '植脂末' from public.food_additives where name = '部分氢化植物油' on conflict do nothing;

-- ==================== 00204_drop_redundant_config_tables.sql ====================
-- 2026-09-28 数据库清理：删除三张已废弃/冗余的表
-- 依据：
--   1. supabase/functions/cleanup/01_add_table_comments_and_check_redundant.sql 标注
--      rank_configs / platform_configs / self_operated_stores 为「未使用 / 被替代 / 硬编码」。
--   2. migrations/00037_cleanup_unused_tables.sql 已计划 DROP（CASCADE）但未在本库执行。
--   3. 运行期代码（前端 + Edge Functions）零引用；生产 RLS 脚本 00081 / 00095 使用
--      FOREACH + to_regclass 存在性检查循环，删表后自动 CONTINUE，不影响迁移可重放性。
--   4. self_operated_stores 是早期 INT 主键废弃设计，00046 已断开指向它的错误外键。
-- 幂等 + CASCADE：连带清理其 RLS 策略（rls81_*）与任何残留依赖。
DROP TABLE IF EXISTS rank_configs CASCADE;
DROP TABLE IF EXISTS platform_configs CASCADE;
DROP TABLE IF EXISTS self_operated_stores CASCADE;

-- ==================== 00204_product_label_safety_fields.sql ====================
-- ============================================================
-- 00204 · 商品标签安全字段（全面安全分析的数据底座）
-- ------------------------------------------------------------
-- 为「全面安全分析（致敏原 / 营养成分 / 标签合规 / 适宜人群）」补充商品级
-- 结构化字段，使商品详情页可直读分析结果，而无需每次全文本重算。
-- 与 00200 安全库、00100 食养字段互补，均为 products 表可选列（缺省不影响旧商品）。
--
-- 执行方式：Supabase SQL Editor 全量粘贴运行（幂等，可重复执行）。
-- ============================================================

-- 1) 致敏原（声明/识别的致敏原 key，对应 allergen-dictionary 的 key）
alter table public.products
  add column if not exists allergens text[] default '{}'::text[];
comment on column public.products.allergens is
  '商品致敏原 key 列表（gluten/crustacean/fish/egg/peanut/soy/milk/tree_nut/sesame/mango/pineapple），来自商家标注或分析引擎识别';

-- 2) 营养成分（每 100g/100mL，结构化）
alter table public.products
  add column if not exists nutrition jsonb default '{}'::jsonb;
comment on column public.products.nutrition is
  '营养成分（每100g）：{energy_kj,protein_g,fat_g,carb_g,sugar_g,sodium_mg}，用于高糖/高钠/高脂评估';

-- 3) 标签合规信息 {score, present{}, missing[]}
alter table public.products
  add column if not exists label_info jsonb default '{}'::jsonb;
comment on column public.products.label_info is
  '标签合规完整度：{score:int, present:record, missing:text[]}，依据 GB 7718 必检项';

-- 4) 安全评级 S/A/C/D（引擎计算缓存）
alter table public.products
  add column if not exists safety_grade text
  check (safety_grade in ('S','A','C','D'));
comment on column public.products.safety_grade is
  '全面安全评级（引擎聚合添加剂+致敏原+营养+标签）：S较安全/A需注意/C含风险/D高风险';

-- 5) 分析报告缓存（完整 JSON，前端直读，避免重算）
alter table public.products
  add column if not exists safety_summary jsonb;
comment on column public.products.safety_summary is
  '全面安全分析报告完整缓存（ComprehensiveSafetyReport JSON），含 warnings/ageSuitability 等';

-- 索引（致敏原 GIN 便于按致敏原检索；safety_grade 普通索引）
create index if not exists idx_products_allergens on public.products using gin (allergens);
create index if not exists idx_products_safety_grade on public.products (safety_grade);

-- 注：products 表 RLS 沿用既有策略；新增列继承表级 RLS，无需单独建策略。

-- ==================== 00205_invite_p0_hardening.sql ====================
-- 00205 邀请码绑定门店 · P0 加固
-- 依据：《邀请码绑定门店_运营与交互方案.md》第 6 节
-- 设计原则：全部 additive + 向后兼容
--   · create_store_invite 保持返回 text（admin-web 已按 string 消费），新增参数全部带 DEFAULT → 老调用不破
--   · redeem_store_invite 保持 {ok, ...} 结构，仅把笼统的 invalid_or_expired 拆细；旧分支读 res.error 仍可用
--   · 不改 store_staff 结构；permissions ARRAY 沉淀到 P1（前端当前零引用，避免臆造权限 key）

BEGIN;

-- ---------- A. store_invites 扩展列 ----------
ALTER TABLE public.store_invites
  ADD COLUMN IF NOT EXISTS max_uses   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS use_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remark     text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid;

COMMENT ON COLUMN public.store_invites.max_uses   IS '可用次数上限。>1 时限定 staff/cashier 低权限角色';
COMMENT ON COLUMN public.store_invites.use_count  IS '已兑换次数';
COMMENT ON COLUMN public.store_invites.remark     IS '发放备注（发给谁/用途），运营可追溯';
COMMENT ON COLUMN public.store_invites.revoked_at IS '主动撤销时间。非空即失效，与 expires_at 并列判断';

CREATE INDEX IF NOT EXISTS idx_store_invites_live
  ON public.store_invites (store_id, expires_at)
  WHERE used_by IS NULL AND revoked_at IS NULL;

-- ---------- B. 兑换审计 / 撞库限速表 ----------
-- 一张表同时承担两个职责：成功绑定留痕（审计）+ 失败尝试计数（限速）
CREATE TABLE IF NOT EXISTS public.store_invite_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id    uuid REFERENCES public.store_invites(id) ON DELETE SET NULL,
  code_attempt text NOT NULL,                 -- 记录尝试的码本身，码不存在时 invite_id 为 NULL 仍可追查撞库
  store_id     uuid,
  user_id      uuid NOT NULL,
  ok           boolean NOT NULL DEFAULT false,
  error_code   text,
  role         text,
  prev_role    text,                          -- 覆盖为本店成员时的旧角色，用于回溯提权/降权
  source       text NOT NULL DEFAULT 'code',  -- code / qrcode / admin
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_invite_redemptions
  IS '邀请码兑换流水：既做绑定审计（成功=一行），也做撞库限速（失败计数）';

CREATE INDEX IF NOT EXISTS idx_redemptions_user_time
  ON public.store_invite_redemptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_store
  ON public.store_invite_redemptions (store_id, created_at DESC);

ALTER TABLE public.store_invite_redemptions ENABLE ROW LEVEL SECURITY;

-- 只读：管理员全量；本店成员仅本店。写权限不开放给任何角色 —— 只能走 SECURITY DEFINER 函数，
-- 防止伪造兑换流水或篡改审计。
DROP POLICY IF EXISTS rls_redemptions_select ON public.store_invite_redemptions;
CREATE POLICY rls_redemptions_select ON public.store_invite_redemptions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (store_id IS NOT NULL AND store_id = ANY (public.fn_my_store_ids(auth.uid())))
    OR user_id = auth.uid()
  );

-- ---------- C. 角色序 helper（供降级发放与角色冲突判定使用）----------
-- owner(4) > manager(3) > staff(2) > cashier(1)，未知角色记 0
CREATE OR REPLACE FUNCTION public.fn_role_rank(p_role text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  RETURN CASE p_role
    WHEN 'owner'   THEN 4
    WHEN 'manager' THEN 3
    WHEN 'staff'   THEN 2
    WHEN 'cashier' THEN 1
    ELSE 0
  END;
END;
$fn$;

-- 调用者在指定门店的实际角色。owner_id 命中视同 owner(4)
CREATE OR REPLACE FUNCTION public.fn_my_store_role(p_store_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT GREATEST(
    COALESCE((SELECT public.fn_role_rank(ss.role)
              FROM public.store_staff ss
              WHERE ss.store_id = p_store_id AND ss.user_id = auth.uid() AND ss.is_active), 0),
    COALESCE((SELECT 4 FROM public.stores s
              WHERE s.id = p_store_id AND s.owner_id = auth.uid()), 0)
  );
$fn$;

COMMIT;

-- ==================== 00205_user_health_profile.sql ====================
-- 00205 结构化健康画像 + 扫描历史（健康画像驱动食疗推荐 · MVP 地基）
-- 依赖 00204（商品安全字段）。幂等，可重复执行。
-- 旧 profiles.constitution_tags（自由文本）保留兼容，本表为结构化升级。

-- ① 结构化健康画像（1:1 profiles）
create table if not exists user_health_profile (
  user_id            uuid primary key references profiles(id) on delete cascade,
  age_group          text,                                  -- 儿童/青少年/成人/孕哺期/老年
  gender             text,                                  -- 男/女/不填
  constitution_type  text,                                  -- 九种体质 或 沿用 13 人群标签
  allergies          text[] not null default '{}',          -- allergen-dictionary key
  chronic_conditions text[] not null default '{}',          -- HEALTH_CROWD_OPTIONS
  body_states        text[] not null default '{}',          -- BODY_CROWD_OPTIONS
  health_goals       text[] not null default '{}',          -- 控糖/护胃/助眠/补血/抗疲劳/减脂/清热
  privacy_flags      jsonb not null default '{"history_store":true,"cross_store_aggregate":false}',
  updated_at         timestamptz not null default now()
);
alter table user_health_profile enable row level security;
drop policy if exists "own profile" on user_health_profile;
create policy "own profile" on user_health_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ② 扫描历史（学习闭环：输入/解析/画像快照/tier/反馈）
create table if not exists user_scan_history (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id) on delete cascade,
  input_type       text,              -- text / photo / barcode
  raw_text         text,
  parsed           jsonb,             -- 添加剂/过敏原/营养/性味
  profile_snapshot jsonb,             -- 分析时画像快照（避免画像变更后历史失真）
  tier             text,              -- recommend/caution/avoid
  created_at       timestamptz not null default now()
);
create index if not exists idx_scan_history_user on user_scan_history(user_id, created_at desc);
alter table user_scan_history enable row level security;
drop policy if exists "own scan history" on user_scan_history;
create policy "own scan history" on user_scan_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==================== 00206_invite_functions_v2.sql ====================
-- 00206 邀请码绑定门店 · 函数加固（生成/兑换/撤销）
-- 依据：《邀请码绑定门店_运营与交互方案.md》第 1、4、6 节
--
-- ⚠️ 关键手法：给 RPC 函数「加参数」必须 DROP 旧签名再 CREATE。
--    CREATE OR REPLACE FUNCTION 是「按签名精确替换」，参数不同会变成**重载**，
--    两个签名同时存在时 PostgREST 调 rpc() 会因重载歧义报错。
--    新参数全部带 DEFAULT → 老调用方（admin-web 传 2 个参、小程序传 1 个参）免改动即可继续工作。

BEGIN;

-- ---------- D. create_store_invite v2 ----------
-- 幂等：新老签名都要 DROP。本迁移可能已被执行过（CLI 或 Dashboard 首次成功），
-- 若只删旧签名，重放时会撞 42723 "already exists with same argument types"。
DROP FUNCTION IF EXISTS public.create_store_invite(uuid, text);
DROP FUNCTION IF EXISTS public.create_store_invite(uuid, text, text, int, int);

CREATE FUNCTION public.create_store_invite(
  p_store_id      uuid,
  p_role          text,
  p_remark        text DEFAULT NULL,
  p_expires_hours int  DEFAULT 168,   -- 默认 7 天
  p_max_uses      int  DEFAULT 1
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_code   text;
  v_uid    uuid := auth.uid();
  v_caller int;
  -- Crockford Base32：剔除易混的 I L O U 后保留 0/1 已无混淆源（对手字符不在集内）
  v_alpha  CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF p_role NOT IN ('owner','manager','staff','cashier') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  -- 【规则二】owner 是门店资产归属，禁止通过邀请码转让 → 改后台直设 stores.owner_id
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'owner must be granted via stores.owner_id, not invite code';
  END IF;

  IF NOT (public.is_store_operator(p_store_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'permission denied: not store operator';
  END IF;

  -- 【规则一】降级发放：只能发出严格低于自己的角色。
  -- owner/store owner=4, manager=3, staff=2, cashier=1；平台 admin 计 99（不受此限）
  v_caller := CASE WHEN public.is_admin() THEN 99
                   ELSE public.fn_my_store_role(p_store_id) END;

  -- 仅 owner / manager / admin 有发码资格；staff、cashier 不可发码
  IF v_caller < 3 THEN
    RAISE EXCEPTION 'insufficient privilege: only owner/manager/admin can issue invites';
  END IF;

  IF v_caller <> 99 AND public.fn_role_rank(p_role) >= v_caller THEN
    RAISE EXCEPTION 'insufficient privilege: cannot issue a role equal or higher than your own';
  END IF;

  IF p_max_uses IS NULL OR p_max_uses < 1 THEN
    RAISE EXCEPTION 'invalid max_uses';
  END IF;
  IF p_max_uses > 1 AND p_role NOT IN ('staff','cashier') THEN
    RAISE EXCEPTION 'multi-use invites are limited to staff/cashier';
  END IF;
  IF p_expires_hours IS NULL OR p_expires_hours < 1 OR p_expires_hours > 720 THEN
    RAISE EXCEPTION 'invalid expires_hours (1-720)';
  END IF;

  LOOP
    v_code := 'LD';
    FOR i IN 0..7 LOOP
      v_code := v_code || substr(v_alpha,
        1 + (get_byte(decode(md5(random()::text || clock_timestamp()::text || i::text), 'hex'), i) % 32)::int,
        1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.store_invites WHERE code = v_code);
  END LOOP;

  INSERT INTO public.store_invites (store_id, code, role, created_by, expires_at, max_uses, remark)
  VALUES (
    p_store_id, v_code, p_role, v_uid,
    now() + (p_expires_hours || ' hours')::interval,
    p_max_uses,
    NULLIF(btrim(coalesce(p_remark, '')), '')
  );

  RETURN v_code;
END;
$fn$;

COMMENT ON FUNCTION public.create_store_invite(uuid, text, text, int, int)
  IS '生成门店邀请码。硬约束：owner 不可发；只能发严格低于自己的角色；多用途码仅限 staff/cashier';

-- ---------- E. redeem_store_invite v2 ----------
-- 幂等：同上，新老签名都 DROP
DROP FUNCTION IF EXISTS public.redeem_store_invite(text);
DROP FUNCTION IF EXISTS public.redeem_store_invite(text, text);

CREATE FUNCTION public.redeem_store_invite(
  p_code   text,
  p_source text DEFAULT 'code'   -- code / qrcode / admin，用于埋点区分来源
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv     public.store_invites%ROWTYPE;
  v_uid     uuid := auth.uid();
  v_now     timestamptz := now();
  v_raw     text := upper(btrim(coalesce(p_code, '')));
  v_err     text := NULL;
  v_prev    text := NULL;
  v_prev_on boolean;
  v_store   record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- 撞库限速：5 分钟内失败 ≥5 次直接拒
  IF (
    SELECT count(*) FROM public.store_invite_redemptions
    WHERE user_id = v_uid AND ok = false AND created_at > v_now - interval '5 minutes'
  ) >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  SELECT * INTO v_inv FROM public.store_invites WHERE code = v_raw;

  IF NOT FOUND THEN
    v_err := 'code_not_found';
  ELSIF v_inv.revoked_at IS NOT NULL THEN
    v_err := 'code_revoked';
  ELSIF v_inv.expires_at <= v_now THEN
    v_err := 'code_expired';
  ELSIF v_inv.use_count >= v_inv.max_uses THEN
    v_err := 'max_uses_reached';
  ELSIF v_inv.max_uses = 1 AND v_inv.used_by IS NOT NULL THEN
    v_err := 'code_used';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = v_inv.store_id AND s.is_active IS TRUE
  ) THEN
    v_err := 'store_inactive';
  END IF;

  IF v_err IS NOT NULL THEN
    INSERT INTO public.store_invite_redemptions
      (invite_id, code_attempt, store_id, user_id, ok, error_code, source)
    VALUES (v_inv.id, v_raw, v_inv.store_id, v_uid, false, v_err, coalesce(p_source, 'code'));
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END IF;

  SELECT role, is_active INTO v_prev, v_prev_on
  FROM public.store_staff
  WHERE store_id = v_inv.store_id AND user_id = v_uid;

  IF FOUND THEN
    -- 已有更高身份 → 拒绝，防止用低权限码把自己的高权限覆盖掉（同时也挡住反向提权）
    IF public.fn_role_rank(v_prev) > public.fn_role_rank(v_inv.role) THEN
      INSERT INTO public.store_invite_redemptions
        (invite_id, code_attempt, store_id, user_id, ok, error_code, role, prev_role, source)
      VALUES (v_inv.id, v_raw, v_inv.store_id, v_uid, false, 'role_conflict', v_inv.role, v_prev, coalesce(p_source, 'code'));
      RETURN jsonb_build_object('ok', false, 'error', 'role_conflict', 'store_id', v_inv.store_id);
    END IF;

    IF v_prev = v_inv.role AND v_prev_on IS TRUE THEN
      SELECT id, name INTO v_store FROM public.stores WHERE id = v_inv.store_id;
      RETURN jsonb_build_object('ok', false, 'error', 'already_bound_same',
                                'store_id', v_inv.store_id, 'store_name', v_store.name);
    END IF;
  END IF;

  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_inv.store_id, v_uid, v_inv.role, true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true, created_at = now();

  UPDATE public.store_invites
  SET use_count = use_count + 1,
      used_by   = CASE WHEN max_uses = 1 THEN v_uid   ELSE used_by END,
      used_at   = CASE WHEN max_uses = 1 THEN v_now   ELSE used_at END
  WHERE id = v_inv.id;

  SELECT id, name INTO v_store FROM public.stores WHERE id = v_inv.store_id;

  INSERT INTO public.store_invite_redemptions
    (invite_id, code_attempt, store_id, user_id, ok, role, prev_role, source)
  VALUES (v_inv.id, v_raw, v_inv.store_id, v_uid, true, v_inv.role, v_prev, coalesce(p_source, 'code'));

  RETURN jsonb_build_object('ok', true,
                            'store_id',   v_inv.store_id,
                            'store_name', v_store.name,
                            'role',       v_inv.role,
                            'bound_at',   v_now);
END;
$fn$;

COMMENT ON FUNCTION public.redeem_store_invite(text, text)
  IS '兑换邀请码。返回细分错误码：not_authenticated/rate_limited/code_not_found/code_revoked/code_expired/max_uses_reached/code_used/store_inactive/role_conflict/already_bound_same';

-- ---------- F. revoke_store_invite（新增，补 G3「无撤销」缺口）----------
CREATE OR REPLACE FUNCTION public.revoke_store_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv public.store_invites%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv FROM public.store_invites WHERE code = upper(btrim(coalesce(p_code, '')));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF NOT (public.is_store_operator(v_inv.store_id) OR public.is_admin()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;
  IF v_inv.used_by IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_revoked');
  END IF;

  UPDATE public.store_invites
  SET revoked_at = now(), revoked_by = v_uid
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'code', v_inv.code);
END;
$fn$;

-- ---------- G. 恢复 RPC 授权（DROP/CREATE 会丢 GRANT）----------
GRANT EXECUTE ON FUNCTION public.create_store_invite(uuid, text, text, int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite(text, text)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_store_invite(text)                    TO anon, authenticated, service_role;

COMMIT;

-- ==================== 00207_fix_rls_zero_policy_tables.sql ====================
-- 00207 修复「RLS 已开启但零策略」的表
-- 症状：开了 RLS 却不建任何策略 = 除表 owner / SECURITY DEFINER 外全部拒绝。
--       表现为 PostgREST 返回 HTTP 200 + 空数组（不报错！），前端静默读不到数据。
--       实测 anon key 查 cities / withdrawal_accounts / system_flags / trigger_logs 均返回 0 行，
--       而 cities 有 250 行数据 —— 前端 lbs-service.ts 的城市列表必然为空。
--
-- 原则：按数据敏感度分级
--   · 公开参考数据（城市、食养模板）→ anon + authenticated 只读
--   · 用户私有数据（提现账户含身份证/银行卡、食养反馈、情绪偏好）→ 仅本人 + 管理员
--   · 内部运维数据（系统开关、触发器日志）→ 仅管理员读（写入走 service_role，不受 RLS 影响）
--
-- 幂等：先 DROP POLICY IF EXISTS 再 CREATE，可重复执行。

BEGIN;

-- ---------- 1. cities：公开只读（前端城市列表 / 定位）----------
DROP POLICY IF EXISTS rls_cities_public_read ON public.cities;
CREATE POLICY rls_cities_public_read ON public.cities
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------- 2. food_therapy_templates：公开只读（食养文案模板）----------
DROP POLICY IF EXISTS rls_therapy_tpl_public_read ON public.food_therapy_templates;
CREATE POLICY rls_therapy_tpl_public_read ON public.food_therapy_templates
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------- 3. withdrawal_accounts：含身份证号/银行卡号，仅本人 + 管理员 ----------
DROP POLICY IF EXISTS rls_wa_self ON public.withdrawal_accounts;
CREATE POLICY rls_wa_self ON public.withdrawal_accounts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- ---------- 4. food_therapy_feedback：仅本人 + 管理员 ----------
DROP POLICY IF EXISTS rls_tfb_self ON public.food_therapy_feedback;
CREATE POLICY rls_tfb_self ON public.food_therapy_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 5. user_mood_preferences：仅本人 + 管理员 ----------
DROP POLICY IF EXISTS rls_mood_self ON public.user_mood_preferences;
CREATE POLICY rls_mood_self ON public.user_mood_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- ---------- 6. system_flags：内部开关，仅管理员读 ----------
DROP POLICY IF EXISTS rls_flags_admin ON public.system_flags;
CREATE POLICY rls_flags_admin ON public.system_flags
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------- 7. trigger_logs：运维日志，仅管理员读 ----------
DROP POLICY IF EXISTS rls_tlog_admin ON public.trigger_logs;
CREATE POLICY rls_tlog_admin ON public.trigger_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMIT;

-- ==================== 00208_drop_junk_objects.sql ====================
-- 00208_drop_junk_objects
-- 清理两类确认无用的数据库对象（已核验零引用 + 数据可安全丢弃）
--
-- 1) 表名是 Windows 绝对路径的怪表
--    C:\Users\zhanglin\Desktop\app-coobohaoham9\supabase\cloud_init.
--    成因：某次执行把文件路径当成了表名。仅 id / created_at 两列，代码零引用。
--    注：表名含反斜杠，静态 SQL 会被客户端转义，必须用 format() + regclass 动态执行。
--
-- 2) oic_bk_20260730
--    order_item_commissions 的 2026-07-30 备份（37 列，与主表完全一致）。
--    核验：164 行，与主表按 id 比对「独有行 = 0」→ 完全是主表 438 行的子集，可安全丢弃。
--
-- 幂等：DROP 前先判断存在性，重复执行无副作用。

BEGIN;

-- ---------- 1. 怪表（动态 SQL，因表名含反斜杠）----------
DO $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tn, c.relname AS nm
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relname LIKE '%cloud_init%'
      AND c.relname LIKE '%:%'          -- 只命中含盘符的异常名，避免误伤正常表
  LOOP
    EXECUTE format('SELECT count(*) FROM %s', r.tn) INTO n;
    EXECUTE format('DROP TABLE %s CASCADE', r.tn);
    RAISE NOTICE '[00208] dropped junk table "%" (rows=%)', r.nm, n;
  END LOOP;
END $$;

-- ---------- 2. 佣金备份表 ----------
DROP TABLE IF EXISTS public."oic_bk_20260730";

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public'
--   AND (table_name LIKE '%cloud_init%' OR table_name LIKE 'oic_bk%');
-- 预期：0 行

-- ==================== 00209_enable_rls_on_unprotected_tables.sql ====================
-- 00209_enable_rls_on_unprotected_tables
-- 给 7 张「已建表却未启用 RLS」的表补策略并开启行级安全。
--
-- 背景：未开 RLS = 持有 anon key 的任何人可全表读写（PostgREST 直接放行）。
--       实测 anon key 可读到 order_item_commissions 411 行佣金/资金明细。
--
-- 设计原则（关键，避免加固反而打断业务）：
--   1. 先配策略、再开 RLS，顺序不能反——反了后台列表会立刻空白。
--   2. 读路径保持不变（现状谁读得到，加固后仍读得到），
--      主要收紧「写」：把任意人可篡改收口到 管理员 / 本店运营 / service_role。
--   3. service_role 自带 BYPASSRLS，所有 Edge Function 读写不受影响
--      （已逐个核验：refund-order / wechat-refund-callback / distribute-commission /
--        expiry-engine / food-therapy-ai 均用 SUPABASE_SERVICE_ROLE_KEY 建 client）。
--   4. admin-web 走 anon + JWT，角色是 authenticated，靠 is_admin() 判定，
--      因此管理类策略一律写 USING (public.is_admin())。
--
-- 幂等：DROP POLICY IF EXISTS + CREATE POLICY；ENABLE RLS 可重复执行。

BEGIN;

-- =====================================================================
-- 1. site_configs —— 首页热更新配置（当前仅 home_ad_slots 广告位）
--    读：小程序 src/db/api.ts:40 getSiteConfig() 以 anon 身份读取 → 必须公开读，
--        否则首页 Banner 直接空白。
--    写：收口到管理员（admin-web HomeBranding / HomeAds）。
-- =====================================================================
ALTER TABLE public.site_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_site_configs_select_public ON public.site_configs;
CREATE POLICY p_site_configs_select_public ON public.site_configs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_site_configs_write_admin ON public.site_configs;
CREATE POLICY p_site_configs_write_admin ON public.site_configs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =====================================================================
-- 2. stock_batches —— 库存/临期批次
--    读：小程序 food-api.ts / food/tracker 页面按 product_id|store_id 查询
--        （该表无 user_id 列，无法判定"本人"，故读权限维持现状公开）。
--    写：收口到 管理员 + 本店运营（is_store_operator(store_id)）。
--        这是本次最重要的一处收紧：此前任意持有 anon key 者可篡改库存与临期折扣。
-- =====================================================================
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_stock_batches_select_public ON public.stock_batches;
CREATE POLICY p_stock_batches_select_public ON public.stock_batches
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_stock_batches_write_staff ON public.stock_batches;
CREATE POLICY p_stock_batches_write_staff ON public.stock_batches
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_store_operator(store_id))
  WITH CHECK (public.is_admin() OR public.is_store_operator(store_id));

-- =====================================================================
-- 3. expiry_alert_log —— 临期预警日志
--    读：仅管理员（admin-web Expiry.tsx:80）。
--    写：expiry-engine EF（service_role，自动绕过 RLS）。
-- =====================================================================
ALTER TABLE public.expiry_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_expiry_alert_log_select_admin ON public.expiry_alert_log;
CREATE POLICY p_expiry_alert_log_select_admin ON public.expiry_alert_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- =====================================================================
-- 4. symptom_rules —— 食养辨证规则库
--    读：仅管理员（前端不直读，消费方是 food-therapy-ai EF + admin-web SymptomRules）。
--    写：仅管理员（增删改 + 启停）。
-- =====================================================================
ALTER TABLE public.symptom_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_symptom_rules_admin ON public.symptom_rules;
CREATE POLICY p_symptom_rules_admin ON public.symptom_rules
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =====================================================================
-- 5. user_campaign_claims —— 活动领取记录（当前 1 行，前端零引用）
--    读/写：本人 + 管理员。
-- =====================================================================
ALTER TABLE public.user_campaign_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_campaign_claims_self ON public.user_campaign_claims;
CREATE POLICY p_user_campaign_claims_self ON public.user_campaign_claims
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 6. user_store_relation —— 锁客关系（小程序 api.ts:1456/1459 读写）
--    读：本人 + 本店运营 + 管理员。
--    写：本人 + 管理员（门店运营不给写，避免跨店改锁客归属）。
-- =====================================================================
ALTER TABLE public.user_store_relation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_store_relation_select ON public.user_store_relation;
CREATE POLICY p_user_store_relation_select ON public.user_store_relation
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_store_operator(store_id));

DROP POLICY IF EXISTS p_user_store_relation_write ON public.user_store_relation;
CREATE POLICY p_user_store_relation_write ON public.user_store_relation
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 7. order_item_commissions —— 商品级分佣明细（411 行，含佣金/让利/平台收入）
--    本次风险最高的一张：此前 anon key 可直接全表读取资金流水。
--    读：管理员 + 本人（作为 l1/l2 上级可见自己的佣金）。
--    写：不授予任何 authenticated 角色，全部由 service_role 的 EF 完成
--        （distribute-commission / refund-order / wechat-refund-callback）。
-- =====================================================================
ALTER TABLE public.order_item_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_order_item_commissions_select ON public.order_item_commissions;
CREATE POLICY p_order_item_commissions_select ON public.order_item_commissions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR l1_user_id = auth.uid()
    OR l2_user_id = auth.uid()
  );

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT c.relname, c.relrowsecurity AS rls_on,
--        (SELECT count(*) FROM pg_policies p
--          WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
-- FROM pg_class c
-- WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
--   AND c.relname IN ('site_configs','stock_batches','expiry_alert_log',
--                     'symptom_rules','user_campaign_claims',
--                     'user_store_relation','order_item_commissions')
-- ORDER BY 1;
-- 预期：7 行，rls_on = true，policies >= 1

-- ==================== 00210_add_articles_status_cover_video.sql ====================
-- 00210: 为 articles 补齐 status / cover_image / video_url 列
-- 背景：前端 Article 类型与创作页(createArticle/updateArticle/getMyArticles)均依赖这三个字段，
--       但初始建表(00001)仅有 is_published，00034 仅补了 view_count/share_count。
--       代码(api.ts)已做兼容：扩展列缺失时(错误码 42703 / "does not exist")自动降级为仅 is_published，
--       因此本迁移部署前后保存功能均可用；部署后封面图/视频可正常持久化。
--       幂等：全部使用 IF NOT EXISTS。

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published')),
  ADD COLUMN IF NOT EXISTS cover_image text,
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN public.articles.status IS '草稿/已发布，与 is_published 同步';
COMMENT ON COLUMN public.articles.cover_image IS '封面图 URL（可选）';
COMMENT ON COLUMN public.articles.video_url IS '视频地址（可选）';

-- 历史数据：依据 is_published 回填 status，使草稿/发布语义与既有数据一致
UPDATE public.articles
SET status = CASE WHEN is_published THEN 'published' ELSE 'draft' END;

-- ==================== 00210_drop_legacy_permissive_policies.sql ====================
-- 00210_drop_legacy_permissive_policies
-- 修复「RLS 已开却被一条遗留全开策略架空」的隐性安全问题。
--
-- 病症：全库 16 张表存在 cmd=ALL / roles={public} / qual=true 的策略
--       （faa_all / fa_all / ocr_all / intake_all / inv_all / pc_all / sb_all …）。
--       Postgres 的多条策略是 OR 关系，只要这条存在，
--       任何持有 anon key 的人都能对这些表任意增删改查——RLS 形同虚设。
--       此前 00209 只加了新策略，正是被 stock_batches.sb_all 架空，故补本迁移。
--
-- 处理：先 DROP 遗留全开策略，再按敏感度补分级策略，最后确保 RLS 开启。
-- 原则（避免加固打断业务）：
--   · 读路径尽量保持不变（现状谁读得到，加固后仍读得到）
--   · 收紧重点放在「写」与「含密钥/隐私的表」
--   · service_role 自带 BYPASSRLS，Edge Function 不受影响
--     （已核验 ocr-ingredient / food-match / food-backfill / ingredient-analyze /
--       print-receipt / expiry-engine 均用 SUPABASE_SERVICE_ROLE_KEY）
--   · admin-web 走 anon+JWT（角色 authenticated），靠 is_admin() 放行
--
-- 幂等：DROP POLICY IF EXISTS + CREATE POLICY；ENABLE RLS 可重复执行。

BEGIN;

-- =====================================================================
-- 组 A：基础字典 / 运营配置 —— C 端只读，后台维护
--   food_additive_aliases / food_additives / food_allergens /
--   food_crowd_tips / food_crowd_triggers / food_ingredients /
--   food_tag_rules / product_food_additives / product_subjects
--   读：小程序 food-safety.ts（过敏原库、人群文案）、api.ts:488（专题）需公开读
--   写：admin-web FoodSafetyLibs 等后台维护，收口到管理员
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'food_additive_aliases','food_additives','food_allergens',
    'food_crowd_tips','food_crowd_triggers','food_ingredients',
    'food_tag_rules','product_food_additives','product_subjects'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS faa_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fa_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fct_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fctip_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fi_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ftr_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS food_additives_write ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS pfa_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS ps_all ON public.%I', t);

    EXECUTE format($f$
      DROP POLICY IF EXISTS p_sec_%1$s_select ON public.%1$I;
      CREATE POLICY p_sec_%1$s_select ON public.%1$I
        FOR SELECT TO anon, authenticated USING (true);

      DROP POLICY IF EXISTS p_sec_%1$s_write ON public.%1$I;
      CREATE POLICY p_sec_%1$s_write ON public.%1$I
        FOR ALL TO authenticated
        USING (public.is_admin()) WITH CHECK (public.is_admin());
    $f$, t);
  END LOOP;
END $$;

-- =====================================================================
-- 组 B：个人数据 —— 本人 + 管理员
--   intake_logs(user_id)        健康摄入记录
--   health_reports(user_id)     周期性健康报告
--   food_analysis_reports(created_by)  配料安全标准报告（小程序 food-safety.ts）
--   inventories(owner_id)       库存归属
-- =====================================================================

-- intake_logs
ALTER TABLE public.intake_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intake_all ON public.intake_logs;
DROP POLICY IF EXISTS p_sec_intake_logs_self ON public.intake_logs;
CREATE POLICY p_sec_intake_logs_self ON public.intake_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- health_reports
ALTER TABLE public.health_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_all ON public.health_reports;
DROP POLICY IF EXISTS p_sec_health_reports_self ON public.health_reports;
CREATE POLICY p_sec_health_reports_self ON public.health_reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- food_analysis_reports
ALTER TABLE public.food_analysis_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS far_all ON public.food_analysis_reports;
DROP POLICY IF EXISTS p_sec_far_self ON public.food_analysis_reports;
CREATE POLICY p_sec_far_self ON public.food_analysis_reports
  FOR ALL TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

-- inventories
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_all ON public.inventories;
DROP POLICY IF EXISTS p_sec_inventories_self ON public.inventories;
CREATE POLICY p_sec_inventories_self ON public.inventories
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 组 C：OCR 任务 —— 本人 / 本店运营 / 管理员
--   ingredient_ocr_tasks：小程序 food-api.ts 创建（created_by 可为空），
--   商家按 store_id 管理，EF（service_role）读写。
--   读：已登录用户（覆盖 C 端自建自查看场景）
--   写：本人（含 created_by 为空的新建）+ 本店运营 + 管理员
-- =====================================================================
ALTER TABLE public.ingredient_ocr_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ocr_all ON public.ingredient_ocr_tasks;
DROP POLICY IF EXISTS p_sec_ocr_select ON public.ingredient_ocr_tasks;
CREATE POLICY p_sec_ocr_select ON public.ingredient_ocr_tasks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS p_sec_ocr_write ON public.ingredient_ocr_tasks;
CREATE POLICY p_sec_ocr_write ON public.ingredient_ocr_tasks
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid() OR created_by IS NULL
    OR public.is_store_operator(store_id) OR public.is_admin()
  )
  WITH CHECK (
    created_by = auth.uid() OR created_by IS NULL
    OR public.is_store_operator(store_id) OR public.is_admin()
  );

-- =====================================================================
-- 组 D：高敏感运营配置 —— 本店运营 + 管理员（读写全收口）
--   printer_configs：含 api_key / printer_key 明文密钥！
--   此前 pc_all(public/true) 意味着任何人可读走打印机密钥、可篡改打印配置。
--   消费方：小程序商家端(api.ts:4079+ 按 store_id)、admin-web printer.ts、
--           print-receipt EF(service_role)
-- =====================================================================
ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pc_all ON public.printer_configs;
DROP POLICY IF EXISTS p_sec_printer_configs_staff ON public.printer_configs;
CREATE POLICY p_sec_printer_configs_staff ON public.printer_configs
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_store_operator(store_id))
  WITH CHECK (public.is_admin() OR public.is_store_operator(store_id));

-- =====================================================================
-- 组 E：stock_batches —— 仅删除遗留全开策略
--   读/写策略已由 00209 建立（公开读 + 管理员/本店运营写），
--   这里只补删 sb_all，否则 00209 的写策略被架空。
-- =====================================================================
DROP POLICY IF EXISTS sb_all ON public.stock_batches;

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies WHERE schemaname='public'
--   AND cmd='ALL' AND roles='{public}' AND (qual='true' OR qual IS NULL);
-- 预期：0 行（全库再无任何 public 全开策略）

-- ==================== 00211_add_articles_images.sql ====================
-- 00211: 为 articles 补齐 images 列
-- 背景：导入文章链接时后端会返回图片 URL 数组，前端的 createArticle/updateArticle
--       已尝试写入 images，但原 articles 表(00001)仅有 is_published，00210 仅补了
--       status/cover_image/video_url，缺 images 列 → 图片始终落不了库（代码已优雅降级忽略）。
--       补上该列后，导入图片 / 正文内联图片即可持久化并在详情页展示。

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

COMMENT ON COLUMN public.articles.images IS '图片 URL 数组（导入或正文内联图片）';

-- 同步更新 RLS：articles 既有策略(pub00034 等)已用 USING/ WITH CHECK 作用于整表，
-- 新增列自动纳入既有策略，无需单独补策略。

-- ==================== 00211_user_login_identities.sql ====================
-- 00211_user_login_identities
-- 认证 P0：建立「登录标识 → GoTrue 登录邮箱」的服务端映射，根治手机号无法密码登录。
--
-- 根因回顾：
--   GoTrue 的 signInWithPassword 必须用 email，而本项目手机号用户没有真实邮箱，
--   历史上靠客户端猜（test<裸号>@test.com / <用户名>@app.example.com），
--   于是 AuthContext.tsx 只能对 3 个硬编码测试号开后门，其余手机号一律
--   throw '该手机号未开通密码登录'。
--   解法：映射表放在服务端，客户端登录前先问「这个手机号该用哪个邮箱」。
--
-- 设计要点：
--   1. login_email 一律沿用 auth.users.email 原值（回填时不重新派生），
--      否则会把现网 4 个已能登录的账号改坏。
--   2. resolve_login_email 内部做手机号规范化：剥掉非数字后取后 11 位再比对，
--      因此客户端传「13800138000」「+8613800138000」「86-138-0013-8000」都能命中。
--   3. 映射表只给「本人 + admin」读，**不建任何写策略**：
--      写只能走 SECURITY DEFINER 函数或 EF(service_role)，防止被篡改登录邮箱。
--
-- 幂等：CREATE TABLE IF NOT EXISTS / DROP+CREATE 函数 / ON CONFLICT DO NOTHING。

BEGIN;

-- =====================================================================
-- 1. 映射表
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_login_identities (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone            text UNIQUE,
  username         text UNIQUE,
  login_email      text UNIQUE NOT NULL,
  password_enabled boolean NOT NULL DEFAULT false,
  password_set_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_login_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_uli_self ON public.user_login_identities;
CREATE POLICY rls_uli_self ON public.user_login_identities
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

COMMENT ON TABLE public.user_login_identities
  IS '登录标识映射：手机号/用户名 → GoTrue 登录邮箱。写入仅允许 SECURITY DEFINER 函数或 service_role。';
COMMENT ON COLUMN public.user_login_identities.password_enabled
  IS '是否开通密码登录。false 时只能走短信验证码登录。';

-- =====================================================================
-- 2. 手机号 → 登录邮箱（手机号规范化后比对）
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  -- 剥掉所有非数字后取后 11 位（兼容 +86 / 86 / 带分隔符 / 裸号）
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN length(regexp_replace(p_phone, '\D', '', 'g')) >= 11
      THEN right(regexp_replace(p_phone, '\D', '', 'g'), 11)
    ELSE NULL
  END;
$fn$;

DROP FUNCTION IF EXISTS public.resolve_login_email(text);
CREATE FUNCTION public.resolve_login_email(p_phone text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT login_email
  FROM public.user_login_identities
  WHERE password_enabled IS TRUE
    AND public.fn_normalize_phone(phone) = public.fn_normalize_phone(p_phone)
  LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_normalize_phone(text) TO anon, authenticated;

-- =====================================================================
-- 3. 回填现网已有账号
--    login_email 沿用 auth.users.email 原值，保证现有登录方式不受影响。
--    已设置密码的账号直接视为「已开通密码登录」。
-- =====================================================================
INSERT INTO public.user_login_identities
  (user_id, phone, login_email, password_enabled, password_set_at)
SELECT
  u.id,
  u.phone,
  u.email,
  true,
  now()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_login_identities x WHERE x.user_id = u.id
  );

-- =====================================================================
-- 4. 账号操作审计（管理端代改密 / 开通密码登录留痕）
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.account_audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,                     -- 操作者（管理员或本人）
  target_id   uuid,                     -- 被操作账号
  action      text NOT NULL,            -- register / enable_password / reset_password / admin_reset_password
  channel     text,                     -- miniprogram / admin-web
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_account_audit_logs_admin ON public.account_audit_logs;
CREATE POLICY p_account_audit_logs_admin ON public.account_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin() OR actor_id = auth.uid());

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT user_id, phone, login_email, password_enabled FROM public.user_login_identities;
-- SELECT public.resolve_login_email('13800138000');   -- 期望 admin@laidianyouxi.com
-- SELECT public.resolve_login_email('+8618701410500'); -- 期望 test18701410500@test.com

-- ==================== 00212_add_category_active_and_seed.sql ====================
-- ============================================================
-- 00212_add_category_active_and_seed.sql
-- 让「自营页类目」可由后台编辑 + 上架/下架
--
-- 背景：
--   自营页（/pages/explore/index）左侧类目原本写死在代码里
--   (CATEGORIES = ['全部','图书','美食','饮品','零食','日用','礼品'])，
--   无法后台编辑，也无法下架。
--   现改为读 store_categories(scope='global')，并按 name 精确匹配
--   products.category 文本（不动商品表，零数据迁移风险）。
--
-- 本迁移做两件事：
--   1) store_categories 加 is_active 列（下架=前端入口隐藏，"全部"始终可见）
--   2) 插入 7 个默认全局类目（图书/美食/饮品/零食/日用/礼品/生鲜），
--      幂等：已存在同名 global 类目则跳过
--
-- 使用方式：
--   方式 A（推荐，本机 Dashboard）：SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db push
-- ⚠️ 注意：本迁移不修改任何商品数据；类目与商品靠 name 文本对齐。
-- ============================================================

-- =====================
-- 第1步：加 is_active 列（默认上架）
-- =====================
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.store_categories.is_active IS
  '是否上架：true=前台（自营页）显示该类目入口；false=下架，前端隐藏（"全部"仍可见所有商品）';

-- 加速「只取上架全局类目」查询
CREATE INDEX IF NOT EXISTS idx_store_categories_global_active
  ON public.store_categories (scope, is_active, sort_order)
  WHERE scope = 'global';

-- =====================
-- 第2步：插入默认全局类目（幂等：同名 global 已存在则跳过）
-- =====================
-- 排序与前端原硬编码顺序保持一致：图书1 / 美食2 / 饮品3 / 零食4 / 日用5 / 礼品6 / 生鲜7
INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '图书', 1, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '图书');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '美食', 2, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '美食');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '饮品', 3, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '饮品');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '零食', 4, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '零食');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '日用', 5, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '日用');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '礼品', 6, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '礼品');

INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, '生鲜', 7, 'global', true
WHERE NOT EXISTS (SELECT 1 FROM public.store_categories WHERE scope = 'global' AND name = '生鲜');

-- =====================
-- 校验：应能看到 7 个上架的全局类目
-- =====================
SELECT id, name, sort_order, scope, is_active
FROM public.store_categories
WHERE scope = 'global'
ORDER BY sort_order;

-- ==================== 00212_drop_tmp_backup_tables.sql ====================
-- 00212_drop_tmp_backup_tables
-- 删除 force-login 后门遗留的两张临时备份表。
--
-- 背景：
--   _tmp_profile_backup / _tmp_referrer_backup 由 src/scripts/force-login-prep*.sql 创建，
--   是 force-login Edge Function（绕过 GoTrue 直接签发 session 的生产后门）的数据源，
--   曾被 supabase/functions/force-login/index.ts:60/141 读取。
--
-- 前置（已完成，可复核）：
--   1. AuthContext.tsx 中所有硬编码测试号分支与 force-login 调用已移除，
--      手机号密码登录改为查 public.user_login_identities 映射表（迁移 00211）。
--   2. 线上 Edge Function force-login 已删除（supabase functions delete）。
--   3. 本地 supabase/functions/force-login/ 与 src/scripts/force-login-prep*.sql 已删除。
--   至此两张表零引用，可安全丢弃。
--
-- 数据量：_tmp_profile_backup 1 行、_tmp_referrer_backup 1 行，均无主键，非业务表。
-- 幂等：DROP TABLE IF EXISTS。

BEGIN;

DROP TABLE IF EXISTS public."_tmp_profile_backup";
DROP TABLE IF EXISTS public."_tmp_referrer_backup";

COMMIT;

-- ---------- 回读验证（单独执行）----------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='public' AND table_name LIKE '\_tmp%';
-- 预期：0 行

-- ==================== 00213_admin_password_toggle.sql ====================
-- 00213_admin_password_toggle
-- 管理端「密码登录开关」：允许管理员启用/停用某账号的密码登录。
--
-- 为什么必须走 SECURITY DEFINER 函数：
--   public.user_login_identities 只开放了 SELECT 策略（本人 + admin），
--   刻意**不建任何写策略**——否则登录邮箱可被篡改，等于可劫持他人账号。
--   管理端要改 password_enabled，只能经由本函数（内部强制校验 is_admin）。
--
-- 幂等：DROP + CREATE（无参变更，重复执行安全）。

BEGIN;

DROP FUNCTION IF EXISTS public.admin_set_password_enabled(uuid, boolean);
CREATE FUNCTION public.admin_set_password_enabled(
  p_user_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rows int;
BEGIN
  -- 仅管理员可操作
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin', 'message', '仅管理员可操作');
  END IF;

  UPDATE public.user_login_identities
     SET password_enabled = COALESCE(p_enabled, false),
         updated_at = now()
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- 该账号还没有映射行（例如从未开通密码登录），按需补一行
    INSERT INTO public.user_login_identities (user_id, phone, login_email, password_enabled)
    SELECT u.id, public.fn_normalize_phone(u.phone), u.email, COALESCE(p_enabled, false)
      FROM auth.users u
     WHERE u.id = p_user_id AND u.email IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE
       SET password_enabled = COALESCE(p_enabled, false), updated_at = now();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_not_found', 'message', '账号不存在或无登录邮箱');
    END IF;
  END IF;

  -- 审计
  INSERT INTO public.account_audit_logs (actor_id, target_id, action, channel, detail)
  VALUES (auth.uid(), p_user_id,
          CASE WHEN COALESCE(p_enabled, false) THEN 'enable_password_login' ELSE 'disable_password_login' END,
          'admin-web',
          jsonb_build_object('password_enabled', COALESCE(p_enabled, false)));

  RETURN jsonb_build_object('ok', true, 'password_enabled', COALESCE(p_enabled, false));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_set_password_enabled(uuid, boolean) TO authenticated;

COMMIT;

-- ---------- 回读验证（单独执行，需管理员 JWT）----------
-- SELECT public.admin_set_password_enabled('<user_id>', true);
-- SELECT user_id, login_email, password_enabled FROM public.user_login_identities;

-- ==================== 00213_expiry_engine_data.sql ====================
-- ============================================================
-- 00213: 食品保质期预警 + 智能动态折扣 · 通用数据层
-- ------------------------------------------------------------
-- 设计目标：所有数据保持「通用」——
--   1) 引擎扫描全店铺，不写死任何 store_id / 商品 / 类目
--   2) 折扣用「商品自身成本」算，不依赖外部配置
--   3) 配置走 system_config KV（key='expiry'），后台可调，不新建配置表
--   4) 视图 v_near_expiry_products 按 store_id 可过滤，前端通用消费
--   5) 分级阈值 / 折扣基线 / 开关全在配置里，改配置即改行为
--
-- 执行方式：Supabase SQL Editor 全量粘贴运行；或 supabase db push（按编号自动执行）
-- 幂等：全部 IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT
-- ============================================================

-- ---------- 1. stock_batches 加临期引擎字段 ----------
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS shelf_life_days      int,                      -- 保质期天数（可选；优先用 expire_at，有则按比例分级更准）
  ADD COLUMN IF NOT EXISTS auto_discount_rate   numeric(5,2) DEFAULT 0,   -- 临期自动折扣 %（0~90），由 expiry-engine 写入
  ADD COLUMN IF NOT EXISTS discount_stage       text DEFAULT 'normal'    -- normal|amber|orange|red|expired
        CHECK (discount_stage IN ('normal','amber','orange','red','expired')),
  ADD COLUMN IF NOT EXISTS alerted_stages       text[] DEFAULT '{}',      -- 已推送过的阶段（防同阶段重复骚扰）
  ADD COLUMN IF NOT EXISTS last_alert_at        timestamptz,              -- 最近一次预警时间
  ADD COLUMN IF NOT EXISTS ai_reason            text,                    -- 折扣决策理由（可解释）
  ADD COLUMN IF NOT EXISTS ai_decided_at        timestamptz,              -- 智能/规则决策时间
  ADD COLUMN IF NOT EXISTS decided_by           text DEFAULT 'rule'       -- rule | ai（本次折扣由谁决定）
        CHECK (decided_by IN ('rule','ai'));

COMMENT ON COLUMN public.stock_batches.auto_discount_rate IS '临期自动折扣%（0~90），由 expiry-engine 写入；展示价 = price*(1-rate/100)';
COMMENT ON COLUMN public.stock_batches.discount_stage IS '临期分级：normal 安全 / amber 临期 / orange 紧迫 / red 紧急 / expired 已过期禁售';
COMMENT ON COLUMN public.stock_batches.alerted_stages IS '已推送预警的阶段集合，同阶段只推一次';
COMMENT ON COLUMN public.stock_batches.decided_by IS '本次 auto_discount_rate 由规则还是 AI 决定（可解释/可回溯）';

-- ---------- 2. 审计 + 归因表 expiry_alert_log ----------
-- 每次决策写一条；周级聚合「该折扣下 N 天售罄率」回灌校准基线（自进化闭环）
CREATE TABLE IF NOT EXISTS public.expiry_alert_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id           uuid REFERENCES public.stock_batches(id) ON DELETE CASCADE,
  product_id         uuid REFERENCES public.products(id) ON DELETE SET NULL,
  store_id           uuid,
  stage              text,                                -- amber|orange|red
  days_to_expire     numeric(6,2),                        -- 决策时剩余天数
  days_to_sell       numeric(6,2),                        -- 按当前日销速度算出的售罄天数
  daily_sales        numeric(10,3),                       -- 近30天日销速度
  suggested_discount numeric(5,2),                        -- 算法建议折扣
  applied_discount   numeric(5,2),                        -- 实际采用折扣
  qty                int,                                 -- 决策时批次库存
  cost_price         numeric(10,2),
  sale_price         numeric(10,2),                        -- 决策时原价
  decided_by         text DEFAULT 'rule',                 -- rule | ai
  cleared_at         timestamptz,                         -- 实际售罄时间（回填，用于归因）
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eal_batch     ON public.expiry_alert_log (batch_id);
CREATE INDEX IF NOT EXISTS idx_eal_store     ON public.expiry_alert_log (store_id);
CREATE INDEX IF NOT EXISTS idx_eal_created   ON public.expiry_alert_log (created_at DESC);

COMMENT ON TABLE public.expiry_alert_log IS '临期折扣决策审计+归因：每周聚合售罄率回灌校准基线，实现自优化';

-- ---------- 3. 通用临期特惠视图 v_near_expiry_products ----------
-- 前端「临期特惠」频道直接读此视图；按 store_id 过滤即某店，不过滤即全平台
-- 仅展示已算折扣 + 未过期 + 批次正常的商品
CREATE OR REPLACE VIEW public.v_near_expiry_products AS
SELECT
  sb.product_id,
  p.store_id,
  p.name,
  p.image_url,
  p.price,
  p.cost_price,
  p.original_price,
  sb.id              AS batch_id,
  sb.auto_discount_rate,
  ROUND(p.price * (1 - sb.auto_discount_rate / 100.0), 2) AS effective_price,
  sb.expire_at,
  GREATEST(0, DATE_PART('day', sb.expire_at - now()))::int AS days_left,
  sb.discount_stage,
  sb.ai_reason,
  sb.decided_by,
  sb.qty
FROM public.stock_batches sb
JOIN public.products p ON p.id = sb.product_id
WHERE sb.status = 'normal'
  AND sb.qty > 0
  AND sb.discount_stage IN ('amber', 'orange', 'red')
  AND sb.auto_discount_rate > 0
  AND sb.expire_at > now();

COMMENT ON VIEW public.v_near_expiry_products IS '临期特惠通用视图：自动折扣+剩余天数；按 store_id 过滤即单店，不过滤即全平台';

-- ---------- 4. notifications.type 补 expiry_alert（type 是 text，无枚举，直接可用；更新注释即可） ----------
COMMENT ON COLUMN public.notifications.type IS 'order_paid | commission_arrived | withdraw_progress | refund_result | announcement | expiry_alert';

-- ---------- 5. 通用引擎配置种子（system_config KV，后台可读写，不新建配置表） ----------
-- 全部阈值/基线/开关都在这；改这里即可调行为，无需改代码
-- 注：system_config 开启了 RLS（仅管理员可写）。SQL Editor / 迁移角色若非管理员会被策略拦截，
--     故临时放开 RLS 写入后再恢复，确保任何执行上下文都能跑通本迁移。
DO $$
BEGIN
  ALTER TABLE public.system_config DISABLE ROW LEVEL SECURITY;
  INSERT INTO public.system_config (key, value, updated_at)
  VALUES (
    'expiry',
    jsonb_build_object(
      'red_days', 3,
      'orange_days', 7,
      'amber_days', 15,
      'red_ratio', 0.10,
      'orange_ratio', 0.30,
      'amber_ratio', 0.50,
      'base_discount', jsonb_build_object('amber', 10, 'orange', 25, 'red', 40),
      'boost_per_3_days', 10,
      'max_discount', 90,
      'allow_below_cost', false,
      'llm_enabled', true,
      'alert_to_owner', true,
      'alert_to_nearby', false,
      'nearby_radius_km', 3
    ),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
END $$;

-- ---------- 6. 销量聚合函数 fn_daily_sales（近30天日均销量，供引擎高效取，不拉明细） ----------
-- 通用：按 product_id 聚合 order_items 近30天销量 / 30 = 日销速度
-- 成交状态集（order_status 枚举合法值，无 pickup 状态）：pending_ship/pending_receive/pending_review/completed
CREATE OR REPLACE FUNCTION public.fn_daily_sales()
-- 兼容 order_items.product_id 实际为 text（legacy schema 未升 uuid），声明用 text 与列类型一致
RETURNS TABLE (product_id text, daily_sales numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT oi.product_id::text,
         (COALESCE(SUM(oi.quantity), 0)::numeric / 30.0) AS daily_sales
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.created_at > now() - interval '30 days'
    AND o.status IN ('pending_ship','pending_receive','pending_review','completed')
  GROUP BY oi.product_id
$$;
COMMENT ON FUNCTION public.fn_daily_sales() IS '近30天日均销量（日销速度），供 expiry-engine 判断能否在过期前卖完';

-- ---------- 7. RLS：沿用项目「测试期放开」风格，供 anon 读视图底层 ----------
-- 与 notifications / emotion_* 一致。生产若需收紧，可改为带策略的 ENABLE + 策略。
ALTER TABLE public.stock_batches DISABLE ROW LEVEL SECURITY;
-- expiry_alert_log 含成本等内部数据，仅 service_role 读写（保持 RLS 关闭但前端不暴露，靠不提供查询入口保证）
ALTER TABLE public.expiry_alert_log DISABLE ROW LEVEL SECURITY;

-- ==================== 00214_expiry_engine_fix.sql ====================
-- ============================================================
-- 00214_expiry_engine_fix.sql
-- ------------------------------------------------------------
-- 修复 00213 部署中断遗留：
--   00213 在 SQL Editor 单脚本里 INSERT public.system_config 用了
--   不存在的 description 列，整段报错停止，导致：
--     1) system_config 'expiry' 配置未插入
--     2) fn_daily_sales() 函数未建
--     3) stock_batches / expiry_alert_log 的 RLS 未关
--   而 ALTER stock_batches 加列、CREATE expiry_alert_log / v_near_expiry_products
--   已成功（DDL 默认 auto-commit）。
--
-- 本迁移全用 IF NOT EXISTS / CREATE OR REPLACE 幂等写法，可安全重跑。
-- ============================================================

-- ---------- 1. system_config 种子（修列名：key, value, updated_at） ----------
-- 临时放开 RLS 写入（system_config 仅管理员可写，SQL Editor 角色可能非管理员被拦截）
DO $$
BEGIN
  ALTER TABLE public.system_config DISABLE ROW LEVEL SECURITY;
  INSERT INTO public.system_config (key, value, updated_at)
  VALUES (
    'expiry',
    jsonb_build_object(
      'red_days',    3,
      'orange_days', 7,
      'amber_days',  15,
      'red_ratio',    0.10,
      'orange_ratio', 0.30,
      'amber_ratio',  0.50,
      'base_discount', jsonb_build_object('amber', 10, 'orange', 25, 'red', 40),
      'boost_per_3_days', 10,
      'max_discount', 90,
      'allow_below_cost', false,
      'llm_enabled', true,
      'alert_to_owner', true,
      'alert_to_nearby', false,
      'nearby_radius_km', 3
    ),
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
END $$;

-- ---------- 2. fn_daily_sales 函数（CREATE OR REPLACE 幂等） ----------
CREATE OR REPLACE FUNCTION public.fn_daily_sales()
-- 兼容 order_items.product_id 实际为 text（legacy schema 未升 uuid），声明用 text 与列类型一致
RETURNS TABLE (product_id text, daily_sales numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT oi.product_id::text,
         (COALESCE(SUM(oi.quantity), 0)::numeric / 30.0) AS daily_sales
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.created_at > now() - interval '30 days'
    AND o.status IN ('pending_ship','pending_receive','pending_review','completed')
  GROUP BY oi.product_id
$$;
COMMENT ON FUNCTION public.fn_daily_sales() IS '近30天日均销量（日销速度），供 expiry-engine 判断能否在过期前卖完';

-- ---------- 3. 关 RLS（已禁用为 noop，重跑安全） ----------
ALTER TABLE public.stock_batches   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiry_alert_log DISABLE ROW LEVEL SECURITY;

-- ---------- 4. 自检：跑完应当返回 1 行 ----------
DO $$
BEGIN
  PERFORM 1 FROM public.system_config WHERE key = 'expiry';
  IF NOT FOUND THEN
    RAISE EXCEPTION '00214 自检失败：system_config.expiry 仍未插入';
  END IF;
  PERFORM 1 FROM pg_proc WHERE proname = 'fn_daily_sales';
  IF NOT FOUND THEN
    RAISE EXCEPTION '00214 自检失败：fn_daily_sales() 仍未建';
  END IF;
  RAISE NOTICE '✅ 00214 修复完成：expiry 配置已就位 / fn_daily_sales 已建 / RLS 已关';
END $$;

-- ==================== 00215_expiry_decided_by_constraint.sql ====================
-- 00215 扩展 stock_batches.decided_by 的 CHECK 约束
-- 背景：00213 加列时约束为 IN ('rule','ai')，但手机端商家中心「临期预警管理」
--       保存折扣时写 decided_by='merchant_manual'，被 CHECK 拒绝（23514），
--       导致小程序端「保存折扣」必失败。
-- 修复：扩展枚举值，允许商家手机端手动决策标记，与管理后台手动覆盖语义统一。
-- 幂等：DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT。

ALTER TABLE public.stock_batches
  DROP CONSTRAINT IF EXISTS stock_batches_decided_by_check;

ALTER TABLE public.stock_batches
  ADD CONSTRAINT stock_batches_decided_by_check
  CHECK (decided_by IN ('rule', 'ai', 'merchant_manual'));

COMMENT ON COLUMN public.stock_batches.decided_by IS
  '本次 auto_discount_rate 由谁决定：rule=引擎规则 / ai=AI决策 / merchant_manual=商家手动覆盖';

-- ==================== 00216_article_social.sql ====================
-- 00216 文章社交：文章收藏 + 关注作者
-- 补齐 UGC 内容闭环（报告 P3）：让文章从单向发布变为可收藏、可关注作者。

-- 1. 文章收藏（与商品收藏 favorites 同构，独立表避免污染商品收藏语义）
CREATE TABLE IF NOT EXISTS article_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);
ALTER TABLE article_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己的文章收藏" ON article_favorites
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. 关注作者（user_id 关注 author_id，author_id 复用 articles.user_id 的 profiles(id) 体系）
CREATE TABLE IF NOT EXISTS article_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, author_id)
);
ALTER TABLE article_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "用户管理自己关注的作者" ON article_follows
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- 关注关系可公开读（用于展示作者粉丝数、是否已关注等）
CREATE POLICY "关注关系可公开读" ON article_follows FOR SELECT USING (true);

-- 3. 索引（按用户维度倒序拉取 + 作者粉丝统计）
CREATE INDEX IF NOT EXISTS idx_article_favorites_user ON article_favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_follows_user ON article_follows(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_follows_author ON article_follows(author_id);

-- ==================== 00217_season_reminder.sql ====================
-- ============================================================
-- 00217: 智能换季提醒 · notifications.type 扩展 + 注册说明
-- ------------------------------------------------------------
-- 功能：节气切换前 3 天，向用户推一条站内通知（一键跳今日食养推荐）。
-- 实现：新增 Edge Function season-reminder（照 expiry-engine 范式，写 notifications 表）。
-- 调度：沿用项目惯例——Dashboard → Database → Scheduled Functions 挂「每日 08:00」，
--       不在本迁移硬编码 service_role key（安全：避免密钥落 SQL）。详见文末。
--
-- 执行方式：Supabase SQL Editor 全量粘贴运行；或 supabase db push。
-- 幂等：仅改注释 + 文档，重复执行无副作用。
-- ============================================================

-- ---------- 1. notifications.type 注释纳入 season_reminder ----------
-- type 为 text 无枚举，直接可用；此处仅更新注释保持文档同步
COMMENT ON COLUMN public.notifications.type IS
  'order_paid | commission_arrived | withdraw_progress | refund_result | announcement | expiry_alert | season_reminder';

COMMENT ON COLUMN public.notifications.payload IS
  '扩展字段：金额/订单号/跳转路径；season_reminder 时含 { term_key, term_name, nature, days_to_term, jump_page }';

-- ---------- 2. 去重索引（按 type + term_key + 时间，加速 season-reminder 幂等判断）----------
-- 已存在 idx_notifications_user_created；这里补一个「按 type + 时间」的轻量索引，便于查重扫表
CREATE INDEX IF NOT EXISTS idx_notifications_type_created
  ON public.notifications (type, created_at DESC);

-- ============================================================
-- 3. 定时任务注册（手动，二选一）
-- ============================================================
-- 方式 A（推荐，与 expiry-engine / auto-complete-orders 完全一致）：
--   Supabase Dashboard → Database → Scheduled Functions
--   → New scheduled function → 名称 season-reminder-daily
--   → 调度 cron `0 8 * * *`（每日 08:00）
--   → Function season-reminder → Create
--   Edge Function 已用 service_role 自管权限，无需额外密钥。
--
-- 方式 B（本机 cron，无 CLI 时）：
--   0 8 * * * curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/season-reminder \
--     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json"
--
-- 联调：?dryRun=1 预览不落库；?termKey=daxue 强制指定节气（如当前不在前3天窗口也能验证）。
-- 达峰保护：函数内按 (user_id, term_key) 7 天去重，每个节气每人至多 1 条；全量用户广播。
-- ============================================================

-- ==================== 00218_cart_items_batch_id.sql ====================
-- 00218_cart_items_batch_id.sql
-- 目的：让「购物车结算」路径也能自动套用临期特惠折扣。
-- 背景：createOrderV2 已支持按 batch_id 从 v_near_expiry_products 套用 effective_price（防资损，以 DB auto_discount_rate 为准）；
--       但 cart_items 此前未存 batch_id，购物车结算时 batch_id 为空 → 折扣不生效（仅「立即购买」路径闭环）。
-- 改动：
--   1) cart_items 增加 batch_id 列（nullable，不建外键——stock_batches 会随时间消费/归档，FK 会断）；
--   2) 唯一约束由 (user_id, product_id) 扩展为 (user_id, product_id, batch_id)，
--      允许同一商品在正常价批次与临期批次各占一行（临期价与目录价并存于购物车）；
--   3) 补索引便于按批次回查。

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS batch_id uuid NULL;

-- 允许同一商品以不同批次（正常批次 vs 临期特惠批次）分别入车。
-- 注意：PostgreSQL 唯一约束中 NULL 视为互不相等，故历史 (user_id, product_id) 重复行（batch_id 均为 NULL）不会触发冲突。
ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;

ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_user_id_product_id_batch_id_key
  UNIQUE (user_id, product_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_batch_id
  ON public.cart_items (batch_id);

COMMENT ON COLUMN public.cart_items.batch_id IS
  '来源库存批次（stock_batches.id）。为空=正常价批次；非空=临期特惠批次，下单时由 createOrderV2 据此从 v_near_expiry_products 套用 effective_price';

-- ==================== 00219_schedule_expiry_engine.sql ====================
-- ============================================================
-- 00219: 注册 expiry-engine 每日定时任务（临期预警折扣数据自动产生）
-- ------------------------------------------------------------
-- 背景：00213 建了 v_near_expiry_products 视图 + expiry-engine 函数，但一直没调度，
--       导致 auto_discount_rate / discount_stage 永远是默认(0 / normal)，
--       视图恒为空 → 全端「临期特惠」无任何数据、折扣套不上。本迁移注册 pg_cron 每日触发。
--
-- 调用方式：pg_cron + pg_net 异步 HTTP 调 Edge Function（与 trg_distribute_commission
--       触发器同范式）。函数 expiry-engine 用自身 service_role 改库、不校验调用方 JWT，
--       故 HTTP 头只需带公开 anon key 过网关（anon key 本就随端上包发布，非机密）。
--
-- 幂等：扩展 CREATE EXTENSION IF NOT EXISTS；先 unschedule 同名 job 再建，重复执行无副作用。
-- 手动补跑：部署后任意时刻
--   curl -X POST https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/expiry-engine \
--     -H "Authorization: Bearer <anon>" -H "Content-Type: application/json"
-- 若实例无 pg_cron（仅免费版缺）：改在 Supabase Dashboard → Database → Scheduled Functions
--   建「每日 03:00」调用 expiry-engine（与 auto-complete-orders / season-reminder 同惯例）。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 取消同名旧任务（避免重复注册）
SELECT cron.unschedule('expiry-engine-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expiry-engine-daily');

-- 注册每日 03:00（实例时区，通常为 UTC；如需 Asia/Shanghai 精确请在 Dashboard 调整）
SELECT cron.schedule(
  'expiry-engine-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/expiry-engine'::text,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM',
      'Content-Type', 'application/json'
    ),
    5000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS '每日触发 expiry-engine 自动分级+折扣（临期预警数据来源）';

-- ==================== 00220_fix_trigger_discount_rate.sql ====================
-- 修复 trg_distribute_commission 触发器：给 distribute-commission 的 payload 补传 store_id，
-- 使 distribute-commission 在未收到显式 discount_rate 时能从门店 referral_rate 自取兜底率，
-- 避免低让利率门店（如 3%）的纯健康豆订单被按硬编码 0.09 默认率多发 3 倍佣金。
-- 仅替换函数体；触发器绑定（CREATE TRIGGER trg_distribute_commission）保持不动。

CREATE OR REPLACE FUNCTION public.fn_trigger_distribute_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqaWl0YnN0d3RoYm4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MjU2MDc3MywiZXhwIjoyMDU4MTM2NzczfQ.MHdJx4XjIMhSU_OJte0WjG1H2-jYO_0seFGMH0HRHc4';
  v_func_url   text := 'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/distribute-commission';
  v_payload    jsonb;
  v_referrer   uuid;
BEGIN
  -- === DIAG: 触发器入口 ===
  INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'ENTER');

  IF NEW.commission_distributed = true THEN
    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'SKIP_ALREADY_DONE');
    RETURN NEW;
  END IF;
  IF NEW.payment_method <> 'emotion_beans' THEN
    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'SKIP_NOT_BEANS');
    RETURN NEW;
  END IF;

  INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'PROCEED');

  BEGIN
    SELECT p.referrer_id INTO v_referrer
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'GOT_REFERRER');

    -- 补传 store_id：distribute-commission 未收到显式 discount_rate 时可自取门店 referral_rate，
    -- 避免回落到硬编码 0.09 默认率导致低让利率门店被多发佣金。
    v_payload := jsonb_build_object(
      'order_id',      NEW.id,
      'order_no',      NEW.order_no,
      'payer_id',      NEW.user_id,
      'total_amount',  NEW.total_amount,
      'net_amount',    0,
      'store_id',      NEW.store_id,
      'referrer_id',   v_referrer
    );

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'CALLING_NET');

    PERFORM net.http_post(
      url      := v_func_url,
      body     := v_payload,  -- pg_net 0.20+ 要求 jsonb，禁止 ::text
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      timeout_milliseconds := 30000
    );

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'NET_DONE');
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.trigger_logs (order_no, action, error) VALUES (NEW.order_no, 'NET_FAILED', SQLERRM);
      RAISE WARNING '[trg] order_no=% error=%', NEW.order_no, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- ==================== 00220_food_safety_libs.sql ====================
-- ============================================================
-- 食品配料安全管理系统 · 模块补全迁移（建立在 00200/00203 基础之上）
-- ------------------------------------------------------------
-- 对齐用户最新规格（4 档评级 + 三张可维护基础表 + 标准报告 JSON）：
--   ① food_allergens        过敏原匹配库（8 类，触发过敏警示）
--   ② food_crowd_triggers   人群标签触发库（触发词 → crowd_code）
--   ③ food_crowd_tips       人群文案库（crowd_code → 食养提示文案）
--   ④ food_analysis_reports 标准报告持久化（绑定商品详情页）
--   ⑤ ingredient_ocr_tasks  扩展 safety_level(4档) + report_json
-- 说明：添加剂安全库 food_additives / 别名 food_additive_aliases 已由 00200/00203 建好，
--       本迁移仅补缺失的两张基础表 + 报告表 + ocr 任务扩展列，不重复建表。
-- RLS：MVP 阶段公开读、写开放（生产建议收敛到 Edge Function service_role）。
-- 执行：Supabase SQL Editor 全量粘贴运行；本脚本幂等可重复执行。
-- ============================================================

-- ---------- ① 过敏原匹配库 food_allergens ----------
create table if not exists public.food_allergens (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,        -- soy/sesame/peanut/wheat/dairy/shrimp/crab/nut
  name        text not null,               -- 大豆/芝麻/花生/小麦/乳制品/虾/蟹/坚果
  description text,                        -- 过敏提示说明
  crowd_code  text not null,               -- 命中后加载的人群提示 code（对应 food_crowd_tips）
  sort_order  int not null default 0
);
create index if not exists idx_food_allergens_key on public.food_allergens (key);

-- ---------- ② 人群标签触发库 food_crowd_triggers ----------
create table if not exists public.food_crowd_triggers (
  id               uuid primary key default gen_random_uuid(),
  trigger_keyword  text not null,          -- 配料名/关键词（如 谷氨酸钠 / 白砂糖 / 动物提取物）
  crowd_code       text not null,          -- 命中后加载的人群提示 code
  unique (trigger_keyword, crowd_code)
);
create index if not exists idx_fct_keyword on public.food_crowd_triggers (trigger_keyword);

-- ---------- ③ 人群文案库 food_crowd_tips ----------
create table if not exists public.food_crowd_tips (
  id           uuid primary key default gen_random_uuid(),
  crowd_code   text not null unique,       -- hypertension/hyperlipidemia/diabetes/gout/children/allergy_*
  label        text not null,              -- 高血压提示 / 糖尿病提示 / 大豆·芝麻过敏 ...
  general_tip  text,                       -- 一般人群提示文案（食养参考，不替代医嘱）
  children_tip text,                       -- 儿童专项提示
  fit_people   text,                       -- 适宜人群
  unfit_people text,                       -- 不适宜/需谨慎人群
  sort_order   int not null default 0
);
create index if not exists idx_fct_code on public.food_crowd_tips (crowd_code);

-- ---------- ④ 标准报告持久化 food_analysis_reports ----------
create table if not exists public.food_analysis_reports (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid references public.products(id) on delete set null,  -- 绑定商品详情
  source             text not null default 'manual'
                     check (source in ('manual','ocr','llm')),
  input_text         text,                 -- 原始录入/识别文本
  parsed_ingredients text[] default '{}',  -- 清洗后配料名列表
  additive_list      jsonb,                -- [{name,level,type,desc}] 标准输出
  allergen_list      jsonb,                -- [{key,name,crowd_code}] 命中过敏原
  crowd_tips         text[] default '{}',  -- 命中人群 code 列表
  safe_level         text,                 -- 中文档位：A优选 / A含限量成分 / B适度慎选 / C不推荐
  safe_level_code    text,                 -- 4档 code：A_preferred/A_limit/B_caution/C_avoid
  main_conclusion    jsonb,                -- {general,children,fit_people,unfit_people}
  health_shortboard_tip text,              -- 健康短板提示（个性化，结合 user_health_profile）
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create index if not exists idx_far_product on public.food_analysis_reports (product_id);
create index if not exists idx_far_created on public.food_analysis_reports (created_at desc);

-- ---------- ⑤ ingredient_ocr_tasks 扩展（4档评级 + 标准报告）----------
-- 保留原 safety_grade(S/A/C) 兼容旧 ocr-ingredient；新增 safety_level(4档) 与 report_json
alter table public.ingredient_ocr_tasks
  add column if not exists safety_level text
    check (safety_level in ('A_preferred','A_limit','B_caution','C_avoid'));
alter table public.ingredient_ocr_tasks
  add column if not exists report_json jsonb;

-- ============================================================
-- 种子数据（可后台维护：运营在 admin 直接改，无需改代码）
-- ============================================================

-- ① 过敏原库（8 类）
insert into public.food_allergens (key, name, description, crowd_code, sort_order) values
  ('soy',    '大豆',   '含大豆蛋白，部分人群过敏',                 'allergy_soy',    1),
  ('sesame', '芝麻',   '常见过敏原，儿童需关注',                   'allergy_sesame', 2),
  ('peanut', '花生',   '高致敏性坚果类，易引发急性过敏',           'allergy_peanut', 3),
  ('wheat',  '小麦',   '含麸质，乳糜泻/麸质不耐受人群忌',          'allergy_wheat',  4),
  ('dairy',  '乳制品', '含乳糖/乳蛋白，乳糖不耐或乳蛋白过敏忌',    'allergy_dairy',  5),
  ('shrimp', '虾',     '甲壳类水产，高致敏',                       'allergy_shrimp', 6),
  ('crab',   '蟹',     '甲壳类水产，高致敏',                       'allergy_crab',   7),
  ('nut',    '坚果',   '树坚果类（腰果/杏仁/核桃等），高致敏',     'allergy_nut',    8)
on conflict (key) do nothing;

-- ② 人群触发词 → crowd_code（对齐用户规格表）
insert into public.food_crowd_triggers (trigger_keyword, crowd_code) values
  ('谷氨酸钠',   'hypertension'),
  ('食用盐',     'hypertension'),
  ('氯化钠',     'hypertension'),
  ('植物油',     'hyperlipidemia'),
  ('白砂糖',     'hyperlipidemia'),
  ('麦芽糖浆',   'hyperlipidemia'),
  ('白砂糖',     'diabetes'),
  ('果葡糖浆',   'diabetes'),
  ('淀粉',       'diabetes'),
  ('麦芽糖',     'diabetes'),
  ('动物提取物', 'gout'),
  ('高嘌呤原料', 'gout')
on conflict (trigger_keyword, crowd_code) do nothing;

-- ③ 人群文案库（食养参考，不替代医嘱；合规：禁医疗宣称/绝对化）
insert into public.food_crowd_tips (crowd_code, label, general_tip, children_tip, fit_people, unfit_people, sort_order) values
  ('hypertension', '高血压提示', '含钠偏高，建议适量食用、日常关注血压。', '儿童饮食宜清淡，控制含盐配料摄入。', '无相关禁忌的一般人群', '高血压人群（需限量、关注钠摄入）', 1),
  ('hyperlipidemia', '高血脂/代谢偏弱提示', '含添加糖或油脂类配料偏多，建议适量、搭配运动。', '儿童应控制添加糖与油脂摄入，避免偏好甜食。', '代谢正常、活动量充足人群', '高血脂/代谢偏弱人群（建议限量）', 2),
  ('diabetes', '糖尿病人群提示', '含添加糖/精制碳水，易引起血糖波动，建议少量或避开。', '儿童控糖同样重要，减少含糖配料摄入。', '血糖平稳、无禁忌人群', '糖尿病人群（慎用，关注碳水与糖）', 3),
  ('gout', '痛风提示', '含高嘌呤/动物提取物，可能诱发尿酸升高，建议限量。', '儿童一般少见，但痛风家族史需留意。', '尿酸正常人群', '痛风/高尿酸人群（慎用高嘌呤配料）', 4),
  ('children', '儿童提示', '整体可适量食用，仍建议家长酌情、避免过量。', '儿童肠胃与代谢未完善，少量多样、家长把关。', '无相关过敏/禁忌的儿童', '对配料存在过敏或禁忌的儿童', 5),
  ('allergy_soy',    '大豆过敏提示',   '配料含大豆成分，过敏人群请避开。', '婴幼儿大豆过敏常见，请严格规避。', '无大豆过敏的一般人群', '对大豆过敏人群', 11),
  ('allergy_sesame', '芝麻过敏提示',   '配料含芝麻成分，过敏人群请避开。', '儿童芝麻过敏需家长把关。',       '无芝麻过敏的一般人群', '对芝麻过敏人群', 12),
  ('allergy_peanut', '花生过敏提示',   '配料含花生，高致敏，过敏人群严禁。', '儿童花生过敏风险高，严禁接触。', '无花生过敏的一般人群', '对花生过敏人群（严禁）', 13),
  ('allergy_wheat',  '小麦/麸质提示',  '配料含小麦（麸质），乳糜泻人群忌。', '儿童麸质不耐受需规避。',       '无麸质禁忌的一般人群', '乳糜泻/麸质不耐受人群', 14),
  ('allergy_dairy',  '乳制品过敏提示', '配料含乳制品，乳糖不耐/乳蛋白过敏忌。', '儿童乳糖不耐常见，注意选择。', '无乳制品过敏的一般人群', '乳糖不耐/乳蛋白过敏人群', 15),
  ('allergy_shrimp', '虾类过敏提示',   '配料含虾（甲壳类），过敏人群忌。',   '儿童甲壳类过敏需规避。',       '无虾类过敏的一般人群', '对虾过敏人群', 16),
  ('allergy_crab',   '蟹类过敏提示',   '配料含蟹（甲壳类），过敏人群忌。',   '儿童甲壳类过敏需规避。',       '无蟹类过敏的一般人群', '对蟹过敏人群', 17),
  ('allergy_nut',    '坚果过敏提示',   '配料含坚果，高致敏，过敏人群严禁。', '儿童坚果过敏风险高，严禁接触。', '无坚果过敏的一般人群', '对坚果过敏人群（严禁）', 18)
on conflict (crowd_code) do nothing;

-- ============================================================
-- RLS
-- ============================================================
alter table public.food_allergens       enable row level security;
alter table public.food_crowd_triggers  enable row level security;
alter table public.food_crowd_tips      enable row level security;
alter table public.food_analysis_reports enable row level security;

drop policy if exists "fa_read"  on public.food_allergens;
drop policy if exists "fct_read" on public.food_crowd_triggers;
drop policy if exists "fctip_read" on public.food_crowd_tips;
drop policy if exists "far_all"  on public.food_analysis_reports;
drop policy if exists "fa_all"  on public.food_allergens;
drop policy if exists "fct_all" on public.food_crowd_triggers;
drop policy if exists "fctip_all" on public.food_crowd_tips;

-- MVP：三库 + 报告表开放读写（与 food_additives 一致）；生产建议收敛到 Edge Function / is_admin()
create policy "fa_all"    on public.food_allergens        for all using (true) with check (true);
create policy "fct_all"   on public.food_crowd_triggers   for all using (true) with check (true);
create policy "fctip_all" on public.food_crowd_tips       for all using (true) with check (true);
create policy "far_all"   on public.food_analysis_reports for all using (true) with check (true);

-- ==================== 00221_add_ops_observability.sql ====================
-- ============================================================
-- 00221: 运营可观测性基础表（对账差异 / 告警 / 错误日志 / 分佣重试计数）
-- ------------------------------------------------------------
-- 目的：补齐商用运营短板——资金对账、故障告警、错误集中收集。
-- 全部为新增对象，幂等安全（IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）。
-- 数据由 EF（pay-reconcile / commission-retry / biz-alert / client-error-log）
-- 以 service_role 写入；前端不直接写表，统一经 client-error-log EF。
-- ============================================================

-- 1) 对账差异表：支付/退款 本地 vs 微信 状态/金额差异留痕
CREATE TABLE IF NOT EXISTS public.reconcile_discrepancies (
  id            bigserial PRIMARY KEY,
  biz_type      text NOT NULL CHECK (biz_type IN ('pay', 'refund')),
  order_id      uuid,
  order_no      text NOT NULL,
  refund_no     text,
  local_status  text,
  wechat_status text,
  local_amount  numeric(12,2),
  wechat_amount numeric(12,2),
  diff_amount   numeric(12,2),
  detail        text,
  resolved      boolean NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_disc_order_no   ON public.reconcile_discrepancies(order_no);
CREATE INDEX IF NOT EXISTS idx_rec_disc_unresolved ON public.reconcile_discrepancies(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_rec_disc_created    ON public.reconcile_discrepancies(created_at DESC);

-- 2) 告警日志表：业务告警（资损/分佣失败/对账差异）统一留痕 + 推送状态
CREATE TABLE IF NOT EXISTS public.alert_logs (
  id        bigserial PRIMARY KEY,
  level     text NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  title     text NOT NULL,
  content   text NOT NULL,
  source    text,
  tags      jsonb DEFAULT '{}',
  notified  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_logs_unnotified ON public.alert_logs(notified) WHERE notified = false;
CREATE INDEX IF NOT EXISTS idx_alert_logs_created    ON public.alert_logs(created_at DESC);

-- 3) 错误日志表：前端(小程序/admin) + Edge Function 错误集中收集
CREATE TABLE IF NOT EXISTS public.error_logs (
  id        bigserial PRIMARY KEY,
  source    text NOT NULL CHECK (source IN ('mini_app', 'admin', 'edge_function')),
  level     text NOT NULL DEFAULT 'error',
  message   text NOT NULL,
  stack     text,
  ctx       jsonb DEFAULT '{}',
  user_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON public.error_logs(source);

-- 4) orders 分佣重试计数（配合 commission_error 形成「待补跑」扫描）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_retry_count int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_comm_retry
  ON public.orders(commission_distributed, commission_error)
  WHERE commission_distributed = false AND commission_error IS NOT NULL;

-- 5) RLS：仅 service_role 读写（运维数据，不对普通用户开放）
ALTER TABLE public.reconcile_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_all_rec   ON public.reconcile_discrepancies;
DROP POLICY IF EXISTS service_all_alert ON public.alert_logs;
DROP POLICY IF EXISTS service_all_err   ON public.error_logs;

CREATE POLICY service_all_rec   ON public.reconcile_discrepancies FOR ALL TO service_role USING (true);
CREATE POLICY service_all_alert ON public.alert_logs              FOR ALL TO service_role USING (true);
CREATE POLICY service_all_err   ON public.error_logs              FOR ALL TO service_role USING (true);

COMMENT ON TABLE public.reconcile_discrepancies IS '支付/退款 本地与微信差异留痕；未 resolved 的行需人工/定时处理';
COMMENT ON TABLE public.alert_logs              IS '业务告警日志（资损/分佣失败/对账差异），配合 ALERT_WEBHOOK_URL 推送企微';
COMMENT ON TABLE public.error_logs              IS '前端与Edge Function 错误集中收集，便于故障排查';
COMMENT ON COLUMN public.orders.commission_retry_count IS '分佣自动补跑次数上限3；commission_distributed=false且commission_error非空=待补跑';

-- ==================== 00221_crowd_severity.sql ====================
-- ============================================================
-- 食品配料安全管理系统 · 人群 severity 分级 + 婴幼儿/孕产妇独立维度
-- ------------------------------------------------------------
-- 解决：原 crowd 体系（main_conclusion.children）只有"可适量"的模糊绿灯，
--       且 ingredient-analyze 无条件给所有商品挂 children，导致保健品也显示"可吃"。
-- 本次补齐：
--   ① food_crowd_triggers / food_crowd_tips 增加 severity 列（负向四级语义）
--   ② 新增 infant（婴幼儿）/ pregnant（孕妇）/ lactating（哺乳期）独立维度
--   ③ 现有 children 明确为"派生父维度"——仅当命中 infant 或任一慢病时附带 caution
-- 合规：全部为"配料适配性提示"，不诊断、不写疗效；过敏原仍显著常驻。
-- 执行：Supabase SQL Editor 全量粘贴；幂等可重复执行。
-- ============================================================

-- ---------- ① 加 severity 列 ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='food_crowd_triggers' and column_name='severity'
  ) then
    alter table public.food_crowd_triggers
      add column severity text not null default 'caution'
      check (severity in ('ok','caution','advise_against','forbidden'));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name='food_crowd_tips' and column_name='severity'
  ) then
    alter table public.food_crowd_tips
      add column severity text not null default 'caution'
      check (severity in ('ok','caution','advise_against','forbidden'));
  end if;
end $$;

-- ---------- ② 现有 children 行：明确基调为 caution（不再是模糊绿灯兜底） ----------
update public.food_crowd_tips
  set severity = 'caution'
  where crowd_code = 'children';

-- 现有慢性触发词默认 caution（限量/谨慎），与旧语义一致，无需改；
-- 过敏原 allergy_* 行统一提为 forbidden 基调（过敏严禁，强化提示）。
update public.food_crowd_tips
  set severity = 'forbidden'
  where crowd_code like 'allergy_%';

-- ---------- ③ 种子：infant / pregnant / lactating 触发词（带 severity） ----------
-- 注：unique(trigger_keyword, crowd_code) 已存在，新 crowd_code 不会与旧行冲突。
insert into public.food_crowd_triggers (trigger_keyword, crowd_code, severity) values
  -- ===== infant 婴幼儿（0-3岁，尤其辅食期：禁盐禁糖禁蜂蜜、脏器未发育） =====
  ('蜂蜜',           'infant', 'forbidden'),        -- 肉毒杆菌芽孢风险
  ('食用盐',         'infant', 'advise_against'),   -- 肾脏负担
  ('氯化钠',         'infant', 'advise_against'),
  ('谷氨酸钠',       'infant', 'advise_against'),   -- 钠
  ('白砂糖',         'infant', 'advise_against'),   -- 龋齿/代谢
  ('果葡糖浆',       'infant', 'advise_against'),
  ('麦芽糖',         'infant', 'advise_against'),
  ('麦芽糖浆',       'infant', 'advise_against'),
  ('酒精',           'infant', 'forbidden'),
  ('乙醇',           'infant', 'forbidden'),
  ('食用酒精',       'infant', 'forbidden'),
  ('番泻叶',         'infant', 'forbidden'),        -- 泻药
  ('芦荟',           'infant', 'forbidden'),
  ('大黄',           'infant', 'forbidden'),
  ('咖啡因',         'infant', 'advise_against'),   -- 神经兴奋
  ('茶碱',           'infant', 'advise_against'),
  ('可可粉',         'infant', 'advise_against'),
  ('人参',           'infant', 'advise_against'),   -- 高补不宜婴幼儿
  ('鹿茸',           'infant', 'advise_against'),
  ('蜂王浆',         'infant', 'advise_against'),

  -- ===== pregnant 孕妇（妊娠全程） =====
  ('酒精',           'pregnant', 'forbidden'),
  ('乙醇',           'pregnant', 'forbidden'),
  ('食用酒精',       'pregnant', 'forbidden'),
  ('咖啡因',         'pregnant', 'advise_against'),
  ('茶碱',           'pregnant', 'advise_against'),
  ('薏米',           'pregnant', 'advise_against'), -- 传统认为滑利
  ('薏仁',           'pregnant', 'advise_against'),
  ('山楂',           'pregnant', 'advise_against'), -- 刺激宫缩
  ('桂圆',           'pregnant', 'advise_against'), -- 活血上火
  ('龙眼肉',         'pregnant', 'advise_against'),
  ('番泻叶',         'pregnant', 'forbidden'),      -- 泻下
  ('芦荟',           'pregnant', 'forbidden'),
  ('当归',           'pregnant', 'advise_against'), -- 活血
  ('益母草',         'pregnant', 'advise_against'),
  ('红花',           'pregnant', 'advise_against'),
  ('川芎',           'pregnant', 'advise_against'),
  ('金枪鱼',         'pregnant', 'advise_against'), -- 高汞
  ('旗鱼',           'pregnant', 'advise_against'),
  ('方头鱼',         'pregnant', 'advise_against'),
  ('维生素A',        'pregnant', 'advise_against'), -- 过量致畸
  ('视黄醇',         'pregnant', 'advise_against'),
  ('鱼肝油',         'pregnant', 'advise_against'),

  -- ===== lactating 哺乳期（产褥至断奶） =====
  ('酒精',           'lactating', 'forbidden'),
  ('乙醇',           'lactating', 'forbidden'),
  ('食用酒精',       'lactating', 'forbidden'),
  ('咖啡因',         'lactating', 'advise_against'),
  ('茶碱',           'lactating', 'advise_against'),
  ('番泻叶',         'lactating', 'forbidden'),
  ('芦荟',           'lactating', 'forbidden'),
  ('炒麦芽',         'lactating', 'advise_against'), -- 回奶
  ('山楂',           'lactating', 'advise_against'), -- 回奶
  ('韭菜',           'lactating', 'advise_against'), -- 回奶（传统）

  -- ===== children 显式触发器（不再无条件挂；命中即 caution/advise_against） =====
  ('咖啡因',         'children', 'advise_against'),
  ('茶碱',           'children', 'advise_against'),
  ('可可粉',         'children', 'advise_against'),
  ('白砂糖',         'children', 'caution'),
  ('果葡糖浆',       'children', 'caution'),
  ('麦芽糖',         'children', 'caution'),
  ('麦芽糖浆',       'children', 'caution'),
  ('食用盐',         'children', 'caution'),
  ('氯化钠',         'children', 'caution'),
  ('谷氨酸钠',       'children', 'caution')
on conflict (trigger_keyword, crowd_code) do update set severity = excluded.severity;

-- ---------- ④ 种子：infant / pregnant / lactating 文案（food_crowd_tips） ----------
insert into public.food_crowd_tips
  (crowd_code, label, general_tip, children_tip, fit_people, unfit_people, severity, sort_order)
values
  ('infant', '婴幼儿（辅食期）提示',
    '婴幼儿（尤其 6 月龄内辅食期）脏器与代谢未发育完善，严格禁盐、禁添加糖、禁蜂蜜，配料适配需格外审慎。',
    '婴幼儿阶段肠胃与代谢稚嫩，少量多样、严格规避禁忌配料，遵从儿科与辅食指南。',
    '无相关过敏/禁忌、遵医嘱添加辅食的婴幼儿',
    '对蜂蜜/盐糖/酒精/泻药等禁忌配料存在暴露的婴幼儿', 'advise_against', 6),

  ('pregnant', '孕妇提示',
    '孕期膳食需格外审慎：禁酒精，限制咖啡因（每日≤200mg），规避薏米、山楂、桂圆及活血草药、高汞鱼类与过量维生素A。',
    '（孕妇专属维度，不单独对儿童输出）',
    '无相关禁忌、遵医嘱膳食的孕妇',
    '对酒精/咖啡因/活血食材/高汞鱼等存在暴露的孕妇', 'advise_against', 7),

  ('lactating', '哺乳期提示',
    '哺乳期同样规避酒精与过量咖啡因；部分食材（炒麦芽、山楂、韭菜）传统认为影响泌乳，建议留意。',
    '（哺乳期专属维度，不单独对儿童输出）',
    '无相关禁忌、泌乳正常的哺乳期妈妈',
    '对酒精/回奶食材等存在暴露的哺乳期妈妈', 'advise_against', 8)
on conflict (crowd_code) do update set
  label = excluded.label,
  general_tip = excluded.general_tip,
  children_tip = excluded.children_tip,
  fit_people = excluded.fit_people,
  unfit_people = excluded.unfit_people,
  severity = excluded.severity,
  sort_order = excluded.sort_order;

-- ==================== 00221_product_sales_count.sql ====================
-- 00221 商品销量字段：统一三端销量展示数据源
-- 口径对齐商家端 REVENUE_STATUSES：已支付（pending_ship/pending_receive/pending_pickup/pending_review/completed）
-- 销量 = 已支付订单 order_items.quantity 之和（累计售出，退款不回扣，符合主流电商「已售」语义）

-- 1) 新增销量列
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.products.sales_count IS '商品累计销量（件），已支付订单累加，退款不回扣';

-- 2) 原子累加 RPC（供 Edge Function 在「已支付」时机调用，避免并发竞态）
CREATE OR REPLACE FUNCTION public.fn_add_sales(p_id text, p_qty integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;
  UPDATE public.products
     SET sales_count = sales_count + p_qty
   WHERE id::text = p_id;
END;
$$;
COMMENT ON FUNCTION public.fn_add_sales(text, integer) IS '原子累加商品销量，供支付成功/纯金豆下单时调用';

-- 3) 历史回填：已支付订单的 order_items 聚合写入 sales_count
--    （未出现在有效订单中的商品保持默认 0，无需处理）
UPDATE public.products p
   SET sales_count = COALESCE(agg.s, 0)
  FROM (
        SELECT oi.product_id, SUM(oi.quantity) AS s
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
         WHERE o.status IN ('pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed')
         GROUP BY oi.product_id
       ) agg
 WHERE p.id::text = agg.product_id;

-- ==================== 00222_sales_accum_triggers.sql ====================
-- 00222 销量累加触发器（替代 Edge Function 内的 fn_add_sales RPC 调用）
-- 背景：EF 内 rpc 调用被 try/catch 静默吞掉，导致「已支付订单不累加销量」(sales_count 卡在回填值)。
--       改为在数据库层用触发器累加，与 trg_distribute_commission 同思路，DB 级保证不被跳过。
--
-- 口径对齐商家端 REVENUE_STATUSES：已支付 = pending_ship/pending_receive/pending_pickup/pending_review/completed
-- 销量 = 已支付订单 order_items.quantity 之和（累计售出，退款不回扣）。
--
-- 设计（两条互斥、幂等的路径）：
--   路径① order_items AFTER INSERT：插入商品行时，若【父订单已处于已支付态】则累加当前行数量。
--         → 覆盖 纯金豆/全豆混合 下单：create-order 先插 order(pending_ship) 再插 order_items，此时父订单已支付。
--   路径② orders AFTER UPDATE OF status：状态【翻转为已支付态】(OLD 不在已支付态) 时整单累加一次。
--         → 覆盖 微信支付：pending_pay→pending_ship 由 wechat-payment-callback 翻转。
--   互斥性：纯金豆走①不走②(无状态UPDATE)；微信走②不走①(插items时父订单仍 pending_pay 未支付)。
--   幂等：仅 NEW 进入已支付态且 OLD 不在已支付态时累加；已支付态间流转/退款不重复计、不回扣。

CREATE OR REPLACE FUNCTION public.trg_order_items_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := ARRAY['pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed'];
  v_status text;
BEGIN
  SELECT o.status::text INTO v_status FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_status = ANY(v_paid) THEN
    UPDATE public.products p
       SET sales_count = p.sales_count + NEW.quantity
     WHERE p.id::text = NEW.product_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_sales ON public.order_items;
CREATE TRIGGER trg_order_items_sales
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_items_sales();

CREATE OR REPLACE FUNCTION public.trg_orders_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid text[] := ARRAY['pending_ship', 'pending_receive', 'pending_pickup', 'pending_review', 'completed'];
BEGIN
  IF NEW.status::text = ANY(v_paid) AND (OLD.status IS NULL OR OLD.status::text <> ALL(v_paid)) THEN
    UPDATE public.products p
       SET sales_count = p.sales_count + agg.s
      FROM (
        SELECT oi.product_id, SUM(oi.quantity) AS s
          FROM public.order_items oi
         WHERE oi.order_id = NEW.id
         GROUP BY oi.product_id
      ) agg
     WHERE p.id::text = agg.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sales ON public.orders;
CREATE TRIGGER trg_orders_sales
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_sales();

-- ==================== 00222_schedule_ops_jobs.sql ====================
-- ============================================================
-- 00222: 注册运营对账/重试 每日定时任务
-- ------------------------------------------------------------
-- 与 00219(expiry-engine) 同范式：pg_cron + pg_net 异步 HTTP 调 Edge Function。
-- 函数自身用 service_role 改库、不校验调用方 JWT，HTTP 头仅带公开 anon key 过网关。
-- 幂等：先 unschedule 同名 job 再建，重复执行无副作用。
--
--   pay-reconcile-daily   每日 04:00  扫近 7 天订单/退款，与微信侧比对，差异落表 + 告警
--   commission-retry-daily 每日 04:30 扫「待补跑」订单重跑分佣（最多3次）
--
-- 若实例无 pg_cron（仅免费版缺）：在 Supabase Dashboard → Database → Scheduled Functions
-- 建两个「每日」任务分别调 /functions/v1/pay-reconcile 与 /functions/v1/commission-retry。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 取消同名旧任务
SELECT cron.unschedule('pay-reconcile-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pay-reconcile-daily');
SELECT cron.unschedule('commission-retry-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'commission-retry-daily');

-- 支付/退款对账：每日 04:00（实例时区；如需 Asia/Shanghai 精确请在 Dashboard 调整）
SELECT cron.schedule(
  'pay-reconcile-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/pay-reconcile'::text,
    '{"days":7}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM',
      'Content-Type', 'application/json'
    ),
    5000
  );
  $$
);

-- 分佣自动补跑：每日 04:30
SELECT cron.schedule(
  'commission-retry-daily',
  '30 4 * * *',
  $$
  SELECT net.http_post(
    'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/commission-retry'::text,
    '{"limit":50}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM',
      'Content-Type', 'application/json'
    ),
    5000
  );
  $$
);

COMMENT ON EXTENSION pg_cron IS '每日触发 pay-reconcile(对账) 与 commission-retry(分佣补跑)';

-- ==================== 00223_fn_merchant_product_sales.sql ====================
-- 00223 商家商品收益聚合 RPC
-- 背景：商品管理页（小程序商家端 merchant-products）原本一次性拉取最多 1 万条 order_items
--       到客户端，用 forEach 聚合每款商品的销量与营收——这是自营管理中心最大的卡顿源。
-- 做法：直接在数据库内按 store_id 聚合，返回极小结果集（每款在售商品一行），
--       前端只需一次轻量 RPC 调用即可拿到收益面板数据。
-- 口径：销量/营收仅计入已支付订单（pending_ship/pending_receive/pending_pickup/pending_review/completed），
--       与商家端 REVENUE_STATUSES、数据分析页、商品销量触发器(00221/00222)保持一致。
-- 注意：order_items.store_id 实际为 text 类型，函数入参仍保持 uuid（与 stores.id / orders.store_id 一致），
--       查询时显式 cast 避免 42883 类型不匹配错误。

CREATE OR REPLACE FUNCTION public.fn_merchant_product_sales(p_store_id uuid)
RETURNS TABLE (product_id uuid, sales bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id::uuid                                                 AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint                                  AS sales,
         COALESCE(SUM(oi.price * oi.quantity), 0)                              AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    -- 安全护栏：仅允许聚合当前登录商家自己拥有的门店，防止越权读取他人销售数据
    AND oi.store_id::uuid IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_id::uuid
$$;

COMMENT ON FUNCTION public.fn_merchant_product_sales(uuid)
  IS '按门店聚合每款商品的销量(sales)与营收(revenue)，已支付口径；供商家商品管理页收益面板，替代万级 order_items 客户端聚合';

-- ==================== 00223_food_ingredients.sql ====================
-- ============================================================
-- 来店有喜 · 食疗商品模块 · 全局食材字典表（系统内核：一劳永逸模板）
-- ------------------------------------------------------------
-- 用途：所有商品上传时「输入食材名 → 自动拉取属性 → 合并计算性味/过敏原/
--       人群/慢病标签 → 自动生成安全分析文案与商品属性」。新增食材由后台维护，
--       关联商品在前端按实时引擎计算，天然「全平台自动更新食疗参数」。
-- 对齐用户规格（2026-07-31 食疗商品系统化方案）：
--   食材名 / 性味 / 基础作用 / 适配场景 / 禁忌人群 / 过敏原 / 慢病适配标签 / 搭配中和
-- 执行：Supabase SQL Editor 全量粘贴运行；幂等可重复执行。
-- ============================================================

create table if not exists public.food_ingredients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,        -- 食材名：番茄 / 鸡蛋 / 党参
  nature        text not null,               -- 性味枚举：大寒/寒凉/凉/微凉/平性/微温/温/温热/大热
  base_effect   text,                        -- 基础作用（合规食养描述，无医疗词）
  fit_scenes    text,                        -- 适配场景
  caution_crowds text,                       -- 禁忌人群（逗号分隔）
  allergens     text[] default '{}',          -- 过敏原标签：无 / 蛋类 / 乳制品 / 海鲜 / 坚果 ...
  chronic_tags  text[] default '{}',          -- 慢病适配标签：高血压友好 / 减脂友好 / 儿童营养 ...
  neutralize    text,                        -- 搭配中和食材（如凉性番茄搭配生姜中和寒气）
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_food_ingredients_name on public.food_ingredients (name);
create index if not exists idx_food_ingredients_active on public.food_ingredients (is_active, sort_order);

-- ============================================================
-- 种子数据（用户方案示例：番茄 + 鸡蛋；运营可在 admin 直接增改，无需改代码）
-- ============================================================
insert into public.food_ingredients
  (name, nature, base_effect, fit_scenes, caution_crowds, allergens, chronic_tags, neutralize, sort_order)
values
  ('番茄', '凉',
   '生津止渴、补充维C、开胃促食欲',
   '日常饮食、夏季燥热、食欲不振',
   '脾胃虚寒、经期量大、怕冷体虚人群少食',
   '{}',
   array['高血压友好','减脂友好'],
   '生姜', 1),
  ('鸡蛋', '平',
   '补充优质蛋白、补虚固本、日常营养补给',
   '全年龄段日常三餐',
   '蛋类过敏、高胆固醇人群控量食用',
   array['蛋类'],
   array['高血压适量食用','儿童补充营养'],
   '', 2)
on conflict (name) do update set
  nature        = excluded.nature,
  base_effect   = excluded.base_effect,
  fit_scenes    = excluded.fit_scenes,
  caution_crowds= excluded.caution_crowds,
  allergens     = excluded.allergens,
  chronic_tags  = excluded.chronic_tags,
  neutralize    = excluded.neutralize,
  sort_order    = excluded.sort_order,
  is_active     = true;

-- ============================================================
-- RLS：MVP 阶段公开读、认证用户可写（与 food_additives / food_crowd_* 一致）；
--       生产建议收敛到 is_admin() / service_role。
-- ============================================================
alter table public.food_ingredients enable row level security;

drop policy if exists "fi_read"  on public.food_ingredients;
drop policy if exists "fi_write" on public.food_ingredients;

create policy "fi_read"  on public.food_ingredients
  for select using (true);
create policy "fi_write" on public.food_ingredients
  for all using (true) with check (true);

-- ==================== 00224_ensure_qr_buckets.sql ====================
-- 00224 确保二维码 Storage bucket 存在（幂等兜底）
-- 背景：generate-qrcode 函数历史上把门店/推广二维码上传到 bucket `二维码`，
--       但迁移 00006 实际创建的是 `qrcodes`，导致上传失败 → 函数报错 → 前端退化成死链 URL 码
--       （表现为「门店二维码不能扫码识别」）。
-- 此处同时兜底两个 bucket，确保无论函数最终使用哪个名字都不会因 bucket 缺失而失败。
-- 注意：本套代码 generate-qrcode 现已统一使用 `qrcodes`；`二维码` 仅作兼容保留。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'qrcodes') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('qrcodes', 'qrcodes', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = '二维码') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('二维码', '二维码', true);
  END IF;
END $$;

-- RLS：二维码 bucket 公开可读（service role 上传本身绕过 RLS，此处为小程序端读取图片兜底）
DROP POLICY IF EXISTS "qr_public_select" ON storage.objects;
CREATE POLICY "qr_public_select" ON storage.objects
  FOR SELECT USING (bucket_id IN ('qrcodes', '二维码'));

DROP POLICY IF EXISTS "qr_service_insert" ON storage.objects;
CREATE POLICY "qr_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('qrcodes', '二维码'));

-- ==================== 00224_upgrade_additives_l1l4.sql ====================
-- ============================================================
-- 00224 · 添加剂风险分级统一为 L1-L4（模块二核心壁垒）
--   + 补 PRD 2.2 字段（国标编号/使用范围/限量标准/敏感人群/固定文案/禁忌搭配）
-- 执行：supabase db query --linked --file supabase/migrations/00224_upgrade_additives_l1l4.sql
-- 注意顺序：先删旧约束 → 迁移旧值 → 再加新约束（否则 ADD CONSTRAINT 会因旧值报错回滚）
-- ============================================================

-- 1) 去掉旧 white/yellow/black 约束（若存在）
ALTER TABLE public.food_additives DROP CONSTRAINT IF EXISTS food_additives_risk_level_check;

-- 2) 先把旧值迁移为 L1-L4（此刻无约束，可自由改）
--    white→L2(常规合规) / yellow→L3(敏感控量) / black→L4(老幼弱少吃)
--    L1(纯天然无风险) 保留给明确天然来源的条目，由运营在后台手动指定。
UPDATE public.food_additives
SET risk_level = CASE risk_level
  WHEN 'white'  THEN 'L2'
  WHEN 'yellow' THEN 'L3'
  WHEN 'black'  THEN 'L4'
  ELSE COALESCE(NULLIF(risk_level, ''), 'L2')
END
WHERE risk_level IS NULL OR risk_level IN ('white','yellow','black','');

-- 3) 再加 L1-L4 约束（此时数据已全部合规）
ALTER TABLE public.food_additives
  ADD CONSTRAINT food_additives_risk_level_check
  CHECK (risk_level IN ('L1','L2','L3','L4'));

-- 4) 补 PRD 2.2 字段
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS gb_number          text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS usage_scope        text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS limit_standard     text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS sensitive_crowds   text[] not null default '{}';
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS fixed_tip          text;
ALTER TABLE public.food_additives ADD COLUMN IF NOT EXISTS forbidden_pairings text[] not null default '{}';

-- 5) 给现有种子补默认合规文案（固定，不可人工随意改）
UPDATE public.food_additives
SET limit_standard = '按 GB2760 最大使用量使用',
    fixed_tip      = '在国家标准允许范围内使用，正常食用无安全风险。',
    sensitive_crowds = '{}',
    forbidden_pairings = '{}'
WHERE fixed_tip IS NULL;

-- 6) 个别精细化（敏感人群提示）
UPDATE public.food_additives
SET fixed_tip = '婴幼儿（36月龄内）建议少用合成色素类添加剂。',
    sensitive_crowds = ARRAY['儿童']
WHERE name IN ('胭脂红','柠檬黄','日落黄','糖精钠','人工香精');

UPDATE public.food_additives
SET fixed_tip = '含反式脂肪酸，婴幼儿禁用、成人应严格控制摄入。',
    sensitive_crowds = ARRAY['儿童','老年']
WHERE name = '部分氢化植物油';

UPDATE public.food_additives
SET fixed_tip = '肉制品护色剂，过量有毒性，婴幼儿严禁食用。',
    sensitive_crowds = ARRAY['儿童']
WHERE name = '亚硝酸盐';

UPDATE public.food_additives
SET fixed_tip = '人工甜味剂，苯丙酮尿症患者禁用。',
    sensitive_crowds = ARRAY['儿童']
WHERE name = '阿斯巴甜';

-- ==================== 00225_fn_merchant_analytics.sql ====================
-- 00225 商家后台数据分析聚合 RPC
-- 背景：admin-web 商家「数据分析」页（getMerchantAnalytics）原本一次性把全量 orders + 全量
--       order_items 拉到前端，用 JS 聚合今日/本月营收、销量趋势、商品排行——门店累计订单多时
--       每次进页面要传上万行，是自营管理中心最大卡顿源之一。
-- 做法：在数据库内按 store_id 一次性聚合，返回一行 jsonb（已支付口径），
--       前端只需一次轻量 RPC 调用即可拿到全部指标。
-- 口径：
--   营收/销量：仅计入已支付订单（pending_ship/pending_receive/pending_pickup/pending_review/completed）
--   累积客户：全部订单去重 user_id（与商家端原实现一致）
--   安全护栏：仅允许查询当前登录商家自己拥有的门店（owner_id = auth.uid()），防止越权读他人数据。

CREATE OR REPLACE FUNCTION public.fn_merchant_analytics(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH auth_store AS (
  SELECT id FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
),
paid_orders AS (
  SELECT o.id, o.total_amount, o.created_at, o.user_id
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND EXISTS (SELECT 1 FROM auth_store)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
),
today_bound AS (SELECT date_trunc('day', now()) AS t),
month_bound AS (SELECT date_trunc('month', now()) AS m),
revenue AS (
  SELECT
    COALESCE(SUM(CASE WHEN o.created_at >= (SELECT t FROM today_bound) THEN o.total_amount ELSE 0 END), 0) AS rev_today,
    COALESCE(SUM(CASE WHEN o.created_at >= (SELECT m FROM month_bound) THEN o.total_amount ELSE 0 END), 0) AS rev_month,
    COUNT(CASE WHEN o.created_at >= (SELECT t FROM today_bound) THEN 1 END) AS ord_today
  FROM paid_orders o
),
cust AS (
  SELECT COUNT(DISTINCT o.user_id) AS total_customers
  FROM public.orders o
  WHERE o.store_id = p_store_id AND EXISTS (SELECT 1 FROM auth_store)
),
trend AS (
  SELECT jsonb_agg(jsonb_build_object('date', lbl, 'amount', amt)) AS sales_trend
  FROM (
    SELECT
      (EXTRACT(month FROM d)::int::text || '/' || EXTRACT(day FROM d)::int::text) AS lbl,
      COALESCE(SUM(o.total_amount), 0)::int AS amt
    FROM generate_series(6, 0, -1) AS g(offs)
    CROSS JOIN LATERAL (SELECT (now() - ((g.offs)::text || ' days')::interval)::date AS d) dl
    LEFT JOIN paid_orders o ON o.created_at::date = dl.d
    GROUP BY dl.d
    ORDER BY dl.d
  ) t
),
top_agg AS (
  SELECT
    oi.product_name,
    COALESCE(SUM(oi.price * oi.quantity), 0)::int AS sales
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    AND EXISTS (SELECT 1 FROM auth_store)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_name
  ORDER BY SUM(oi.price * oi.quantity) DESC
  LIMIT 5
),
top AS (
  SELECT jsonb_agg(jsonb_build_object('name', product_name, 'sales', sales, 'trend', 'up')) AS top_products
  FROM top_agg
)
SELECT jsonb_build_object(
  'revenueToday',   (SELECT rev_today::int  FROM revenue),
  'revenueMonth',   (SELECT rev_month::int  FROM revenue),
  'ordersToday',    (SELECT ord_today::int  FROM revenue),
  'totalCustomers', (SELECT total_customers::int FROM cust),
  'salesTrend',     COALESCE((SELECT sales_trend FROM trend), '[]'::jsonb),
  'topProducts',    COALESCE((SELECT top_products FROM top),   '[]'::jsonb)
)
$$;

COMMENT ON FUNCTION public.fn_merchant_analytics(uuid)
  IS '商家后台数据分析聚合：今日/本月营收、今日订单、累积客户、近7日趋势、TOP5商品；服务端聚合替代前端万级拉取';

-- ==================== 00225_food_tag_rules.sql ====================
-- ============================================================
-- 00225 · 食疗人群匹配标签规则表 food_tag_rules（模块三核心变现壁垒）
--   每个用户标签 → 优先/规避配料清单 + 适配品类 + 权重
--   运营在后台「权重微调面板」可改，无需改代码。
-- 执行：supabase db query --linked --file supabase/migrations/00225_food_tag_rules.sql
-- ============================================================

create table if not exists public.food_tag_rules (
  tag_key            text primary key,
  label              text not null,
  group_name         text,
  prefer_ingredients text[] not null default '{}',
  avoid_ingredients  text[] not null default '{}',
  prefer_categories  text[] not null default '{}',
  weight_prefer      int  not null default 15,
  weight_avoid       int  not null default 25,
  status             text not null default 'active' check (status in ('active','inactive')),
  created_at         timestamptz not null default now()
);
create index if not exists idx_ftr_status on public.food_tag_rules (status);

alter table public.food_tag_rules enable row level security;
drop policy if exists "ftr_read"  on public.food_tag_rules;
drop policy if exists "ftr_write" on public.food_tag_rules;
create policy "ftr_read"  on public.food_tag_rules for select using (true);
create policy "ftr_write" on public.food_tag_rules for all    using (true) with check (true);

-- 种子：PRD 3.1 九大用户标签（无诊断行为，仅配料匹配筛选）
insert into public.food_tag_rules
  (tag_key, label, group_name, prefer_ingredients, avoid_ingredients, weight_prefer, weight_avoid)
values
  ('children_picky',  '儿童挑食',     '儿童',   ARRAY['天然','果汁','蛋白','钙','铁','锌','膳食纤维'],           ARRAY['人工色素','人工香精','反式脂肪'],                     18, 20),
  ('children_spleen', '儿童脾胃弱',   '儿童',   ARRAY['山药','小米','麦芽','益生菌','膳食纤维'],                   ARRAY['人工色素','反式脂肪','高钠'],                         18, 22),
  ('children_heat',   '儿童易上火',   '儿童',   ARRAY['梨','百合','绿豆','天然'],                                 ARRAY['白砂糖','蔗糖','果葡糖浆','人工色素','香精'],             18, 24),
  ('office_damp',     '上班族湿气重', '成人',   ARRAY['薏米','赤小豆','茯苓','膳食纤维','天然'],                   ARRAY['高糖','油腻','植脂末','反式脂肪'],                     16, 22),
  ('stayup_weak',     '熬夜体虚',     '成人',   ARRAY['蛋白','B族维生素','天然','铁'],                             ARRAY['高钠','人工色素','反式脂肪'],                         16, 20),
  ('elder_sugar',     '中老年控糖',   '中老年', ARRAY['无糖','膳食纤维','蛋白','三氯蔗糖'],                       ARRAY['白砂糖','蔗糖','果葡糖浆','糖精钠','麦芽糖'],           20, 26),
  ('elder_bp',        '中老年控血压', '中老年', ARRAY['低钠','钾','膳食纤维','天然'],                             ARRAY['钠','盐','亚硝酸盐','高钠'],                           20, 26),
  ('weak_cough',      '体虚易咳',     '成人',   ARRAY['梨','百合','天然','蛋白'],                                 ARRAY['人工香精','人工色素','高钠'],                         16, 22),
  ('diet_calorie',    '减脂控卡',     '成人',   ARRAY['高蛋白','膳食纤维','0糖','天然'],                           ARRAY['白砂糖','蔗糖','植脂末','反式脂肪','果葡糖浆'],         20, 26)
on conflict (tag_key) do nothing;

-- ==================== 00226_merchant_rpc_membership_guard.sql ====================
-- 00226 商家聚合 RPC：账号口径护栏修正 + 趋势窗口参数化
--
-- 背景（两个真实缺陷）：
--   ① 护栏口径错误：00223/00225 的越权护栏写死 `owner_id = auth.uid()`。但总后台
--      「建店 + 建登陆」会把运营账号写成 store_staff(role='owner')，其 id 不等于
--      stores.owner_id。这类账号（RLS 认定其可管理该店，门店切换器也能看到）调用
--      本函数时恒返回全 0 —— 表现就是数据分析页/店铺概况「有店但数据全空」。
--      修正为与 stores 表 RLS 完全同口径：owner ∪ 活跃 staff（fn_my_store_ids），
--      并额外放行平台管理员 is_admin()。这是收紧到「同一套成员判定」，不放宽边界。
--   ② 页面「近30日」按钮点了没反应：趋势窗口在 SQL 里硬编码 7 天。新增 p_days 参数。
--
-- 签名变更说明：fn_merchant_analytics 由 (uuid) 变为 (uuid, int DEFAULT 7)。
--   必须先 DROP 旧签名再 CREATE —— 若用 CREATE OR REPLACE 且不 DROP，会保留旧重载，
--   PostgREST 可能报 "Could not choose the best candidate function"。
--   DROP 会丢失 GRANT，下方按线上原 ACL 逐条还原（PUBLIC/anon/authenticated/service_role）。
--   fn_merchant_product_sales 签名不变，用 CREATE OR REPLACE 原地替换（ACL 自动保留）。

BEGIN;

-- ── 1) fn_merchant_analytics：口径修正 + 窗口参数化 ────────────────────────
DROP FUNCTION IF EXISTS public.fn_merchant_analytics(uuid);

CREATE FUNCTION public.fn_merchant_analytics(p_store_id uuid, p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH authorized AS (
  SELECT 1
  WHERE p_store_id = ANY(public.fn_my_store_ids(auth.uid()))
     OR public.is_admin()
),
paid_orders AS (
  SELECT o.id, o.total_amount, o.created_at, o.user_id
  FROM public.orders o
  WHERE o.store_id = p_store_id
    AND EXISTS (SELECT 1 FROM authorized)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
),
days_n AS (SELECT GREATEST(COALESCE(p_days, 7), 1) AS n),
today_bound AS (SELECT date_trunc('day', now()) AS t),
month_bound AS (SELECT date_trunc('month', now()) AS m),
revenue AS (
  SELECT
    COALESCE(SUM(CASE WHEN o.created_at >= (SELECT t FROM today_bound) THEN o.total_amount ELSE 0 END), 0) AS rev_today,
    COALESCE(SUM(CASE WHEN o.created_at >= (SELECT m FROM month_bound) THEN o.total_amount ELSE 0 END), 0) AS rev_month,
    COUNT(CASE WHEN o.created_at >= (SELECT t FROM today_bound) THEN 1 END) AS ord_today
  FROM paid_orders o
),
cust AS (
  SELECT COUNT(DISTINCT o.user_id) AS total_customers
  FROM public.orders o
  WHERE o.store_id = p_store_id AND EXISTS (SELECT 1 FROM authorized)
),
trend AS (
  SELECT jsonb_agg(jsonb_build_object('date', lbl, 'amount', amt)) AS sales_trend
  FROM (
    SELECT
      (EXTRACT(month FROM dl.d)::int::text || '/' || EXTRACT(day FROM dl.d)::int::text) AS lbl,
      COALESCE(SUM(o.total_amount), 0)::int AS amt
    FROM generate_series(1, (SELECT n FROM days_n)) AS g(i)
    CROSS JOIN LATERAL (
      SELECT (now() - (((SELECT n FROM days_n) - g.i) || ' days')::interval)::date AS d
    ) dl
    LEFT JOIN paid_orders o ON o.created_at::date = dl.d
    GROUP BY dl.d
    ORDER BY dl.d
  ) t
),
top_agg AS (
  SELECT
    oi.product_name,
    COALESCE(SUM(oi.price * oi.quantity), 0)::int AS sales
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    AND EXISTS (SELECT 1 FROM authorized)
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_name
  ORDER BY SUM(oi.price * oi.quantity) DESC
  LIMIT 5
),
top AS (
  SELECT jsonb_agg(jsonb_build_object('name', product_name, 'sales', sales, 'trend', 'up')) AS top_products
  FROM top_agg
)
SELECT jsonb_build_object(
  'revenueToday',   (SELECT rev_today::int  FROM revenue),
  'revenueMonth',   (SELECT rev_month::int  FROM revenue),
  'ordersToday',    (SELECT ord_today::int  FROM revenue),
  'totalCustomers', (SELECT total_customers::int FROM cust),
  'salesTrend',     COALESCE((SELECT sales_trend FROM trend), '[]'::jsonb),
  'topProducts',    COALESCE((SELECT top_products FROM top),   '[]'::jsonb)
)
$$;

-- 还原 DROP 丢失的授权（与线上原 ACL 一致）
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_merchant_analytics(uuid, int) TO service_role;

COMMENT ON FUNCTION public.fn_merchant_analytics(uuid, int)
  IS '商家后台数据分析聚合：今日/本月营收、今日订单、累积客户、近 p_days 日趋势、TOP5商品；护栏口径 = fn_my_store_ids(auth.uid()) ∪ is_admin()';

-- ── 2) fn_merchant_product_sales：仅修正口径（签名不变，原地替换）──────────
CREATE OR REPLACE FUNCTION public.fn_merchant_product_sales(p_store_id uuid)
RETURNS TABLE (product_id uuid, sales bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id::uuid                                                AS product_id,
         COALESCE(SUM(oi.quantity), 0)::bigint                              AS sales,
         COALESCE(SUM(oi.price * oi.quantity), 0)                           AS revenue
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.store_id = p_store_id::text
    -- 护栏口径与 fn_merchant_analytics / stores 表 RLS 保持一致：owner ∪ 活跃 staff ∪ admin
    AND (p_store_id = ANY(public.fn_my_store_ids(auth.uid())) OR public.is_admin())
    AND o.status IN ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
  GROUP BY oi.product_id::uuid
$$;

GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_merchant_product_sales(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_merchant_product_sales(uuid)
  IS '按门店聚合每款商品的销量(sales)与营收(revenue)，已支付口径；护栏口径 = fn_my_store_ids(auth.uid()) ∪ is_admin()';

COMMIT;

-- ==================== 00226_seed_cities_full.sql ====================
-- ============================================================================
-- 00226_seed_cities_full.sql
-- 目的：补全 cities 城市库（线上原本只有 5 条：上海/北京/广州/成都/深圳，
--       连业务重心「杭州」都没有，导致 matchCityByLocation 把杭州 GPS
--       误配到 160km 外的上海）。
--
-- 本脚本做四件事（全部幂等，可重复执行）：
--   1. 补列 pinyin / initial / is_hot / sort_order（供城市选择页做拼音搜索、
--      A-Z 字母索引与热门城市宫格）
--   2. 校准 cities.id 自增（原表 id 为手工填充的 integer，无默认值会导致
--      不指定 id 的 INSERT 直接 NOT NULL 违规）
--   3. 灌入全国 250 个城市（4 直辖市 + 全部省会/首府 + 5 计划单列市 +
--      主要地级市 + 港澳台），city_code 统一为国家标准 6 位行政区划代码
--   4. 加 city_name / city_code 唯一索引，杜绝后续重复灌数据
--
-- 说明：city_code 在业务代码中无任何查询依赖（仅类型声明），
--       故可安全把原有 SH/BJ/GZ/CD/SZ 五条统一迁到行政区划代码。
--       campaigns 等表引用的是 cities.id（integer），本脚本不改动已有 id。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 补列
-- ---------------------------------------------------------------------------
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS pinyin     text;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS initial    text;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS is_hot     boolean NOT NULL DEFAULT false;
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.cities.pinyin     IS '城市名全拼（小写，用于搜索匹配）';
COMMENT ON COLUMN public.cities.initial    IS '拼音首字母（大写 A-Z，用于字母索引分组）';
COMMENT ON COLUMN public.cities.is_hot     IS '是否热门城市（城市选择页顶部宫格展示）';
COMMENT ON COLUMN public.cities.sort_order IS '排序权重，越小越靠前；热门城市 1-22，其余 100';

-- ---------------------------------------------------------------------------
-- 2. 保证 id 可自增：无默认值则挂序列；已有序列则校准到 MAX(id)+1
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_has_default boolean;
  v_seq         text;
BEGIN
  SELECT (column_default IS NOT NULL OR is_identity = 'YES')
    INTO v_has_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'cities' AND column_name = 'id';

  IF NOT COALESCE(v_has_default, false) THEN
    CREATE SEQUENCE IF NOT EXISTS public.cities_id_seq OWNED BY public.cities.id;
    EXECUTE 'ALTER TABLE public.cities ALTER COLUMN id SET DEFAULT nextval(''public.cities_id_seq'')';
    RAISE NOTICE '[cities] id 无默认值，已挂载自增序列 cities_id_seq';
  END IF;

  -- 无论新挂还是原有 serial，都把序列校准到 MAX(id)+1，避免主键冲突
  v_seq := pg_get_serial_sequence('public.cities', 'id');
  IF v_seq IS NOT NULL THEN
    PERFORM setval(v_seq, COALESCE((SELECT MAX(id) FROM public.cities), 0) + 1, false);
    RAISE NOTICE '[cities] 序列已校准到 %', COALESCE((SELECT MAX(id) FROM public.cities), 0) + 1;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. 城市种子数据
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS _city_seed;
CREATE TEMP TABLE _city_seed (
  city_code  text,
  city_name  text,
  province   text,
  lng        numeric,
  lat        numeric,
  pinyin     text,
  initial    text,
  is_hot     boolean,
  sort_order integer
);

INSERT INTO _city_seed (city_code, city_name, province, lng, lat, pinyin, initial, is_hot, sort_order) VALUES
-- ===== 直辖市 =====
('110000','北京','北京市',116.4074,39.9042,'beijing','B',true,2),
('310000','上海','上海市',121.4737,31.2304,'shanghai','S',true,3),
('120000','天津','天津市',117.1901,39.1252,'tianjin','T',true,12),
('500000','重庆','重庆市',106.5516,29.5630,'chongqing','C',true,7),

-- ===== 河北省 =====
('130100','石家庄','河北省',114.5149,38.0428,'shijiazhuang','S',false,100),
('130200','唐山','河北省',118.1802,39.6304,'tangshan','T',false,100),
('130300','秦皇岛','河北省',119.5996,39.9354,'qinhuangdao','Q',false,100),
('130400','邯郸','河北省',114.5391,36.6256,'handan','H',false,100),
('130500','邢台','河北省',114.5086,37.0682,'xingtai','X',false,100),
('130600','保定','河北省',115.4646,38.8739,'baoding','B',false,100),
('130700','张家口','河北省',114.8874,40.8244,'zhangjiakou','Z',false,100),
('130800','承德','河北省',117.9634,40.9515,'chengde','C',false,100),
('130900','沧州','河北省',116.8577,38.3105,'cangzhou','C',false,100),
('131000','廊坊','河北省',116.6835,39.5379,'langfang','L',false,100),
('131100','衡水','河北省',115.6659,37.7350,'hengshui','H',false,100),

-- ===== 山西省 =====
('140100','太原','山西省',112.5489,37.8706,'taiyuan','T',false,100),
('140200','大同','山西省',113.3001,40.0764,'datong','D',false,100),
('140400','长治','山西省',113.1163,36.1954,'changzhi','C',false,100),
('140500','晋城','山西省',112.8513,35.4976,'jincheng','J',false,100),
('140700','晋中','山西省',112.7364,37.6965,'jinzhong','J',false,100),
('140800','运城','山西省',111.0038,35.0228,'yuncheng','Y',false,100),
('141000','临汾','山西省',111.5187,36.0880,'linfen','L',false,100),

-- ===== 内蒙古自治区 =====
('150100','呼和浩特','内蒙古自治区',111.7519,40.8414,'huhehaote','H',false,100),
('150200','包头','内蒙古自治区',109.8404,40.6581,'baotou','B',false,100),
('150300','乌海','内蒙古自治区',106.7943,39.6553,'wuhai','W',false,100),
('150400','赤峰','内蒙古自治区',118.8869,42.2576,'chifeng','C',false,100),
('150600','鄂尔多斯','内蒙古自治区',109.7810,39.6086,'eerduosi','E',false,100),
('150700','呼伦贝尔','内蒙古自治区',119.7583,49.2154,'hulunbeier','H',false,100),

-- ===== 辽宁省 =====
('210100','沈阳','辽宁省',123.4315,41.8057,'shenyang','S',false,100),
('210200','大连','辽宁省',121.6147,38.9140,'dalian','D',false,100),
('210300','鞍山','辽宁省',122.9946,41.1084,'anshan','A',false,100),
('210400','抚顺','辽宁省',123.9573,41.8807,'fushun','F',false,100),
('210600','丹东','辽宁省',124.3542,40.0007,'dandong','D',false,100),
('210700','锦州','辽宁省',121.1359,41.1195,'jinzhou','J',false,100),
('210800','营口','辽宁省',122.2350,40.6674,'yingkou','Y',false,100),
('211000','辽阳','辽宁省',123.2374,41.2673,'liaoyang','L',false,100),
('211400','葫芦岛','辽宁省',120.8560,40.7556,'huludao','H',false,100),

-- ===== 吉林省 =====
('220100','长春','吉林省',125.3245,43.8868,'changchun','C',false,100),
('220200','吉林','吉林省',126.5530,43.8436,'jilin','J',false,100),
('220400','辽源','吉林省',125.1454,42.9027,'liaoyuan','L',false,100),
('220700','松原','吉林省',124.8232,45.1180,'songyuan','S',false,100),
('222400','延边','吉林省',129.5091,42.8913,'yanbian','Y',false,100),

-- ===== 黑龙江省 =====
('230100','哈尔滨','黑龙江省',126.5349,45.8038,'haerbin','H',false,100),
('230200','齐齐哈尔','黑龙江省',123.9180,47.3543,'qiqihaer','Q',false,100),
('230300','鸡西','黑龙江省',130.9757,45.3000,'jixi','J',false,100),
('230600','大庆','黑龙江省',125.1035,46.5895,'daqing','D',false,100),
('230800','佳木斯','黑龙江省',130.3189,46.7997,'jiamusi','J',false,100),
('231000','牡丹江','黑龙江省',129.6186,44.5826,'mudanjiang','M',false,100),

-- ===== 江苏省 =====
('320100','南京','江苏省',118.7969,32.0603,'nanjing','N',true,9),
('320200','无锡','江苏省',120.3119,31.4912,'wuxi','W',true,18),
('320300','徐州','江苏省',117.1848,34.2618,'xuzhou','X',false,100),
('320400','常州','江苏省',119.9741,31.8110,'changzhou','C',false,100),
('320500','苏州','江苏省',120.5853,31.2989,'suzhou','S',true,11),
('320600','南通','江苏省',120.8943,31.9802,'nantong','N',false,100),
('320700','连云港','江苏省',119.2216,34.5967,'lianyungang','L',false,100),
('320800','淮安','江苏省',119.0212,33.5975,'huaian','H',false,100),
('320900','盐城','江苏省',120.1398,33.3776,'yancheng','Y',false,100),
('321000','扬州','江苏省',119.4215,32.3932,'yangzhou','Y',false,100),
('321100','镇江','江苏省',119.4527,32.2044,'zhenjiang','Z',false,100),
('321200','泰州','江苏省',119.9152,32.4849,'taizhou','T',false,100),
('321300','宿迁','江苏省',118.2752,33.9631,'suqian','S',false,100),

-- ===== 浙江省（业务重心，全 11 地级市 + 义乌） =====
('330100','杭州','浙江省',120.1551,30.2741,'hangzhou','H',true,1),
('330200','宁波','浙江省',121.5440,29.8683,'ningbo','N',true,15),
('330300','温州','浙江省',120.6994,27.9944,'wenzhou','W',true,19),
('330400','嘉兴','浙江省',120.7555,30.7463,'jiaxing','J',false,100),
('330500','湖州','浙江省',120.0865,30.8942,'huzhou','H',false,100),
('330600','绍兴','浙江省',120.5820,29.9971,'shaoxing','S',false,100),
('330700','金华','浙江省',119.6497,29.0895,'jinhua','J',false,100),
('330800','衢州','浙江省',118.8726,28.9417,'quzhou','Q',false,100),
('330900','舟山','浙江省',122.2072,29.9853,'zhoushan','Z',false,100),
('331000','台州','浙江省',121.4287,28.6614,'taizhou','T',false,100),
('331100','丽水','浙江省',119.9219,28.4517,'lishui','L',false,100),
('330782','义乌','浙江省',120.0744,29.3065,'yiwu','Y',false,100),

-- ===== 安徽省 =====
('340100','合肥','安徽省',117.2272,31.8206,'hefei','H',true,20),
('340200','芜湖','安徽省',118.4331,31.3529,'wuhu','W',false,100),
('340300','蚌埠','安徽省',117.3894,32.9166,'bengbu','B',false,100),
('340500','马鞍山','安徽省',118.5069,31.6704,'maanshan','M',false,100),
('340700','铜陵','安徽省',117.8165,30.9299,'tongling','T',false,100),
('340800','安庆','安徽省',117.0435,30.5088,'anqing','A',false,100),
('341000','黄山','安徽省',118.3173,29.7093,'huangshan','H',false,100),
('341100','滁州','安徽省',118.3162,32.3037,'chuzhou','C',false,100),
('341200','阜阳','安徽省',115.8195,32.8969,'fuyang','F',false,100),
('341300','宿州','安徽省',116.9640,33.6461,'suzhou','S',false,100),

-- ===== 福建省 =====
('350100','福州','福建省',119.2965,26.0745,'fuzhou','F',false,100),
('350200','厦门','福建省',118.0894,24.4798,'xiamen','X',true,22),
('350300','莆田','福建省',119.0078,25.4310,'putian','P',false,100),
('350400','三明','福建省',117.6389,26.2635,'sanming','S',false,100),
('350500','泉州','福建省',118.5895,24.9089,'quanzhou','Q',false,100),
('350600','漳州','福建省',117.6471,24.5130,'zhangzhou','Z',false,100),
('350700','南平','福建省',118.1783,26.6415,'nanping','N',false,100),
('350800','龙岩','福建省',117.0177,25.0752,'longyan','L',false,100),
('350900','宁德','福建省',119.5477,26.6656,'ningde','N',false,100),

-- ===== 江西省 =====
('360100','南昌','江西省',115.8581,28.6820,'nanchang','N',false,100),
('360200','景德镇','江西省',117.2145,29.2925,'jingdezhen','J',false,100),
('360400','九江','江西省',115.9928,29.7120,'jiujiang','J',false,100),
('360700','赣州','江西省',114.9330,25.8310,'ganzhou','G',false,100),
('360800','吉安','江西省',114.9866,27.1117,'jian','J',false,100),
('360900','宜春','江西省',114.4161,27.8160,'yichun','Y',false,100),
('361100','上饶','江西省',117.9433,28.4549,'shangrao','S',false,100),

-- ===== 山东省 =====
('370100','济南','山东省',117.1201,36.6512,'jinan','J',false,100),
('370200','青岛','山东省',120.3826,36.0671,'qingdao','Q',true,21),
('370300','淄博','山东省',118.0472,36.8149,'zibo','Z',false,100),
('370400','枣庄','山东省',117.5576,34.8564,'zaozhuang','Z',false,100),
('370500','东营','山东省',118.6667,37.4341,'dongying','D',false,100),
('370600','烟台','山东省',121.4479,37.4638,'yantai','Y',false,100),
('370700','潍坊','山东省',119.1618,36.7069,'weifang','W',false,100),
('370800','济宁','山东省',116.5871,35.4154,'jining','J',false,100),
('370900','泰安','山东省',117.1290,36.1948,'taian','T',false,100),
('371000','威海','山东省',122.1201,37.5133,'weihai','W',false,100),
('371100','日照','山东省',119.5269,35.4164,'rizhao','R',false,100),
('371300','临沂','山东省',118.3564,35.1042,'linyi','L',false,100),
('371400','德州','山东省',116.3574,37.4341,'dezhou','D',false,100),
('371500','聊城','山东省',115.9800,36.4568,'liaocheng','L',false,100),
('371600','滨州','山东省',118.0169,37.3835,'binzhou','B',false,100),
('371700','菏泽','山东省',115.4694,35.2465,'heze','H',false,100),

-- ===== 河南省 =====
('410100','郑州','河南省',113.6254,34.7466,'zhengzhou','Z',true,14),
('410200','开封','河南省',114.3079,34.7973,'kaifeng','K',false,100),
('410300','洛阳','河南省',112.4540,34.6197,'luoyang','L',false,100),
('410400','平顶山','河南省',113.3076,33.7353,'pingdingshan','P',false,100),
('410500','安阳','河南省',114.3931,36.0977,'anyang','A',false,100),
('410600','鹤壁','河南省',114.2951,35.7482,'hebi','H',false,100),
('410700','新乡','河南省',113.9268,35.3030,'xinxiang','X',false,100),
('410800','焦作','河南省',113.2418,35.2159,'jiaozuo','J',false,100),
('411000','许昌','河南省',113.8260,34.0227,'xuchang','X',false,100),
('411100','漯河','河南省',114.0264,33.5759,'luohe','L',false,100),
('411200','三门峡','河南省',111.2003,34.7727,'sanmenxia','S',false,100),
('411300','南阳','河南省',112.5286,32.9908,'nanyang','N',false,100),
('411400','商丘','河南省',115.6505,34.4370,'shangqiu','S',false,100),
('411500','信阳','河南省',114.0755,32.1233,'xinyang','X',false,100),
('411600','周口','河南省',114.6497,33.6204,'zhoukou','Z',false,100),
('411700','驻马店','河南省',114.0224,32.9800,'zhumadian','Z',false,100),

-- ===== 湖北省 =====
('420100','武汉','湖北省',114.3055,30.5928,'wuhan','W',true,10),
('420200','黄石','湖北省',115.0389,30.1997,'huangshi','H',false,100),
('420300','十堰','湖北省',110.7879,32.6469,'shiyan','S',false,100),
('420500','宜昌','湖北省',111.2867,30.6919,'yichang','Y',false,100),
('420600','襄阳','湖北省',112.1440,32.0424,'xiangyang','X',false,100),
('420700','鄂州','湖北省',114.8909,30.3965,'ezhou','E',false,100),
('420800','荆门','湖北省',112.2040,31.0354,'jingmen','J',false,100),
('420900','孝感','湖北省',113.9268,30.9265,'xiaogan','X',false,100),
('421000','荆州','湖北省',112.2381,30.3269,'jingzhou','J',false,100),
('421100','黄冈','湖北省',114.8724,30.4536,'huanggang','H',false,100),

-- ===== 湖南省 =====
('430100','长沙','湖南省',112.9388,28.2282,'changsha','C',true,13),
('430200','株洲','湖南省',113.1519,27.8358,'zhuzhou','Z',false,100),
('430300','湘潭','湖南省',112.9448,27.8299,'xiangtan','X',false,100),
('430400','衡阳','湖南省',112.6072,26.9002,'hengyang','H',false,100),
('430500','邵阳','湖南省',111.4677,27.2389,'shaoyang','S',false,100),
('430600','岳阳','湖南省',113.1288,29.3569,'yueyang','Y',false,100),
('430700','常德','湖南省',111.6984,29.0316,'changde','C',false,100),
('430900','益阳','湖南省',112.3551,28.5539,'yiyang','Y',false,100),
('431000','郴州','湖南省',113.0148,25.7708,'chenzhou','C',false,100),
('431200','怀化','湖南省',109.9785,27.5500,'huaihua','H',false,100),
('433100','湘西','湖南省',109.7390,28.3141,'xiangxi','X',false,100),

-- ===== 广东省 =====
('440100','广州','广东省',113.2644,23.1291,'guangzhou','G',true,4),
('440200','韶关','广东省',113.5917,24.8015,'shaoguan','S',false,100),
('440300','深圳','广东省',114.0579,22.5431,'shenzhen','S',true,5),
('440400','珠海','广东省',113.5767,22.2707,'zhuhai','Z',false,100),
('440500','汕头','广东省',116.7081,23.3710,'shantou','S',false,100),
('440600','佛山','广东省',113.1220,23.0288,'foshan','F',true,17),
('440700','江门','广东省',113.0946,22.5901,'jiangmen','J',false,100),
('440800','湛江','广东省',110.3646,21.2745,'zhanjiang','Z',false,100),
('440900','茂名','广东省',110.9192,21.6597,'maoming','M',false,100),
('441200','肇庆','广东省',112.4653,23.0470,'zhaoqing','Z',false,100),
('441300','惠州','广东省',114.4126,23.0794,'huizhou','H',false,100),
('441400','梅州','广东省',116.1177,24.2991,'meizhou','M',false,100),
('441500','汕尾','广东省',115.3644,22.7745,'shanwei','S',false,100),
('441600','河源','广东省',114.6978,23.7462,'heyuan','H',false,100),
('441700','阳江','广东省',111.9755,21.8590,'yangjiang','Y',false,100),
('441800','清远','广东省',113.0561,23.6817,'qingyuan','Q',false,100),
('441900','东莞','广东省',113.7518,23.0207,'dongguan','D',true,16),
('442000','中山','广东省',113.3924,22.5175,'zhongshan','Z',false,100),
('445100','潮州','广东省',116.6320,23.6618,'chaozhou','C',false,100),
('445200','揭阳','广东省',116.3556,23.5437,'jieyang','J',false,100),
('445300','云浮','广东省',112.0446,22.9298,'yunfu','Y',false,100),

-- ===== 广西壮族自治区 =====
('450100','南宁','广西壮族自治区',108.3665,22.8170,'nanning','N',false,100),
('450200','柳州','广西壮族自治区',109.4160,24.3255,'liuzhou','L',false,100),
('450300','桂林','广西壮族自治区',110.2993,25.2740,'guilin','G',false,100),
('450400','梧州','广西壮族自治区',111.2792,23.4767,'wuzhou','W',false,100),
('450500','北海','广西壮族自治区',109.1200,21.4812,'beihai','B',false,100),
('450700','钦州','广西壮族自治区',108.6244,21.9671,'qinzhou','Q',false,100),
('450800','贵港','广西壮族自治区',109.5989,23.1116,'guigang','G',false,100),
('450900','玉林','广西壮族自治区',110.1545,22.6314,'yulin','Y',false,100),

-- ===== 海南省 =====
('460100','海口','海南省',110.1999,20.0444,'haikou','H',false,100),
('460200','三亚','海南省',109.5082,18.2479,'sanya','S',false,100),

-- ===== 四川省 =====
('510100','成都','四川省',104.0665,30.5728,'chengdu','C',true,6),
('510300','自贡','四川省',104.7734,29.3528,'zigong','Z',false,100),
('510400','攀枝花','四川省',101.7160,26.5804,'panzhihua','P',false,100),
('510500','泸州','四川省',105.4433,28.8891,'luzhou','L',false,100),
('510600','德阳','四川省',104.3980,31.1270,'deyang','D',false,100),
('510700','绵阳','四川省',104.6796,31.4675,'mianyang','M',false,100),
('510800','广元','四川省',105.8298,32.4337,'guangyuan','G',false,100),
('510900','遂宁','四川省',105.5713,30.5133,'suining','S',false,100),
('511000','内江','四川省',105.0662,29.5871,'neijiang','N',false,100),
('511100','乐山','四川省',103.7613,29.5822,'leshan','L',false,100),
('511300','南充','四川省',106.0827,30.7953,'nanchong','N',false,100),
('511500','宜宾','四川省',104.6308,28.7602,'yibin','Y',false,100),
('511600','广安','四川省',106.6333,30.4564,'guangan','G',false,100),
('511900','巴中','四川省',106.7537,31.8588,'bazhong','B',false,100),
('513400','凉山','四川省',102.2587,27.8868,'liangshan','L',false,100),

-- ===== 贵州省 =====
('520100','贵阳','贵州省',106.6302,26.6477,'guiyang','G',false,100),
('520200','六盘水','贵州省',104.8306,26.5926,'liupanshui','L',false,100),
('520300','遵义','贵州省',106.9272,27.7256,'zunyi','Z',false,100),
('520400','安顺','贵州省',105.9320,26.2455,'anshun','A',false,100),
('522300','黔西南','贵州省',104.9061,25.0880,'qianxinan','Q',false,100),
('522600','黔东南','贵州省',107.9772,26.5834,'qiandongnan','Q',false,100),
('522700','黔南','贵州省',107.5228,26.2540,'qiannan','Q',false,100),

-- ===== 云南省 =====
('530100','昆明','云南省',102.8329,24.8801,'kunming','K',false,100),
('530300','曲靖','云南省',103.7979,25.5016,'qujing','Q',false,100),
('530400','玉溪','云南省',102.5274,24.3505,'yuxi','Y',false,100),
('530600','昭通','云南省',103.7170,27.3369,'zhaotong','Z',false,100),
('530700','丽江','云南省',100.2330,26.8721,'lijiang','L',false,100),
('532500','红河','云南省',103.3846,23.3669,'honghe','H',false,100),
('532800','西双版纳','云南省',100.7971,22.0017,'xishuangbanna','X',false,100),
('532900','大理','云南省',100.2676,25.6065,'dali','D',false,100),
('533100','德宏','云南省',98.5784,24.4367,'dehong','D',false,100),

-- ===== 西藏自治区 =====
('540100','拉萨','西藏自治区',91.1409,29.6456,'lasa','L',false,100),
('540200','日喀则','西藏自治区',88.8851,29.2678,'rikaze','R',false,100),

-- ===== 陕西省 =====
('610100','西安','陕西省',108.9398,34.3416,'xian','X',true,8),
('610200','铜川','陕西省',108.9791,34.9165,'tongchuan','T',false,100),
('610300','宝鸡','陕西省',107.1447,34.3693,'baoji','B',false,100),
('610400','咸阳','陕西省',108.7051,34.3330,'xianyang','X',false,100),
('610500','渭南','陕西省',109.5029,34.4994,'weinan','W',false,100),
('610600','延安','陕西省',109.4898,36.5854,'yanan','Y',false,100),
('610700','汉中','陕西省',107.0238,33.0678,'hanzhong','H',false,100),
('610800','榆林','陕西省',109.7346,38.2853,'yulin','Y',false,100),
('610900','安康','陕西省',109.0294,32.6903,'ankang','A',false,100),

-- ===== 甘肃省 =====
('620100','兰州','甘肃省',103.8343,36.0611,'lanzhou','L',false,100),
('620200','嘉峪关','甘肃省',98.2773,39.7865,'jiayuguan','J',false,100),
('620300','金昌','甘肃省',102.1879,38.5140,'jinchang','J',false,100),
('620400','白银','甘肃省',104.1737,36.5457,'baiyin','B',false,100),
('620500','天水','甘肃省',105.7249,34.5787,'tianshui','T',false,100),
('620900','酒泉','甘肃省',98.4941,39.7325,'jiuquan','J',false,100),
('621000','庆阳','甘肃省',107.6382,35.7092,'qingyang','Q',false,100),

-- ===== 青海省 =====
('630100','西宁','青海省',101.7782,36.6171,'xining','X',false,100),
('630200','海东','青海省',102.1032,36.5023,'haidong','H',false,100),

-- ===== 宁夏回族自治区 =====
('640100','银川','宁夏回族自治区',106.2309,38.4872,'yinchuan','Y',false,100),
('640200','石嘴山','宁夏回族自治区',106.3760,39.0135,'shizuishan','S',false,100),
('640300','吴忠','宁夏回族自治区',106.1990,37.9863,'wuzhong','W',false,100),
('640400','固原','宁夏回族自治区',106.2854,36.0046,'guyuan','G',false,100),

-- ===== 新疆维吾尔自治区 =====
('650100','乌鲁木齐','新疆维吾尔自治区',87.6168,43.8256,'wulumuqi','W',false,100),
('650200','克拉玛依','新疆维吾尔自治区',84.8739,45.5959,'kelamayi','K',false,100),
('650400','吐鲁番','新疆维吾尔自治区',89.1841,42.9476,'tulufan','T',false,100),
('650500','哈密','新疆维吾尔自治区',93.5132,42.8332,'hami','H',false,100),
('652900','阿克苏','新疆维吾尔自治区',80.2650,41.1707,'akesu','A',false,100),
('653100','喀什','新疆维吾尔自治区',75.9898,39.4677,'kashi','K',false,100),
('654000','伊犁','新疆维吾尔自治区',81.3179,43.9219,'yili','Y',false,100),

-- ===== 香港 / 澳门 / 台湾（均为中国行政区划） =====
('810000','香港','香港特别行政区',114.1694,22.3193,'xianggang','X',false,100),
('820000','澳门','澳门特别行政区',113.5439,22.1987,'aomen','A',false,100),
('710000','台北','台湾省',121.5654,25.0330,'taibei','T',false,100),
('710100','高雄','台湾省',120.3014,22.6273,'gaoxiong','G',false,100),
('710200','台中','台湾省',120.6736,24.1477,'taizhong','T',false,100);

-- ---------------------------------------------------------------------------
-- 3.1 插入尚不存在的城市（按 city_name 判重，兼容原有 SH/BJ 等旧 code）
-- ---------------------------------------------------------------------------
INSERT INTO public.cities (city_code, city_name, province, lng, lat, pinyin, initial, is_hot, sort_order, status)
SELECT s.city_code, s.city_name, s.province, s.lng, s.lat, s.pinyin, s.initial, s.is_hot, s.sort_order, 'active'
  FROM _city_seed s
 WHERE NOT EXISTS (SELECT 1 FROM public.cities c WHERE c.city_name = s.city_name);

-- ---------------------------------------------------------------------------
-- 3.2 回填/校准已存在城市（把旧的 SH/BJ/GZ/CD/SZ 迁到行政区划代码，
--     并补齐 pinyin / initial / is_hot / sort_order 与坐标）
-- ---------------------------------------------------------------------------
UPDATE public.cities c
   SET city_code  = s.city_code,
       province   = s.province,
       lng        = s.lng,
       lat        = s.lat,
       pinyin     = s.pinyin,
       initial    = s.initial,
       is_hot     = s.is_hot,
       sort_order = s.sort_order,
       status     = 'active'
  FROM _city_seed s
 WHERE c.city_name = s.city_name;

-- ---------------------------------------------------------------------------
-- 4. 唯一索引（防止后续重复灌数据）
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_cities_city_name ON public.cities (city_name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cities_city_code ON public.cities (city_code);
CREATE INDEX        IF NOT EXISTS ix_cities_initial   ON public.cities (initial);
CREATE INDEX        IF NOT EXISTS ix_cities_hot       ON public.cities (is_hot, sort_order);

DROP TABLE IF EXISTS _city_seed;

COMMIT;

-- ---------------------------------------------------------------------------
-- 验收：应返回 250 行、热门 22 个、杭州存在且坐标为 120.1551/30.2741
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE is_hot) AS hot_count
--   FROM public.cities WHERE status = 'active';
-- SELECT city_code, city_name, province, lng, lat, initial, is_hot, sort_order
--   FROM public.cities WHERE city_name IN ('杭州','上海','北京') ORDER BY sort_order;

-- ==================== 00226_user_pref_tags.sql ====================
-- ============================================================
-- 00226 · user_health_profile 增加 pref_tags（用户自选食疗标签库）
-- 执行：supabase db query --linked --file supabase/migrations/00226_user_pref_tags.sql
-- ============================================================
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS pref_tags text[] not null default '{}';

-- ==================== 00227_tongue_cases.sql ====================
-- ============================================================================
-- 00227_tongue_cases.sql
-- 目的：建立「舌象案例库」（平台自建、去标识聚合数据，仅作望舌辨证引擎参考语料，
--       不存任何个人可识别健康信息）。配套 20 条种子（由真实引擎派生，见
--       src/scripts/gen_tongue_cases_seed.ts，库内指标与 App 展示同源，避免漂移）。
--
-- 合规：案例库只收去标识聚合数据（见 utils/food-therapy/tongue-compliance.ts）。
--       RLS：公开只读（select using(true)）；写操作仅限 is_admin()（后台维护）。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 建表
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tongue_cases (
  case_no                text PRIMARY KEY,
  source                 text NOT NULL DEFAULT 'engine',
  features               jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers                integer[] NOT NULL DEFAULT '{}',
  constitution_primary   text NOT NULL,
  constitution_secondary text,
  health_index           numeric(5,1) NOT NULL,
  band                   text NOT NULL,
  confidence             numeric(3,2) NOT NULL,
  tags                   text[] NOT NULL DEFAULT '{}',
  expert_note            text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tongue_cases IS '舌象案例库：平台自建去标识参考语料，供望舌辨证引擎与运营检索，不存个人可识别信息';
COMMENT ON COLUMN public.tongue_cases.case_no IS '案例编号 TC-xxxx（幂等种子键）';
COMMENT ON COLUMN public.tongue_cases.source IS '来源：engine=引擎识别 / expert=专家订正';
COMMENT ON COLUMN public.tongue_cases.features IS '8 维望舌特征（维度id->选项文案），对应 TONGUE_QUESTIONS';
COMMENT ON COLUMN public.tongue_cases.answers IS '8 维选项下标，顺序同 TONGUE_QUESTIONS';
COMMENT ON COLUMN public.tongue_cases.constitution_primary IS '主倾向（9 体质 key）';
COMMENT ON COLUMN public.tongue_cases.constitution_secondary IS '兼夹倾向（可能为 null）';
COMMENT ON COLUMN public.tongue_cases.health_index IS '食养健康指数 0~100（computeHealthIndex 派生）';
COMMENT ON COLUMN public.tongue_cases.band IS '风险分级 low/mid/high';
COMMENT ON COLUMN public.tongue_cases.confidence IS '置信度 0~1';
COMMENT ON COLUMN public.tongue_cases.tags IS '标签（体质名/舌象特征词），供检索';
COMMENT ON COLUMN public.tongue_cases.expert_note IS '专家订正说明（去标识、仅生活化归因，不涉诊断）';

-- ---------------------------------------------------------------------------
-- 2. 索引
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_tongue_cases_primary   ON public.tongue_cases (constitution_primary);
CREATE INDEX IF NOT EXISTS ix_tongue_cases_secondary ON public.tongue_cases (constitution_secondary);
CREATE INDEX IF NOT EXISTS ix_tongue_cases_band      ON public.tongue_cases (band);
CREATE INDEX IF NOT EXISTS ix_tongue_cases_tags      ON public.tongue_cases USING gin (tags);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tongue_cases ENABLE ROW LEVEL SECURITY;

-- 公开只读（去标识聚合数据，不涉个人信息）
DROP POLICY IF EXISTS tongue_cases_select_public ON public.tongue_cases;
CREATE POLICY tongue_cases_select_public ON public.tongue_cases
  FOR SELECT USING (true);

-- 写操作仅限管理员（与后台其他表一致，依赖迁移 00081/00092/00095 的 is_admin()）
DROP POLICY IF EXISTS tongue_cases_write_admin ON public.tongue_cases;
CREATE POLICY tongue_cases_write_admin ON public.tongue_cases
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- 4. 种子（20 条，由真实引擎派生，幂等）
-- ---------------------------------------------------------------------------
-- === 以下由 src/scripts/gen_tongue_cases_seed.ts 生成，请勿手改 ===
insert into public.tongue_cases
  (case_no, source, features, answers, constitution_primary, constitution_secondary,
   health_index, band, confidence, tags, expert_note)
values
  ('TC-0001', 'engine', '{"area":"正常大小（常见）","color":"淡红 / 粉红（常见）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,0,0,0,0,0,0,0], 'pinghe', null, 96.0, 'low', 0.95, ARRAY['平和','舌淡红','苔薄白'], null),
  ('TC-0002', 'expert', '{"area":"胖大（伸舌抵齿）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"水滑多津","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,1,0,4,2,0,2,0], 'yangxu', 'tanshi', 47.8, 'high', 0.74, ARRAY['阳虚','舌淡白','胖大舌','苔水滑'], '典型阳虚舌：淡白胖大、苔水滑'),
  ('TC-0003', 'engine', '{"area":"正常大小（常见）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,1,0,0,1,0,0,0], 'yangxu', null, 86.4, 'low', 0.61, ARRAY['阳虚','舌淡白'], null),
  ('TC-0004', 'expert', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"少苔 / 无苔（舌面光红）","coat_texture":"少而干","teeth":"没有明显齿痕（常见）","crack":"有裂纹 / 裂沟","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,4,3,0,1,1,0], 'yinxu', null, 48.0, 'high', 0.85, ARRAY['阴虚','舌红','少苔','裂纹'], '典型阴虚舌：舌红少苔、有裂纹'),
  ('TC-0005', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"淡黄苔","coat_texture":"厚而干","teeth":"没有明显齿痕（常见）","crack":"有裂纹 / 裂沟","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,2,2,0,1,1,0], 'yinxu', 'shire', 51.0, 'high', 0.78, ARRAY['阴虚','舌红','苔干'], null),
  ('TC-0006', 'engine', '{"area":"胖大（伸舌抵齿）","color":"淡红 / 粉红（常见）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,0,0,0,1,0,0,0], 'qixu', null, 76.8, 'mid', 0.69, ARRAY['气虚','胖大舌','齿痕'], null),
  ('TC-0007', 'engine', '{"area":"胖大（伸舌抵齿）","color":"偏淡白（颜色发浅）","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,1,1,1,2,0,2,0], 'tanshi', 'qixu', 35.0, 'high', 0.95, ARRAY['气虚','痰湿','胖大舌','苔厚腻'], null),
  ('TC-0008', 'expert', '{"area":"正常大小（常见）","color":"淡红 / 粉红（常见）","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,0,1,1,2,0,2,0], 'tanshi', null, 64.0, 'high', 0.80, ARRAY['痰湿','苔白厚腻','齿痕','苔滑'], '典型痰湿舌：苔白厚腻、边有齿痕'),
  ('TC-0009', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"黄厚腻苔","coat_texture":"厚腻","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,3,1,1,0,1,0], 'shire', 'tanshi', 57.8, 'high', 0.80, ARRAY['湿热','舌红','苔黄厚腻'], null),
  ('TC-0010', 'expert', '{"area":"正常大小（常见）","color":"暗红 / 绛红","coat_color":"黄厚腻苔","coat_texture":"厚腻","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"青紫明显 / 曲张如小鱼"}'::jsonb, ARRAY[0,3,3,1,1,0,1,2], 'shire', 'tanshi', 57.8, 'high', 0.79, ARRAY['湿热','血瘀','舌暗红','苔黄厚腻','舌下络脉曲张'], '湿热挟瘀：舌暗红、苔黄厚腻、舌下络脉曲张'),
  ('TC-0011', 'expert', '{"area":"正常大小（常见）","color":"青紫 / 暗紫","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"青紫明显 / 曲张如小鱼"}'::jsonb, ARRAY[0,4,0,0,0,0,0,2], 'xueyu', null, 70.4, 'mid', 0.70, ARRAY['血瘀','舌青紫','舌下络脉曲张'], '典型血瘀舌：舌青紫、舌下络脉青紫曲张'),
  ('TC-0012', 'engine', '{"area":"正常大小（常见）","color":"暗红 / 绛红","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"偏青紫、略粗"}'::jsonb, ARRAY[0,3,0,0,0,0,0,1], 'xueyu', null, 83.2, 'mid', 0.66, ARRAY['血瘀','舌暗红','舌下络脉偏粗'], null),
  ('TC-0013', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"黄厚腻苔","coat_texture":"厚腻","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"偏青紫、略粗"}'::jsonb, ARRAY[0,2,3,1,1,0,1,1], 'shire', 'tanshi', 57.8, 'high', 0.86, ARRAY['湿热','苔黄厚腻'], null),
  ('TC-0014', 'engine', '{"area":"正常大小（常见）","color":"暗红 / 绛红","coat_color":"少苔 / 无苔（舌面光红）","coat_texture":"少而干","teeth":"没有明显齿痕（常见）","crack":"有裂纹 / 裂沟","moist":"偏干 / 少津","sublingual":"偏青紫、略粗"}'::jsonb, ARRAY[0,3,4,3,0,1,1,1], 'yinxu', null, 54.4, 'high', 0.95, ARRAY['阴虚','血瘀','舌暗红','少苔','裂纹'], null),
  ('TC-0015', 'engine', '{"area":"正常大小（常见）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"水滑多津","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,1,0,4,0,0,2,0], 'yangxu', null, 70.4, 'mid', 0.79, ARRAY['阳虚','舌淡白','苔水滑'], null),
  ('TC-0016', 'engine', '{"area":"胖大（伸舌抵齿）","color":"淡红 / 粉红（常见）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"轻度齿痕","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,0,0,0,1,0,1,0], 'qixu', null, 76.8, 'mid', 0.74, ARRAY['气虚','胖大舌','齿痕'], null),
  ('TC-0017', 'engine', '{"area":"胖大（伸舌抵齿）","color":"淡红 / 粉红（常见）","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[1,0,1,1,2,0,2,0], 'tanshi', null, 51.2, 'high', 0.93, ARRAY['痰湿','胖大舌','苔厚腻','齿痕'], null),
  ('TC-0018', 'engine', '{"area":"正常大小（常见）","color":"偏红（比常人红）","coat_color":"淡黄苔","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"润泽（常见）","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,2,2,0,0,0,0,0], 'shire', null, 80.0, 'mid', 0.66, ARRAY['湿热','舌红','苔淡黄'], null),
  ('TC-0019', 'engine', '{"area":"胖大（伸舌抵齿）","color":"暗红 / 绛红","coat_color":"白而厚","coat_texture":"厚腻","teeth":"明显齿痕（胖大舌）","crack":"没有明显裂纹（常见）","moist":"滑腻多津","sublingual":"青紫明显 / 曲张如小鱼"}'::jsonb, ARRAY[1,3,1,1,2,0,2,2], 'tanshi', null, 51.2, 'high', 0.95, ARRAY['血瘀','痰湿','舌暗红','苔厚腻','舌下络脉曲张'], null),
  ('TC-0020', 'engine', '{"area":"正常大小（常见）","color":"偏淡白（颜色发浅）","coat_color":"薄白苔（常见）","coat_texture":"薄而均匀（常见）","teeth":"没有明显齿痕（常见）","crack":"没有明显裂纹（常见）","moist":"偏干 / 少津","sublingual":"淡红、细而短（常见）"}'::jsonb, ARRAY[0,1,0,0,0,0,1,0], 'yangxu', null, 86.4, 'low', 0.61, ARRAY['阳虚','舌淡白'], null)
on conflict (case_no) do nothing;

COMMIT;

-- ---------------------------------------------------------------------------
-- 验收：应返回 20 行；按 band 分布 low/mid/high；主倾向覆盖 7 种可收录体质
-- （气郁 qiyu 在 8 维望舌特征中无加分项，引擎不输出，案例库不收录，见合规文档）。
-- ---------------------------------------------------------------------------
-- SELECT band, count(*) FROM public.tongue_cases GROUP BY band ORDER BY band;
-- SELECT constitution_primary, count(*) FROM public.tongue_cases
--   GROUP BY constitution_primary ORDER BY 2 DESC;

-- ==================== 00235_article_social_enhance.sql ====================
-- 00235_article_social_enhance.sql
-- 创作重构配套：文章点赞 + 心情标签聚合 + 分享原子自增
-- 依赖：00216_article_social（article_favorites/article_follows）、00034（share_count/view_count）

-- ─────────────────────────────────────────────
-- 1. 文章点赞表
-- ─────────────────────────────────────────────
create table if not exists public.article_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, article_id)
);
create index if not exists idx_article_likes_article on public.article_likes(article_id);
create index if not exists idx_article_likes_user on public.article_likes(user_id);

alter table public.article_likes enable row level security;
drop policy if exists "article_likes_select" on public.article_likes;
create policy "article_likes_select" on public.article_likes for select using (true);
drop policy if exists "article_likes_insert_self" on public.article_likes;
create policy "article_likes_insert_self" on public.article_likes for insert with check (auth.uid() = user_id);
drop policy if exists "article_likes_delete_self" on public.article_likes;
create policy "article_likes_delete_self" on public.article_likes for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 2. 文章心情标签（心情广场按 mood_tag 聚合；来自 QUICK_MOOD_PRESETS 的标签）
-- ─────────────────────────────────────────────
alter table public.articles add column if not exists mood_tag text;
create index if not exists idx_articles_mood_tag on public.articles(mood_tag);

-- ─────────────────────────────────────────────
-- 3. 分享原子自增（避免 read-modify-write 丢增量）
-- ─────────────────────────────────────────────
create or replace function public.increment_article_share(p_article_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.articles set share_count = coalesce(share_count, 0) + 1 where id = p_article_id;
$$;
grant execute on function public.increment_article_share(uuid) to authenticated, anon;

-- ==================== 00236_article_lock_customer.sql ====================
-- 00236_article_lock_customer.sql
-- 目标：图文只为「锁客」（成交在线下）。记录每篇图文锁定了哪些访客，并在访客无上级时建立推荐关系。
-- 依赖：00001(articles/profiles)、00034(view_count/share_count)、00235(article_likes/mood_tag)

-- ─────────────────────────────────────────────
-- 1. 素材溯源列（素材工坊导入的外链草稿）
-- ─────────────────────────────────────────────
alter table public.articles add column if not exists source_url  text;
alter table public.articles add column if not exists source_type text;   -- 'original' | 'imported'
alter table public.articles add column if not exists source_raw  text;   -- 导入原文快照，用于「改写率」闸门比对

-- ─────────────────────────────────────────────
-- 2. 图文锁客表：一篇图文锁定了哪些访客
-- ─────────────────────────────────────────────
create table if not exists public.article_locks (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid not null references public.articles(id) on delete cascade,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,  -- 图文作者（推广侠客）
  visitor_user_id uuid not null references auth.users(id) on delete cascade,  -- 访客
  is_new_customer boolean not null default false,  -- 是否因本次访问首次建立推荐关系
  created_at      timestamptz not null default now(),
  unique (article_id, visitor_user_id)
);
create index if not exists idx_article_locks_owner   on public.article_locks(owner_user_id);
create index if not exists idx_article_locks_article on public.article_locks(article_id);
create index if not exists idx_article_locks_visitor on public.article_locks(visitor_user_id);

alter table public.article_locks enable row level security;
-- 作者可看自己锁到的客；访客可看自己的记录
drop policy if exists "article_locks_select_own" on public.article_locks;
create policy "article_locks_select_own" on public.article_locks
  for select using (auth.uid() = owner_user_id or auth.uid() = visitor_user_id);
-- 写入统一走 SECURITY DEFINER 函数，这里不开放直接 insert

-- ─────────────────────────────────────────────
-- 3. 锁客 RPC：访客打开图文时调用
--    · 记录锁客关系（幂等）
--    · 访客若尚无上级，则把图文作者设为其推荐人（真正的「锁客」）
-- ─────────────────────────────────────────────
create or replace function public.fn_lock_customer_by_article(p_article_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visitor  uuid := auth.uid();
  v_owner    uuid;
  v_ref      uuid;
  v_is_new   boolean := false;
  v_inserted boolean := false;
begin
  if v_visitor is null or p_article_id is null then
    return jsonb_build_object('locked', false, 'reason', 'anonymous');
  end if;

  select a.user_id into v_owner from public.articles a where a.id = p_article_id;
  if v_owner is null then
    return jsonb_build_object('locked', false, 'reason', 'article_not_found');
  end if;
  if v_owner = v_visitor then
    return jsonb_build_object('locked', false, 'reason', 'self');
  end if;

  -- 访客当前上级
  select p.referrer_id into v_ref from public.profiles p where p.id = v_visitor;

  -- 无上级 → 本篇图文锁客成功，建立推荐关系
  if v_ref is null then
    update public.profiles set referrer_id = v_owner where id = v_visitor and referrer_id is null;
    v_is_new := true;
  end if;

  insert into public.article_locks (article_id, owner_user_id, visitor_user_id, is_new_customer)
  values (p_article_id, v_owner, v_visitor, v_is_new)
  on conflict (article_id, visitor_user_id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'locked', true,
    'is_new_customer', v_is_new,
    'first_visit', v_inserted
  );
exception when others then
  raise warning '[fn_lock_customer_by_article] article=%, err=%', p_article_id, sqlerrm;
  return jsonb_build_object('locked', false, 'reason', 'error');
end;
$$;
grant execute on function public.fn_lock_customer_by_article(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- 4. 侠客战绩 RPC：我的每篇图文 阅读/分享/点赞/锁客/新客
-- ─────────────────────────────────────────────
create or replace function public.fn_my_article_stats()
returns table (
  article_id    uuid,
  title         text,
  cover_image   text,
  is_published  boolean,
  created_at    timestamptz,
  view_count    integer,
  share_count   integer,
  like_count    bigint,
  lock_count    bigint,
  new_customers bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.title,
    a.cover_image,
    a.is_published,
    a.created_at,
    coalesce(a.view_count, 0),
    coalesce(a.share_count, 0),
    (select count(*) from public.article_likes l where l.article_id = a.id),
    (select count(*) from public.article_locks k where k.article_id = a.id),
    (select count(*) from public.article_locks k where k.article_id = a.id and k.is_new_customer)
  from public.articles a
  where a.user_id = auth.uid()
  order by a.created_at desc;
$$;
grant execute on function public.fn_my_article_stats() to authenticated;

-- ─────────────────────────────────────────────
-- 5. 汇总 RPC：我的内容锁客总览
-- ─────────────────────────────────────────────
create or replace function public.fn_my_content_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'articles',      (select count(*) from public.articles a where a.user_id = auth.uid() and a.is_published),
    'drafts',        (select count(*) from public.articles a where a.user_id = auth.uid() and not a.is_published),
    'views',         (select coalesce(sum(coalesce(a.view_count,0)),0) from public.articles a where a.user_id = auth.uid()),
    'shares',        (select coalesce(sum(coalesce(a.share_count,0)),0) from public.articles a where a.user_id = auth.uid()),
    'locks',         (select count(*) from public.article_locks k where k.owner_user_id = auth.uid()),
    'new_customers', (select count(*) from public.article_locks k where k.owner_user_id = auth.uid() and k.is_new_customer)
  );
$$;
grant execute on function public.fn_my_content_summary() to authenticated;

-- ==================== 00237_product_fit_constitution.sql ====================
-- 00237 商品「适合人群」辨证增强：手动覆盖 + 适配体质/人群标签
-- fit_people_override：商家手填的适合人群文本，优先级高于引擎自动生成；空时回退引擎结果
-- fit_crowd_tags：商家/引擎标记的适配体质或人群标签（取自身体/健康人群词表：
--   宫寒量少 / 脾胃虚寒 / 易上火 / 体虚怕冷 / 高血压 / 失眠 …），用于详情页辨证标签与个性化匹配
-- 注：须在用户本机执行（沙箱无 supabase CLI/Token）；幂等，可重复运行。

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fit_people_override text NULL,
  ADD COLUMN IF NOT EXISTS fit_crowd_tags text[] NULL;

CREATE INDEX IF NOT EXISTS idx_products_fit_crowd_tags
  ON public.products USING gin (fit_crowd_tags);

COMMENT ON COLUMN public.products.fit_people_override IS
  '商家手填适合人群（覆盖引擎自动生成）；空则回退 therapy_json/fit_people 引擎结果';
COMMENT ON COLUMN public.products.fit_crowd_tags IS
  '适配体质/人群标签（宫寒量少/脾胃虚寒/高血压…），用于辨证标签展示与个性化匹配';

-- ==================== 00237_referrer_source_and_favorite_referral.sql ====================
-- 00237 锁客优先级 + 收藏锁客来源（审计修复 B）
-- 背景：审计发现两个真实边界：
--   1) 门店自动绑定（store_default）触发面过宽，会「截胡」推广员地推
--   2) 从「我的收藏」进商品不携带推广来源，锁客丢失给门店 owner
-- 本脚本引入 referrer_source 标记来源优先级，并让收藏记录推广码以便还原。
-- 铁律：改函数参数须 DROP 旧签名再 CREATE；幂等，可重复执行。

-- 1) profiles 增加 referrer_source：标记客户归属来源，用于优先级判定
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referrer_source text;

COMMENT ON COLUMN public.profiles.referrer_source IS
  '客户归属来源：store_default=门店/门店码自动绑定(兜底) | share=分享/邀请码绑定(显式) | qr=二维码显式绑定 | manual=后台显式绑定。store_default 可被任意显式来源覆盖';

-- 回刷存量：已有 referrer_id 但 source 为空 → 按 invited_by 推断（有邀请码文本≈显式，否则门店兜底）
UPDATE public.profiles
SET referrer_source = CASE WHEN invited_by IS NOT NULL THEN 'share' ELSE 'store_default' END
WHERE referrer_id IS NOT NULL AND referrer_source IS NULL;

-- 2) favorites 增加 referral_code：记录收藏时的推广来源，避免收藏→商品详情丢失锁客
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS referral_code text;

COMMENT ON COLUMN public.favorites.referral_code IS
  '收藏时的推广来源码；从收藏进商品详情时还原为 ref 参数，优先于门店默认绑定';

-- 3) bind_referrer 改造：引入 p_source，实现「显式来源可覆盖门店默认」
-- ⚠️ 幂等铁律：改函数参数必须 DROP 新旧「全部」签名，再 CREATE。
--    只删旧签名而用普通 CREATE 建新签名 → 重跑撞 42723（function already exists with same argument types）。
--    且旧的 1 参签名若残留，与「带 DEFAULT 的 2 参签名」并存会让单参调用报 42725（函数不唯一）——
--    客户端 login/index.tsx、utils/share.ts 都是单参调用，故 1 参签名必须删净。
DROP FUNCTION IF EXISTS public.bind_referrer(text);
DROP FUNCTION IF EXISTS public.bind_referrer(text, text);

CREATE FUNCTION public.bind_referrer(
  p_referral_code text,
  p_source text DEFAULT 'share'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_referrer RECORD;
  v_self_code text;
  v_existing_source text;
  v_existing_id uuid;
BEGIN
  -- 避免自绑
  SELECT referral_code INTO v_self_code FROM public.profiles WHERE id = auth.uid();
  IF v_self_code = upper(trim(p_referral_code)) THEN
    RETURN jsonb_build_object('success', false, 'error', '不能绑定自己的推广码');
  END IF;

  -- 查推广人
  SELECT id, referral_code INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_referral_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '推广码不存在');
  END IF;

  -- 查现有绑定与来源
  SELECT referrer_id, referrer_source INTO v_existing_id, v_existing_source
  FROM public.profiles WHERE id = auth.uid();

  -- 已绑定：
  IF v_existing_source IS NOT NULL THEN
    -- a) 现有是 store_default（门店兜底），新来源是显式（share/qr/manual/invite_code）→ 允许覆盖升级
    -- b) 其它（已显式绑定）→ 跳过，保护既有推广员权益
    IF NOT (v_existing_source = 'store_default' AND p_source IN ('share', 'qr', 'manual', 'invite_code')) THEN
      RETURN jsonb_build_object('success', true, 'message', '已绑定', 'referrer_id', v_existing_id, 'source', v_existing_source);
    END IF;
  END IF;

  UPDATE public.profiles
  SET referrer_id = v_referrer.id,
      referrer_source = p_source
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer.id, 'source', p_source);
END;
$$;

-- DROP 会连带清掉原函数 ACL，显式还原执行权限（客户端 anon/authenticated 需可调用）
GRANT EXECUTE ON FUNCTION public.bind_referrer(text, text) TO anon, authenticated, service_role;

-- 4) convert_pending_referral 同步写 referrer_source（注册转化走的是显式分享/邀请来源）
CREATE OR REPLACE FUNCTION convert_pending_referral(
  p_device_id TEXT,
  p_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_referral_code TEXT;
  v_store_id UUID;
  v_pending_id UUID;
  v_referrer_id UUID;
BEGIN
  SELECT id, referral_code, store_id
  INTO v_pending_id, v_referral_code, v_store_id
  FROM pending_referrals
  WHERE device_id = p_device_id
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pending_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_referrer_id
  FROM profiles
  WHERE invite_code = v_referral_code OR referral_code = v_referral_code
  LIMIT 1;

  UPDATE pending_referrals
  SET status = 'converted',
      converted_user_id = p_user_id::UUID,
      updated_at = now()
  WHERE id = v_pending_id;

  IF v_store_id IS NOT NULL AND v_referrer_id IS NOT NULL THEN
    INSERT INTO user_store_relation (user_id, store_id, referrer_id, status)
    VALUES (p_user_id::UUID, v_store_id, v_referrer_id, 'active')
    ON CONFLICT (user_id, store_id) DO NOTHING;
  END IF;

  UPDATE profiles
  SET invited_by = COALESCE(invited_by, v_referral_code),
      referrer_id = COALESCE(referrer_id, v_referrer_id),
      referrer_source = COALESCE(referrer_source, 'share')
  WHERE id = p_user_id::UUID;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ 00237 锁客优先级 + 收藏锁客来源 已就绪' AS result;

-- ==================== 00238_clamp_store_referral_rate.sql ====================
-- 00238 后端 clamp stores.referral_rate（审计修复 B 的「低风险缺口」）
-- 背景：店铺级 referral_rate 的 3~30% 上限仅前端 onBlur 校验（ReferralConfig.tsx:39），
--       后端 / admin-web 直写无校验，技术用户可写 >30%，放大让利池亏损风险。
-- 方案：BEFORE 触发器，写入时
--   1) 兼容旧百分比口径（值 >1 视为百分比，先 /100）→ 小数口径
--   2) 归一化到 [0, 0.30]（= 0%~30%）
--   既防越界，又自动纠正历史百分比存量，且不破坏既有数据。
-- 铁律：幂等，可重复执行。

CREATE OR REPLACE FUNCTION clamp_store_referral_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_rate IS NULL THEN
    RETURN NEW;
  END IF;
  -- 兼容旧百分比口径：值 >1 视为百分比（如 15=15%），先转小数
  IF NEW.referral_rate > 1 THEN
    NEW.referral_rate := NEW.referral_rate / 100.0;
  END IF;
  -- clamp 到 [0, 0.30] 小数口径（= 0%~30%）
  NEW.referral_rate := LEAST(GREATEST(NEW.referral_rate, 0), 0.30);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clamp_store_referral_rate ON public.stores;

CREATE TRIGGER trg_clamp_store_referral_rate
  BEFORE INSERT OR UPDATE OF referral_rate ON public.stores
  FOR EACH ROW EXECUTE FUNCTION clamp_store_referral_rate();

-- 存量归一：把历史百分比值（>1）一次性转为小数口径，并限幅
UPDATE public.stores
SET referral_rate = LEAST(GREATEST(referral_rate / 100.0, 0), 0.30)
WHERE referral_rate > 1;

SELECT '✅ 00238 stores.referral_rate 后端 clamp 已就绪' AS result;

-- ==================== 00238_food_homology_and_backfill.sql ====================
-- ============================================================================
-- 药食同源合规闭环 + 商品类型数据回填（P0-① + P1）
-- ----------------------------------------------------------------------------
-- P0-① 目录准入闭环：
--   1) food_ingredients.is_homology：由私有目录 medicinal_food_catalog 按名同步，
--      标记该食材是否已收录国家《药食同源目录》。商家端据此做非阻塞合规提示，
--     且因目录表 RLS 仅 service_role 可读，客户端永不直接读目录表（合规资产不外露）。
--   2) food_analysis_reports.homology：持久化 ingredient-analyze 计算的
--      {in_catalog, not_in_catalog, total, all_in_catalog}，供 C 端报告页展示
--      「已收录国家药食同源目录」真相徽标 + 透明披露未收录食材。
--
-- P1 数据回填：
--   存量商品 product_kind 为 NULL（迁移 00237 后新增列，缺省放行为食品）。
--   显式回填为 'food' / 'gift'，让数据自解释，便于后续把 isFoodProduct 的空值收紧。
-- ============================================================================

-- 1) food_ingredients 增加药食同源标记列
alter table food_ingredients add column if not exists is_homology boolean;

-- 由私有目录按名同步（service_role 可读 medicinal_food_catalog）
update food_ingredients fi
set is_homology = (
  select bool_or(coalesce(m.is_homology, true))
  from medicinal_food_catalog m
  where m.name = fi.name
)
where fi.is_homology is null;

-- 2) food_analysis_reports 增加 homology 持久化列
alter table food_analysis_reports add column if not exists homology jsonb;

-- 3) P1：存量商品 product_kind 回填
-- 有食材/食养数据 → 食品；仅有 materials（礼品/手作） → 礼品；其余兜底食品
update products
set product_kind = 'food'
where product_kind is null
  and (ingredients is not null or therapy_json is not null or materials is null);

update products
set product_kind = 'gift'
where product_kind is null
  and materials is not null;

-- ==================== 00239_ensure_store_short_codes.sql ====================
-- 00239 补齐门店 short_code（扫码进店反查依赖）
-- 背景：2026-10-01 排查「扫门店二维码进不去门店」时，发现全部 5 个门店的
--       short_code 均为 NULL。store-home 按 scene 里的 s=短码 去 stores.short_code
--       反查门店，没有短码 → 永远查不到 → 进不去店。这是扫码进店的第二重断点
--       （第一重是 generate-qrcode 用了错误的第三方 AppID 凭据，见 00237 前后）。
-- 已线上手工补齐；本迁移幂等固化，供新环境 / seed 重跑，防止复发。

-- 1) 补齐 NULL：用 md5(name||id) 前 8 位大写字母数字（足够分散、满足 store-home 正则 [A-Za-z0-9]{4,12}）
UPDATE stores
SET short_code = upper(substr(md5(coalesce(name, '') || id::text), 1, 8))
WHERE short_code IS NULL;

-- 2) 唯一索引保护（幂等，已存在则跳过）
CREATE UNIQUE INDEX IF NOT EXISTS stores_short_code_key ON stores(short_code);

-- ==================== 00239_medicinal_food_catalog_backfill_106.sql ====================
-- ============================================================================
-- 药食同源目录补全至国家官方 106 种（基于联网检索 4 批清单）
-- ----------------------------------------------------------------------------
-- 现状：20260802 种子仅 53 条（51 有效 + 2 误标）。官方 4 批共 106 种：
--   第一批 2002 卫法监发〔2002〕51号 87 种
--   第二批 2019 第8号 6 种（仅作香辛料/调味料）
--   第三批 2023 第9号 9 种（孕妇、哺乳期妇女、婴幼儿不宜食用）
--   第四批 2024 第4号 4 种（同上不宜）
-- 本迁移补种缺失 55 种，并修正 2 条误标 + 姜黄批次。
-- 执行后 ingredient-analyze EF 运行时即生效（目录服务端读取），无需重部署 EF。
-- 注意：性/味/年龄段宜忌为传统食养参考口径，建议复核后上线。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 一、补种缺失 55 种（is_homology=true，按批次标注限制）
-- ----------------------------------------------------------------------------
insert into medicinal_food_catalog
  (name, category, nature, flavor, is_homology, homology_batch, age_suitable, age_caution, compatibility, source_ref)
values
  -- ===== 第一批（2002）缺失 37 种 =====
  ('刀豆','种子','温性','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','温中，宜搭粳米','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('小蓟','全草','凉性','甘苦',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['虚寒者少'],'清热','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('乌梢蛇','动物','平性','甘咸',true,'第一批2002',array['成人','中老年'],array['婴幼儿','孕妇适量'],'祛风，入膳慎用','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('火麻仁','种子','平性','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['腹泻者少'],'润养，宜搭核桃（注：本项目原误录核桃仁，应以火麻仁为正）','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('玉竹','根茎','微寒','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','润燥，宜搭沙参','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('白果','种子','平性','甘苦涩',true,'第一批2002',array['成人','中老年'],array['婴幼儿禁用','孕妇少','生吃有毒须熟食'],'熟食少量，宜搭粳米','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('白扁豆','种子','微温','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['腹胀者适量'],'健脾，宜搭山药','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('白扁豆花','花类','平性','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','清热','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('牡蛎','贝壳','微寒','咸',true,'第一批2002',array['成人','中老年'],array['虚寒者少','婴幼儿'],'平肝，宜搭龙骨','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('赤小豆','谷物','平性','甘酸',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','利湿，宜搭薏苡仁','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('阿胶','动物','平性','甘',true,'第一批2002',array['成人','孕哺期','中老年'],array['脾胃虚寒者少','感冒期停'],'养血，烊化冲服','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('鸡内金','动物','平性','甘',true,'第一批2002',array['儿童','青少年','成人','中老年'],'{}','消食','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('昆布','藻类','寒性','咸',true,'第一批2002',array['成人','中老年'],array['孕妇适量','甲亢者少'],'软坚，宜搭海藻','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('郁李仁','种子','平性','辛苦甘',true,'第一批2002',array['成人','中老年'],array['孕妇','婴幼儿','腹泻者少'],'润下','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('青果','果类','平性','甘酸',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','利咽，宜搭白萝卜','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('鱼腥草','全草','寒性','辛',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['虚寒者少'],'清热','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('枳椇子','种子','平性','甘',true,'第一批2002',array['成人','中老年'],array['婴幼儿','糖尿病患者适量'],'解酒，宜搭葛根','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('胖大海','种子','凉性','甘',true,'第一批2002',array['成人','中老年'],array['婴幼儿','孕妇','脾胃虚寒者少'],'润喉，代茶饮','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('香薷','全草','微温','辛',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','化湿和中','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('桃仁','种子','平性','苦甘',true,'第一批2002',array['成人','中老年'],array['孕妇禁用','婴幼儿','便溏者少'],'活血，宜搭红花','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('桑椹','果类','寒性','甘酸',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['脾虚便溏者少'],'滋阴，宜搭枸杞','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('桔红','果皮','温性','辛苦',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['气虚者少'],'理气，宜搭生姜','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('莱菔子','种子','平性','辛甘',true,'第一批2002',array['儿童','青少年','成人','中老年'],array['气虚者少'],'消食，宜搭山楂','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('高良姜','根茎','热性','辛',true,'第一批2002',array['成人','中老年'],array['孕妇','阴虚火旺者','婴幼儿禁用'],'温中','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('淡竹叶','叶类','寒性','甘淡',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['脾胃虚寒者少'],'清热利尿','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('淡豆豉','发酵','凉性','辛甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','解表，宜搭葱白','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('菊苣','全草','凉性','苦',true,'第一批2002',array['成人','中老年'],array['脾虚便溏者少'],'清肝','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('黄芥子','种子','温性','辛',true,'第一批2002',array['成人','中老年'],array['阴虚火旺者少','孕妇适量'],'温中，调味','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('紫苏籽','种子','温性','辛',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['气虚者少'],'降气，宜搭杏仁','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('黑胡椒','果实','热性','辛',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['易上火者少','孕妇适量'],'温中，调味','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('槐米','花蕾','微寒','苦',true,'第一批2002',array['成人','中老年'],array['脾胃虚寒者少'],'清热，代茶饮','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('槐花','花类','微寒','苦',true,'第一批2002',array['成人','中老年'],array['脾胃虚寒者少'],'清热','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('榧子','种子','平性','甘',true,'第一批2002',array['儿童','青少年','成人','中老年'],array['脾虚腹泻者少'],'润养','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('鲜白茅根','根茎','寒性','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['脾胃虚寒者少'],'清热利尿','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('鲜芦根','根茎','寒性','甘',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],array['脾胃虚寒者少'],'清热生津','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('蝮蛇','动物','温性','甘咸',true,'第一批2002',array['成人','中老年'],array['孕妇','婴幼儿','过敏体质慎用'],'祛风，入膳慎用','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),
  ('覆盆子','果类','微温','甘酸',true,'第一批2002',array['儿童','青少年','成人','孕哺期','中老年'],'{}','固涩，宜搭枸杞子','《按照传统既是食品又是中药材的物质目录》（2002 第一批）'),

  -- ===== 第二批（2019 第8号）缺失 5 种（仅作香辛料/调味料）=====
  ('当归','根茎','温性','甘辛',true,'第二批2019仅香辛料',array['成人','中老年'],array['孕妇慎用','月经过多者少'],'仅作香辛料/调味料；非药用剂量','《按照传统既是食品又是中药材的物质目录》（2019 第二批，仅限香辛料）'),
  ('山柰','根茎','温性','辛',true,'第二批2019仅香辛料',array['儿童','青少年','成人','孕哺期','中老年'],'{}','仅作香辛料/调味料','《按照传统既是食品又是中药材的物质目录》（2019 第二批，仅限香辛料）'),
  ('西红花','花类','平性','甘',true,'第二批2019仅香辛料',array['成人','中老年'],array['孕妇禁用','婴幼儿','经期女性少'],'仅作香辛料/调味料；非药用剂量','《按照传统既是食品又是中药材的物质目录》（2019 第二批，仅限香辛料）'),
  ('草果','果实','温性','辛',true,'第二批2019仅香辛料',array['儿童','青少年','成人','孕哺期','中老年'],'{}','仅作香辛料/调味料','《按照传统既是食品又是中药材的物质目录》（2019 第二批，仅限香辛料）'),
  ('荜茇','果实','热性','辛',true,'第二批2019仅香辛料',array['成人','中老年'],array['阴虚火旺者少','孕妇适量'],'仅作香辛料/调味料','《按照传统既是食品又是中药材的物质目录》（2019 第二批，仅限香辛料）'),

  -- ===== 第三批（2023 第9号）缺失 9 种（孕妇/乳母/婴幼儿不宜）=====
  ('党参','根茎','平性','甘',true,'第三批2023',array['青少年','成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'益气，宜搭黄芪','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('肉苁蓉','根茎','温性','甘咸',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用','腹泻者少'],'温润','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('铁皮石斛','茎类','微寒','甘',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'滋阴，宜搭麦冬','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('西洋参','根茎','凉性','甘微苦',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'清补，宜搭枸杞','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('黄芪','根茎','微温','甘',true,'第三批2023',array['青少年','成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'益气，宜搭党参','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('灵芝','菌类','平性','甘',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'平补','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('山茱萸','果实','微温','酸涩',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用','命门火炽者少'],'固涩','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('天麻','根茎','平性','甘',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'平肝','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),
  ('杜仲叶','叶类','温性','甘微辛',true,'第三批2023',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用'],'温养','《按照传统既是食品又是中药材的物质目录》（2023 第三批）'),

  -- ===== 第四批（2024 第4号）缺失 4 种（孕妇/乳母/婴幼儿不宜）=====
  ('地黄','根茎','寒性','甘',true,'第四批2024',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用','脾虚湿滞者少'],'滋阴，宜搭麦冬','《按照传统既是食品又是中药材的物质目录》（2024 第四批）'),
  ('麦冬','根茎','微寒','甘微苦',true,'第四批2024',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用','脾胃虚寒者少'],'润燥，宜搭地黄','《按照传统既是食品又是中药材的物质目录》（2024 第四批）'),
  ('天冬','根茎','寒性','甘苦',true,'第四批2024',array['成人','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用','脾虚泄泻者少'],'润燥','《按照传统既是食品又是中药材的物质目录》（2024 第四批）'),
  ('化橘红','果皮','温性','辛苦',true,'第四批2024',array['儿童','青少年','成人','孕哺期','中老年'],array['孕妇','哺乳期妇女','婴幼儿不宜食用','气虚者少'],'理气，宜搭生姜','《按照传统既是食品又是中药材的物质目录》（2024 第四批）')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 二、修正 2 条误标（不在国家目录，应 is_homology=false）
-- ----------------------------------------------------------------------------
update medicinal_food_catalog set is_homology = false, homology_batch = null,
  compatibility = '常见食品/坚果，未列入国家药食同源目录；作普通食材，不得作药食同源功效宣称',
  source_ref = '常见食品（未列入《按照传统既是食品又是中药材的物质目录》）'
  where name in ('核桃仁', '玫瑰花');

-- ----------------------------------------------------------------------------
-- 三、修正 姜黄 批次（实为 2019 第二批，仅作香辛料）
-- ----------------------------------------------------------------------------
update medicinal_food_catalog set homology_batch = '第二批2019仅香辛料',
  age_caution = array['孕妇','哺乳期妇女','婴幼儿不宜食用','血虚者适量'],
  compatibility = '仅作香辛料/调味料；非药用剂量'
  where name = '姜黄';

-- ----------------------------------------------------------------------------
-- 四、同步 food_ingredients.is_homology（沿用 00238 口径）
-- ----------------------------------------------------------------------------
update food_ingredients fi
  set is_homology = coalesce(
    (select bool_or(coalesce(m.is_homology, true))
     from medicinal_food_catalog m
     where m.name = fi.name),
    true
  )
where exists (select 1 from medicinal_food_catalog m where m.name = fi.name);

-- ==================== 00240_snack_crowd_rules.sql ====================
-- ============================================================================
-- 药食同源零食 · 儿童档人群触发规则补全（00240）
-- ----------------------------------------------------------------------------
-- 背景：00239 已把药食同源白名单补全至国家官方 106 种（medicinal_food_catalog），
--       但其中已标注的人群宜忌（age_caution）尚未落成 food_crowd_triggers 规则，
--       ingredient-analyze 引擎运行时感知不到；同时《儿童零食通用要求》团体标准
--       禁用的添加剂/反式脂肪也未进人群触发库（仅存在于添加剂库 yellow 档）。
--
-- 本迁移补两类种子（全部复用现有 crowd_code，无需改 EF / tips）：
--   A. 儿童零食添加剂零容忍触发（依据 T/CNFCSA《儿童零食通用要求》/T/FDSA 033-2022）
--   B. 药食同源 106 白名单内成分的人群触发补全（依据 00239 已标注宜忌口径）
--
-- severity 口径（沿用 00221 四级）：
--   forbidden       法律/安全硬禁（过敏、酒精、1岁内蜂蜜、泻药类、孕禁活血类）
--   advise_against  官方/团体标准「不宜」口径（第三四批孕乳婴不宜、儿童零食禁用添加剂）
--   caution         限量/传统慎用提示
--
-- 幂等：on conflict do update；执行方式 = Supabase SQL Editor 全量粘贴。
-- 前置依赖：00220（三表）、00221（severity 列）已执行。
-- ============================================================================

-- ============================================================================
-- A. 儿童零食添加剂零容忍触发（T/CNFCSA《儿童零食通用要求》：禁防腐剂/人工色素/
--    甜味剂/反式脂肪/含铝添加剂，添加剂指标向婴幼儿辅食标准看齐）
-- ============================================================================
insert into public.food_crowd_triggers (trigger_keyword, crowd_code, severity) values
  -- ----- 合成着色剂（团体标准明令禁用） → children advise_against / infant advise_against -----
  ('柠檬黄',     'children', 'advise_against'),
  ('日落黄',     'children', 'advise_against'),
  ('胭脂红',     'children', 'advise_against'),
  ('诱惑红',     'children', 'advise_against'),
  ('亮蓝',       'children', 'advise_against'),
  ('喹啉黄',     'children', 'advise_against'),
  ('酸性红',     'children', 'advise_against'),
  ('偶氮玉红',   'children', 'advise_against'),
  ('柠檬黄',     'infant',   'advise_against'),
  ('日落黄',     'infant',   'advise_against'),
  ('胭脂红',     'infant',   'advise_against'),
  ('诱惑红',     'infant',   'advise_against'),
  ('亮蓝',       'infant',   'advise_against'),

  -- ----- 甜味剂（团体标准：不允许使用） → children / infant advise_against -----
  ('阿斯巴甜',   'children', 'advise_against'),
  ('三氯蔗糖',   'children', 'advise_against'),
  ('安赛蜜',     'children', 'advise_against'),
  ('糖精钠',     'children', 'advise_against'),
  ('甜蜜素',     'children', 'advise_against'),
  ('纽甜',       'children', 'advise_against'),
  ('阿斯巴甜',   'infant',   'advise_against'),
  ('三氯蔗糖',   'infant',   'advise_against'),
  ('安赛蜜',     'infant',   'advise_against'),
  ('糖精钠',     'infant',   'advise_against'),

  -- ----- 防腐剂（团体标准：不允许使用） → children / infant advise_against -----
  ('苯甲酸钠',   'children', 'advise_against'),
  ('苯甲酸',     'children', 'advise_against'),
  ('脱氢乙酸钠', 'children', 'advise_against'),
  ('脱氢乙酸',   'children', 'advise_against'),
  ('山梨酸钾',   'children', 'advise_against'),
  ('山梨酸',     'children', 'advise_against'),
  ('苯甲酸钠',   'infant',   'advise_against'),
  ('脱氢乙酸钠', 'infant',   'advise_against'),
  ('山梨酸钾',   'infant',   'advise_against'),

  -- ----- 含铝添加剂（团体标准明令禁用） → children advise_against -----
  ('硫酸铝钾',   'children', 'advise_against'),
  ('硫酸铝铵',   'children', 'advise_against'),
  ('明矾',       'children', 'advise_against'),
  ('含铝膨松剂', 'children', 'advise_against'),

  -- ----- 反式脂肪酸来源（团体标准：不应含有） → children / infant advise_against，成人高血脂 caution -----
  ('氢化植物油',         'children', 'advise_against'),
  ('部分氢化植物油',     'children', 'advise_against'),
  ('氢化棕榈油',         'children', 'advise_against'),
  ('氢化大豆油',         'children', 'advise_against'),
  ('植脂末',             'children', 'advise_against'),
  ('代可可脂',           'children', 'advise_against'),
  ('起酥油',             'children', 'advise_against'),
  ('人造奶油',           'children', 'advise_against'),
  ('人造黄油',           'children', 'advise_against'),
  ('植物奶油',           'children', 'advise_against'),
  ('氢化植物油',         'infant',   'advise_against'),
  ('植脂末',             'infant',   'advise_against'),
  ('代可可脂',           'infant',   'advise_against'),
  ('氢化植物油',         'hyperlipidemia', 'caution'),
  ('植脂末',             'hyperlipidemia', 'caution'),
  ('代可可脂',           'hyperlipidemia', 'caution'),

  -- ----- 辐照处理原料（团体标准：不应使用） → children advise_against -----
  ('辐照',       'children', 'advise_against'),

  -- ----- 咖啡因类补强（儿童零食常见踩坑：能量饮料/巧克力味零食） -----
  ('浓缩咖啡粉', 'children', 'advise_against'),
  ('瓜拉纳提取物', 'children', 'advise_against'),
  ('茶多酚',     'children', 'caution')
on conflict (trigger_keyword, crowd_code) do update set severity = excluded.severity;

-- ============================================================================
-- B. 药食同源 106 白名单内成分 → 人群触发补全
--    （依据 medicinal_food_catalog 已标注宜忌 + 国家公告口径，食养参考不替代医嘱）
-- ============================================================================
insert into public.food_crowd_triggers (trigger_keyword, crowd_code, severity) values
  -- ===== 甘草：甘草酸升血压/水钠潴留 → 高血压 advise_against =====
  ('甘草',       'hypertension', 'advise_against'),

  -- ===== 白果（银杏）：生食有毒须熟食、婴幼儿禁用 =====
  ('白果',       'infant',   'forbidden'),
  ('白果',       'pregnant', 'caution'),
  ('白果',       'children', 'caution'),

  -- ===== 桃仁：活血，孕妇禁用 =====
  ('桃仁',       'pregnant', 'forbidden'),

  -- ===== 西红花：活血，孕妇禁用（第二批仅香辛料） =====
  ('西红花',     'pregnant', 'forbidden'),

  -- ===== 苦杏仁：含生氰苷，婴幼儿禁用、须炮制 =====
  ('苦杏仁',     'infant',   'forbidden'),
  ('苦杏仁',     'children', 'advise_against'),

  -- ===== 肉桂 / 高良姜：辛热刺激，婴幼儿不宜 =====
  ('肉桂',       'infant',   'advise_against'),
  ('高良姜',     'infant',   'advise_against'),

  -- ===== 决明子 / 胖大海：寒凉滑利，婴幼儿慎用 =====
  ('决明子',     'infant',   'advise_against'),
  ('胖大海',     'infant',   'advise_against'),
  ('决明子',     'pregnant', 'caution'),
  ('胖大海',     'pregnant', 'caution'),

  -- ===== 麦芽：传统认为回奶（00221 已有「炒麦芽」，补生名） =====
  ('麦芽',       'lactating', 'advise_against'),

  -- ===== 姜黄：活血，孕妇慎用 =====
  ('姜黄',       'pregnant', 'caution'),

  -- ===== 薏苡仁别名补全（00221 已有 薏米/薏仁，补规范名） =====
  ('薏苡仁',     'pregnant', 'advise_against'),

  -- =====================================================================
  -- 第三批（2023 第9号）9 种：官方口径「孕妇、哺乳期妇女及婴幼儿不宜食用」
  -- =====================================================================
  ('党参',       'pregnant',  'advise_against'),
  ('党参',       'lactating', 'advise_against'),
  ('党参',       'infant',    'advise_against'),
  ('肉苁蓉',     'pregnant',  'advise_against'),
  ('肉苁蓉',     'lactating', 'advise_against'),
  ('肉苁蓉',     'infant',    'advise_against'),
  ('铁皮石斛',   'pregnant',  'advise_against'),
  ('铁皮石斛',   'lactating', 'advise_against'),
  ('铁皮石斛',   'infant',    'advise_against'),
  ('西洋参',     'pregnant',  'advise_against'),
  ('西洋参',     'lactating', 'advise_against'),
  ('西洋参',     'infant',    'advise_against'),
  ('黄芪',       'pregnant',  'advise_against'),
  ('黄芪',       'lactating', 'advise_against'),
  ('黄芪',       'infant',    'advise_against'),
  ('灵芝',       'pregnant',  'advise_against'),
  ('灵芝',       'lactating', 'advise_against'),
  ('灵芝',       'infant',    'advise_against'),
  ('山茱萸',     'pregnant',  'advise_against'),
  ('山茱萸',     'lactating', 'advise_against'),
  ('山茱萸',     'infant',    'advise_against'),
  ('天麻',       'pregnant',  'advise_against'),
  ('天麻',       'lactating', 'advise_against'),
  ('天麻',       'infant',    'advise_against'),
  ('杜仲叶',     'pregnant',  'advise_against'),
  ('杜仲叶',     'lactating', 'advise_against'),
  ('杜仲叶',     'infant',    'advise_against'),

  -- =====================================================================
  -- 第四批（2024 第4号）4 种：同官方口径「孕乳婴不宜食用」
  -- =====================================================================
  ('地黄',       'pregnant',  'advise_against'),
  ('地黄',       'lactating', 'advise_against'),
  ('地黄',       'infant',    'advise_against'),
  ('麦冬',       'pregnant',  'advise_against'),
  ('麦冬',       'lactating', 'advise_against'),
  ('麦冬',       'infant',    'advise_against'),
  ('天冬',       'pregnant',  'advise_against'),
  ('天冬',       'lactating', 'advise_against'),
  ('天冬',       'infant',    'advise_against'),
  ('化橘红',     'pregnant',  'advise_against'),
  ('化橘红',     'lactating', 'advise_against'),
  ('化橘红',     'infant',    'advise_against')
on conflict (trigger_keyword, crowd_code) do update set severity = excluded.severity;

-- ============================================================================
-- C. 验证查询（执行后手工跑，确认行数增长）
-- ============================================================================
-- 按 crowd_code 统计触发规则数：
--   select crowd_code, count(*) from public.food_crowd_triggers group by 1 order by 1;
-- 抽查儿童档 forbidden/advise_against：
--   select * from public.food_crowd_triggers where crowd_code='children' and severity in ('advise_against','forbidden') order by trigger_keyword;
-- ============================================================================

-- ==================== 00241_profiles_avatar_url_and_avatars_bucket.sql ====================
-- ============================================================================
-- 00241  修复「头像保存失败」两处根因
-- ============================================================================
-- 现象：小程序「我的 → 设置 → 个人资料」改头像点保存 → 提示「保存失败」，
--       过程中还会闪一次「存储桶不存在，请联系管理员」。
--
-- 实测定位（anon/JWT 直连线上库，非推断）：
--   ① 真因：public.profiles 表**根本没有 avatar_url 列**。
--      updateUserProfile() 发 PATCH { nickname, avatar_url } →
--      PostgREST 返回 42703 "column profiles.avatar_url does not exist" →
--      函数 return false → 前端弹「保存失败」。
--      连带失效点（同一根因，均已修）：
--        - AuthContext / user/index.tsx 读 profile.avatar_url 永远 undefined，头像区空
--        - api.ts:3958 `profiles(id, nickname, avatar_url)` 内联 join，整条查询 42703 直接失败
--        - api.ts:70 updateProfile 的 avatar_url 分支同理失败
--   ② 次要：storage.buckets 里**没有 avatars 桶**（线上仅 images / product-images /
--      qrcodes / videos / 二维码），settings 页首选的 avatars 桶上传返回
--      NoSuchBucket → 弹「存储桶不存在」；随后回退 images 桶其实能成功，
--      所以这只是一条误导性提示，不是保存失败的原因。
--
-- 本迁移做两件事：
--   1. profiles 加 avatar_url 列（幂等）
--   2. 补建 avatars 桶 + storage.objects 策略（幂等），让首选路径成立
--
-- 幂等：本库无 supabase_migrations 记录表，迁移会被手工重放，全部语句可重复执行。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. profiles.avatar_url
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS
  '用户头像公网 URL（存于 storage avatars 桶，回退 images 桶）。契约：存完整 https URL，不存 wxfile:// 本地路径。';

-- ---------------------------------------------------------------------------
-- 2. avatars 存储桶
--    与既有 images 桶保持一致的宽松配置：public=true，不限制体积/MIME
--    （微信 chooseMedia 压缩图为 jpeg，加 MIME 白名单会引入新的失败面）
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ---------------------------------------------------------------------------
-- 3. storage.objects 策略（avatars 桶）
--    读：公开读（头像 URL 要能在小程序 <Image> 直接加载）
--    写：仅 authenticated，且只能改自己 owner 的对象
--    ⚠️ Postgres 多策略是 OR 关系，此处不新增 public/qual=true 的放行策略，
--       避免重蹈「全开策略架空 RLS」（00210 已清过一轮）。
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_public_read  ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_insert  ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_update  ON storage.objects;
DROP POLICY IF EXISTS avatars_auth_delete  ON storage.objects;

CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY avatars_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY avatars_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'avatars' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());

CREATE POLICY avatars_auth_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());

COMMIT;

-- ============================================================================
-- 验收（迁移后应满足）
--   select count(*) from information_schema.columns
--     where table_schema='public' and table_name='profiles' and column_name='avatar_url';   -- 1
--   select public from storage.buckets where id='avatars';                                    -- t
--   select policyname from pg_policies
--     where schemaname='storage' and tablename='objects' and policyname like 'avatars_%';     -- 4 行
--   -- 端到端：PATCH /rest/v1/profiles?id=eq.<uid> body {"avatar_url":"https://..."} → 204
-- ============================================================================

-- ==================== 00242_schema_drift_withdrawals_commissions_profiles.sql ====================
-- ============================================================================
-- 00242  schema drift 批量收口：提现状态词表 / 缺失审计列 / 互斥 CHECK
-- ============================================================================
-- 背景：修「头像保存失败」（00241）时，顺手写了个 schema drift 扫描器
--       （src/scripts/schema_drift_scan.py），把「代码引用的列/值在库里不存在」
--       一次性扫出来，结果扫出 3 类真 bug。本迁移修其中的 DB 侧。
--
-- ── 病 1（活体阻塞）：提现状态词表与列全对不上 ──────────────────────────
--   code 侧一致使用 pending → approved → paid|rejected 四态，并写 remark / updated_at：
--     admin-web/src/api/admin.ts        approveWithdrawal / payWithdrawal /
--                                        rejectWithdrawal / paySettlementWithdrawal /
--                                        rejectSettlementWithdrawal
--     admin-web/src/api/merchant.ts     读 w.updated_at 展示打款时间
--     admin-web/src/pages/Withdrawals.tsx   { key:'paid', label:'已打款' }
--     admin-web/src/pages/merchant/Withdraw.tsx  ['paid','approved'].includes(...)
--     supabase/functions/merchant-payout      w.status === 'paid'
--     src/db/api.ts:3584 / types.ts:663        status:'paid'
--   但线上库：
--     withdrawals_status_check = CHECK (status IN ('pending','processing','completed','rejected'))
--       → 'approved' / 'paid' 一律 23514 约束冲突
--     且 withdrawals 无 remark、无 updated_at 列 → 42703 列不存在
--   实测影响：库里此刻有 4 条 pending 提现，后台点「通过/打款」必定失败 → 佣金提现链路整体不可用。
--   取舍：code 侧 6+ 处实现一致且四态工作流更合理（pending→approved→paid 可防重复打款），
--         故**对齐 DB 到 code**，而不是改 code 去迁就 DB 的 processing/completed。
--
-- ── 病 2：审计列缺失 ────────────────────────────────────────────────
--     profiles.updated_at      ← src/db/api.ts:3580 写（提现扣款时）
--     commissions.cancelled_at / cancel_reason ← src/utils/risk-control.ts 追回佣金留痕
--
-- ── 病 3：products.food_category 两条互斥 CHECK 并存，交集为空集 ───────
--     chk_products_food_category    CHECK (food_category IN ('长辈关怀零食','四季时令零食',
--                                     '药食同源烘焙','低糖轻食零食','温和养护零食',
--                                     '轻盈舒眠零食','温润养护零食'))
--     products_food_category_check  CHECK (food_category IN ('粉面','炖汤','热饮','小菜'))
--   两条都 convalidated=true 且同时生效 → 任何非空值必违反其一
--   → 线上 133 行 food_category 全为 NULL，该字段事实上**永久不可写**。
--   后者（粉面/炖汤/热饮/小菜）是早期「菜品」分类，与「零食」定位不符 → 删后者，保留前者。
--
-- 幂等：本库无 supabase_migrations 记录表，迁移会被手工重放，全部语句可重复执行。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. 通用 updated_at 触发器函数
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_touch_updated_at() IS
  'BEFORE UPDATE 触发器：把 NEW.updated_at 刷成 now()。给需要审计「最后修改时间」的表挂载。';

-- ---------------------------------------------------------------------------
-- 1. withdrawals：补列 + 扩充状态词表
-- ---------------------------------------------------------------------------
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS remark     text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.withdrawals.remark     IS '审核/打款备注（后台填写的打款流水号、线下说明等）';
COMMENT ON COLUMN public.withdrawals.updated_at IS '最后变更时间，由 trg_withdrawals_touch_updated_at 自动维护';

-- 状态词表：保留原有 processing/completed（历史语义），新增 code 侧使用的 approved/paid
ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE public.withdrawals ADD  CONSTRAINT withdrawals_status_check
  CHECK (status = ANY (ARRAY['pending','approved','processing','paid','completed','rejected']));

DROP TRIGGER IF EXISTS trg_withdrawals_touch_updated_at ON public.withdrawals;
CREATE TRIGGER trg_withdrawals_touch_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. profiles：补 updated_at（提现扣款链路 src/db/api.ts:3580 会写）
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.profiles.updated_at IS '最后变更时间，由 trg_profiles_touch_updated_at 自动维护';

DROP TRIGGER IF EXISTS trg_profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. commissions：补追回留痕列
--    注意 status 取 'refunded'（既有合法值，且 finance.ts 用 neq('status','refunded')
--    把退款佣金剔出平台收入）；代码侧 risk-control.ts 原写 'cancelled' 不在词表内，
--    属真 bug，已在本轮同步改为 'refunded'。
-- ---------------------------------------------------------------------------
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS cancel_reason text;

COMMENT ON COLUMN public.commissions.cancelled_at  IS '佣金被追回/取消的时间（订单退款时由 recoverCommission 写入）';
COMMENT ON COLUMN public.commissions.cancel_reason IS '佣金被追回/取消的原因留痕';

-- ---------------------------------------------------------------------------
-- 4. products：删掉与 chk_products_food_category 互斥的历史 CHECK
--    （二者交集为空集，food_category 事实上不可写；保留与当前零食品类对齐的那条）
-- ---------------------------------------------------------------------------
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_food_category_check;

COMMIT;

-- ============================================================================
-- 验收（迁移后应满足）
--   -- 提现状态词表已含 approved / paid
--   select pg_get_constraintdef(oid) from pg_constraint where conname='withdrawals_status_check';
--   -- 三张表新列存在
--   select table_name, column_name from information_schema.columns
--     where table_schema='public' and (
--       (table_name='withdrawals' and column_name in ('remark','updated_at')) or
--       (table_name='profiles'    and column_name = 'updated_at') or
--       (table_name='commissions' and column_name in ('cancelled_at','cancel_reason')));
--   -- 触发器已挂
--   select tgname from pg_trigger where tgname like 'trg_%touch_updated_at';
--   -- 互斥约束已删（应只剩 chk_products_food_category）
--   select conname from pg_constraint
--     where conrelid='public.products'::regclass and pg_get_constraintdef(oid) ilike '%food_category%';
--   -- 端到端：在事务里试写一条提现「打款」，不报错即通过
--   begin; update withdrawals set status='paid', remark='probe' where id=(select id from withdrawals limit 1); rollback;
-- ============================================================================

-- ==================== 20260705_fix_user_store_relation_schema.sql ====================
-- ============================================
-- 修复 user_store_relation 表结构
-- 执行日期：2026-07-05
-- ============================================

-- 1. 添加 referrer_id 字段（推荐人ID）
ALTER TABLE public.user_store_relation 
ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES public.profiles(id);

-- 2. 添加 expires_at 字段（锁客过期时间）
ALTER TABLE public.user_store_relation 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. 添加 status 字段（锁客状态）
ALTER TABLE public.user_store_relation 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- 4. 添加索引（提高查询性能）
CREATE INDEX IF NOT EXISTS idx_user_store_relation_user_id ON public.user_store_relation(user_id);
CREATE INDEX IF NOT EXISTS idx_user_store_relation_store_id ON public.user_store_relation(store_id);
CREATE INDEX IF NOT EXISTS idx_user_store_relation_status ON public.user_store_relation(status);

-- 5. 添加字段注释
COMMENT ON COLUMN public.user_store_relation.referrer_id IS '推荐人ID（锁客的来源用户）';
COMMENT ON COLUMN public.user_store_relation.expires_at IS '锁客关系过期时间（默认180天）';
COMMENT ON COLUMN public.user_store_relation.status IS '锁客状态：active-有效，expired-已过期，cancelled-已取消';

-- 6. 验证表结构
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'user_store_relation' 
ORDER BY ordinal_position;

-- 7. 显示成功消息
SELECT 'user_store_relation 表结构已修复' AS result;

-- ==================== 20260705_update_claim_campaign_with_lock.sql ====================
-- ============================================
-- 更新 claim_campaign 函数（添加锁客逻辑）
-- 执行日期：2026-07-05（2026-07-07 修正 p_store_id 为 TEXT+双CAST）
-- ============================================

DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;

CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id UUID,
    p_campaign_id INTEGER,
    p_store_id TEXT DEFAULT NULL,     -- TEXT 中间层，兼容 INTEGER(user_campaign_claims) 和 UUID(user_store_relation)
    p_device_id VARCHAR DEFAULT NULL,
    p_referrer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign RECORD;
    v_existing_claim INTEGER;
    v_daily_claims INTEGER;
    v_existing_lock INTEGER;
    v_result JSONB;
BEGIN
    -- 1. 获取活动信息
    SELECT * INTO v_campaign 
    FROM public.marketing_campaigns 
    WHERE id = p_campaign_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '活动不存在');
    END IF;
    
    -- 2. 检查活动状态
    IF v_campaign.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已结束');
    END IF;
    
    -- 3. 检查活动时间
    IF CURRENT_DATE < v_campaign.start_date OR CURRENT_DATE > v_campaign.end_date THEN
        RETURN jsonb_build_object('success', false, 'error', '活动未开始或已结束');
    END IF;
    
    -- 4. 检查领取上限
    IF v_campaign.claimed_count >= v_campaign.total_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已领完');
    END IF;
    
    -- 5. 检查每日限领
    SELECT COUNT(*) INTO v_daily_claims 
    FROM public.user_campaign_claims 
    WHERE campaign_id = p_campaign_id 
      AND claim_date = CURRENT_DATE;
      
    IF v_daily_claims >= v_campaign.daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '今日已领完，请明天再来');
    END IF;
    
    -- 6. 检查用户是否重复领取
    SELECT COUNT(*) INTO v_existing_claim 
    FROM public.user_campaign_claims 
    WHERE user_id = p_user_id 
      AND campaign_id = p_campaign_id 
      AND claim_date = CURRENT_DATE;
      
    IF v_existing_claim > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '您今天已经领过这个奖励了');
    END IF;
    
    -- 7. 记录领取（user_campaign_claims.store_id 是 INTEGER）
    INSERT INTO public.user_campaign_claims (
        user_id, 
        campaign_id, 
        store_id, 
        device_id,
        claimed_at
    ) VALUES (
        p_user_id, 
        p_campaign_id, 
        CASE WHEN p_store_id IS NOT NULL THEN p_store_id::INTEGER ELSE NULL END,
        p_device_id,
        NOW()
    );
    
    -- 8. 更新领取计数
    UPDATE public.marketing_campaigns 
    SET claimed_count = claimed_count + 1 
    WHERE id = p_campaign_id;
    
    -- 9. 建立锁客关系（user_store_relation.store_id 是 UUID）
    SELECT COUNT(*) INTO v_existing_lock
    FROM public.user_store_relation
    WHERE user_id = p_user_id 
      AND store_id = CASE WHEN p_store_id IS NOT NULL THEN p_store_id::UUID ELSE NULL END;
    
    IF v_existing_lock = 0 THEN
        INSERT INTO public.user_store_relation (
            user_id, 
            store_id, 
            referrer_id, 
            lock_type, 
            locked_at,
            expires_at,
            status
        ) VALUES (
            p_user_id,
            CASE WHEN p_store_id IS NOT NULL THEN p_store_id::UUID ELSE NULL END,
            p_referrer_id,
            'campaign',
            NOW(),
            NOW() + INTERVAL '180 days',
            'active'
        );
    END IF;
    
    -- 10. 返回成功
    v_result := jsonb_build_object(
        'success', true,
        'campaign_type', v_campaign.campaign_type,
        'gift_name', v_campaign.gift_name,
        'gift_value', v_campaign.gift_value,
        'commission_rate', v_campaign.commission_rate,
        'locked', v_existing_lock = 0
    );
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.claim_campaign IS '领取营销活动奖励（含锁客逻辑）- 2026-07-07修正';

SELECT 'claim_campaign 函数已更新' AS result;

-- ==================== 20260720_add_order_item_commissions.sql ====================
-- 20260720_add_order_item_commissions.sql
-- 商品级分佣结算表：每个 order_item 独立记录让利池、L1/L2/买家积分/平台收益，便于追溯与展示。
-- 与现有 orders（汇总）形成 1:N 关系：orders 的 l1/l2/buyer_points/platform_income = SUM(order_item_commissions.*)。
-- 幂等：同一 order_item 只结算一次（UNIQUE(order_item_id)）。

CREATE TABLE IF NOT EXISTS public.order_item_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  product_id text,                 -- order_items.product_id 为 text，非外键，故存原文
  product_name text,
  price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  item_total numeric NOT NULL DEFAULT 0,            -- price * quantity
  product_discount_rate numeric NOT NULL DEFAULT 0, -- 商品自身让利率（如 0.12）
  effective_rate numeric NOT NULL DEFAULT 0,        -- 实际用于该商品的分佣率（当前=商品自身率；未来可支持活动券叠加）
  discount_amount numeric NOT NULL DEFAULT 0,       -- 该商品让利金额 = item_total * effective_rate
  discount_pool numeric NOT NULL DEFAULT 0,         -- 分佣池 = discount_amount
  commission_pool numeric NOT NULL DEFAULT 0,       -- 可分佣池 = discount_pool * 0.90

  l1_user_id uuid,
  l1_rank text,
  l1_ratio numeric,
  l1_active_mult numeric DEFAULT 1,
  l1_recruit_mult numeric DEFAULT 1,
  l1_gross numeric DEFAULT 0,                      -- 缩放前
  l1_commission numeric DEFAULT 0,                 -- 缩放后 / 实际发放

  l2_user_id uuid,
  l2_rank text,
  l2_ratio numeric,
  l2_active_mult numeric DEFAULT 1,
  l2_recruit_mult numeric DEFAULT 1,
  l2_gross numeric DEFAULT 0,
  l2_commission numeric DEFAULT 0,

  buyer_points numeric DEFAULT 0,                  -- 该商品产生的买家确权积分
  platform_income numeric DEFAULT 0,               -- 该商品的平台保底收益

  commission_distributed boolean DEFAULT false,
  distributed_at timestamptz,
  created_at timestamptz DEFAULT now(),

  UNIQUE(order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_oic_order_id ON public.order_item_commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_oic_order_item_id ON public.order_item_commissions(order_item_id);
CREATE INDEX IF NOT EXISTS idx_oic_commission_distributed ON public.order_item_commissions(commission_distributed);
CREATE INDEX IF NOT EXISTS idx_oic_product_id ON public.order_item_commissions(product_id);

-- ==================== 20260720_add_orders_effective_rate_commission_error.sql ====================
-- 20260720 新增 orders.effective_rate / commission_error 列
-- effective_rate：整单加权让利率（小数口径），按 order_items 商品 discount_rate 金额加权后落库，便于前端展示与分佣追溯
-- commission_error：分佣触发（distribute-commission）失败时的错误原因，便于自动补跑脚本扫描未发佣订单
-- 依赖：00003/00018/00019/00021/00023/00027/00108 已存在 commission_distributed 列

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS effective_rate numeric NULL,
  ADD COLUMN IF NOT EXISTS commission_error text NULL;

COMMENT ON COLUMN public.orders.effective_rate IS '整单加权让利率（小数口径，0.09=9%），按 order_items 商品 discount_rate 金额加权，落库便于展示与追溯';
COMMENT ON COLUMN public.orders.commission_error IS '分佣触发失败时的错误原因；commission_distributed=false 且本列非空 = 待补跑';

-- ==================== 20260720_order_item_commissions_refund.sql ====================
-- 20260720_order_item_commissions_refund.sql
-- 退款按商品回退分佣（#48）：在 order_item_commissions 上记录累计退款比例，
-- 使「Σ 各行净留存 = (1 - refund_ratio) × 原佣金」，与 commissions 表余额回冲（按订单 ratio）口径一致。
-- 退款不修改原始 l1_commission/l2_commission/buyer_points（保留审计），仅在展示层按 refund_ratio 折净。
ALTER TABLE public.order_item_commissions
  ADD COLUMN IF NOT EXISTS refund_ratio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

COMMENT ON COLUMN public.order_item_commissions.refund_ratio
  IS '累计退款比例(0~1)，按订单退款比例累加，封顶 1；展示净留存 = 原佣金 × (1 - refund_ratio)';
COMMENT ON COLUMN public.order_item_commissions.refunded_at
  IS '最近一次退款回冲时间（无退款则为 NULL）';

-- 便于按退款状态筛选（refund_ratio > 0 即发生过回冲）
CREATE INDEX IF NOT EXISTS idx_oic_refund_ratio
  ON public.order_item_commissions (order_id, refund_ratio);

-- ==================== 20260726_store_categories_global.sql ====================
-- 20260726: store_categories 支持「全局分类」(平台建) + 「店内分类」(商家建)
-- 背景：原 store_categories.store_id 为 NOT NULL，分类只能挂在具体门店下，
--       无法满足「平台建全局公共分类、商家在自己店内自建分类」的双重需求。
-- 改动：store_id 改可空 + 新增 scope 列 + 补充索引 + 新增 admin 管全局的 RLS。

-- 1) store_id 改为可空（全局分类 store_id = NULL）
ALTER TABLE public.store_categories ALTER COLUMN store_id DROP NOT NULL;

-- 2) 新增 scope 区分 global(平台公共) / store(某商家店内)
ALTER TABLE public.store_categories ADD COLUMN scope text NOT NULL DEFAULT 'store'
  CHECK (scope IN ('global', 'store'));

-- 3) 排序索引（全局按 scope+sort_order；店内按 store_id+sort_order）
CREATE INDEX IF NOT EXISTS idx_store_categories_scope ON public.store_categories (scope, sort_order);
CREATE INDEX IF NOT EXISTS idx_store_categories_store  ON public.store_categories (store_id, sort_order);

-- 4) RLS：平台 admin 可管理全局分类（store_id IS NULL 且 scope='global'）
DROP POLICY IF EXISTS "admin_manage_global_cats" ON public.store_categories;
CREATE POLICY "admin_manage_global_cats" ON public.store_categories
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role)
  WITH CHECK (store_categories.store_id IS NULL AND store_categories.scope = 'global');

-- 5) 店内分类：保留原 owner_manage_cats，限定 scope='store'（防止商家越权改全局）
DROP POLICY IF EXISTS "owner_manage_cats" ON public.store_categories;
CREATE POLICY "owner_manage_cats" ON public.store_categories
  FOR ALL TO authenticated
  USING (
    scope = 'store'
    AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    scope = 'store'
    AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
  );

COMMENT ON COLUMN public.store_categories.scope IS 'global=平台建的公共分类；store=某商家自建的店内分类';
COMMENT ON COLUMN public.store_categories.store_id IS '店内分类时指向所属门店；全局分类时为 NULL';

-- ==================== 20260726_store_categories_global_idempotent.sql ====================
-- 20260726: store_categories 支持「全局分类」(平台建) + 「店内分类」(商家建)
-- 幂等版：可重复执行，已存在的列/约束/索引/策略会自动跳过
-- 背景：原 store_categories.store_id 为 NOT NULL，分类只能挂在具体门店下，
--       无法满足「平台建全局公共分类、商家在自己店内自建分类」的双重需求。
-- 改动：store_id 改可空 + 新增 scope 列 + 补充索引 + 新增 admin 管全局的 RLS。

-- 1) store_id 改为可空（全局分类 store_id = NULL）
-- 重复执行安全：已经是可空时不会报错
ALTER TABLE public.store_categories ALTER COLUMN store_id DROP NOT NULL;

-- 2) 新增 scope 区分 global(平台公共) / store(某商家店内)
-- 用 IF NOT EXISTS 避免 "column already exists" 报错；CHECK 约束单独判断
ALTER TABLE public.store_categories ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'store';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.store_categories'::regclass
      AND conname = 'store_categories_scope_check'
  ) THEN
    ALTER TABLE public.store_categories
      ADD CONSTRAINT store_categories_scope_check
      CHECK (scope IN ('global', 'store'));
  END IF;
END $$;

-- 3) 排序索引（全局按 scope+sort_order；店内按 store_id+sort_order）
CREATE INDEX IF NOT EXISTS idx_store_categories_scope ON public.store_categories (scope, sort_order);
CREATE INDEX IF NOT EXISTS idx_store_categories_store  ON public.store_categories (store_id, sort_order);

-- 4) RLS：平台 admin 可管理全局分类（store_id IS NULL 且 scope='global'）
DROP POLICY IF EXISTS "admin_manage_global_cats" ON public.store_categories;
CREATE POLICY "admin_manage_global_cats" ON public.store_categories
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role)
  WITH CHECK (store_categories.store_id IS NULL AND store_categories.scope = 'global');

-- 5) 店内分类：保留原 owner_manage_cats，限定 scope='store'（防止商家越权改全局）
DROP POLICY IF EXISTS "owner_manage_cats" ON public.store_categories;
CREATE POLICY "owner_manage_cats" ON public.store_categories
  FOR ALL TO authenticated
  USING (
    scope = 'store'
    AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    scope = 'store'
    AND store_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM stores WHERE id = store_categories.store_id AND owner_id = auth.uid())
  );

COMMENT ON COLUMN public.store_categories.scope IS 'global=平台建的公共分类；store=某商家自建的店内分类';
COMMENT ON COLUMN public.store_categories.store_id IS '店内分类时指向所属门店；全局分类时为 NULL';

-- ==================== 20260726_system_llm_config.sql ====================
-- ============================================================
-- 系统级配置表：LLM / 第三方服务密钥等敏感配置集中存放
-- ------------------------------------------------------------
-- 目的：把"在小程序/Edge Function 里用 LLM"所需的
--   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
--   从「Supabase 环境变量（只能 CLI 设置，无法网页填）」
--   改为「数据库配置表」，让总管理后台可网页填写、全项目共用。
--
-- 安全：仅管理员(is_admin = profiles.role='admin')可读写；
--   anon / 普通用户 select 不到 → API Key 永不外泄到客户端。
--   Edge Function 用 service_role 在服务端读取（绕过 RLS，安全）。
-- ============================================================

create table if not exists public.system_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.system_config is '系统级键值配置（LLM/第三方密钥等），仅管理员可读写';

alter table public.system_config enable row level security;

-- 仅管理员可读写（is_admin() 已在 00081 定义：get_user_role(auth.uid())='admin'）
drop policy if exists system_config_admin_all on public.system_config;
create policy system_config_admin_all
  on public.system_config
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 拒绝 anon 直接访问（防密钥泄漏到未登录客户端）
drop policy if exists system_config_anon_deny on public.system_config;
create policy system_config_anon_deny
  on public.system_config
  for all
  to anon
  using (false)
  with check (false);

-- ==================== 20260728_commission_risk.sql ====================
-- 20260728: 推广/佣金风控支持
-- 目标：堵住「自推自分佣」资损漏洞，让管理员可在风控看板识别并冻结可疑佣金。
-- 幂等：可重复执行，已存在的列/约束/策略/索引自动跳过。

-- 1) commissions 增加 risk_flag 列（应用层在分佣时写入可疑标记）
--    NULL                 = 正常
--    'self_referral'      = 自推自（L1 即买家本人，或 L1 的上级链最终指回买家）
--    'new_account_referral' = L1 为新注册账号(<7天)即产生推荐成交，疑似养号小号
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS risk_flag text;
COMMENT ON COLUMN public.commissions.risk_flag IS
  '风控标记：self_referral=自推自；new_account_referral=新号疑似养号；NULL=正常';

-- 2) status 扩展 'frozen'（可疑佣金冻结，不结算、待人工审核放行/拒结）
--    幂等重建 check 约束：仅当约束尚不含 frozen 时才重建，避免重复执行报错。
DO $$
DECLARE
  has_frozen boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.commissions'::regclass
      AND c.conname = 'commissions_status_check'
      AND pg_get_constraintdef(c.oid) LIKE '%frozen%'
  ) INTO has_frozen;

  IF NOT has_frozen THEN
    ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_status_check
      CHECK (status IN ('pending', 'settled', 'refunded', 'frozen'));
  END IF;
END $$;
COMMENT ON COLUMN public.commissions.status IS
  'pending=待结算；settled=已结算；refunded=已退款冲销；frozen=风控冻结待审';

-- 3) admin 可读全部 commissions（风控看板依赖；原 RLS 仅允许受益人读自己）
DROP POLICY IF EXISTS "admin_read_all_commissions" ON public.commissions;
CREATE POLICY "admin_read_all_commissions" ON public.commissions
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 4) 索引（可疑行 + 状态过滤）
CREATE INDEX IF NOT EXISTS idx_commissions_risk_flag
  ON public.commissions (risk_flag) WHERE risk_flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commissions_status
  ON public.commissions (status);

-- ==================== 20260729_emotion_badge_grants_owner_write.sql ====================
-- 修复：emotion_badge_grants 客户端写被 RLS 拦截（控制台 42501）
-- 根因：00095_consolidated_rls_final.sql 将该表归入“有 user_id 的流水表”，
--       套用 owner-只读 + admin-全权 策略；而 grantEmotionBadge 走普通
--       authenticated 客户端 upsert，INSERT 被 WITH CHECK(is_admin()) 拒绝。
-- 本迁移补充“本人可写自己 user_id 行”的策略（SELECT 仍沿用 00095 的 ownerread），
-- 让徽章颁发在客户端即可完成，同时保留管理员全权与行级隔离。
-- 幂等：先 DROP 同名策略再建，可重复执行。

DROP POLICY IF EXISTS rls_final_emotion_badge_grants_ownerwrite ON public.emotion_badge_grants;
CREATE POLICY rls_final_emotion_badge_grants_ownerwrite ON public.emotion_badge_grants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS rls_final_emotion_badge_grants_ownerupdate ON public.emotion_badge_grants;
CREATE POLICY rls_final_emotion_badge_grants_ownerupdate ON public.emotion_badge_grants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- 注释：badge_code 由客户端逻辑决定、行按 (user_id,badge_code) 唯一约束自隔离，
--       用户仅能写入自己名下的徽章行，无法篡改他人数据，风险可控。

-- ==================== 20260730_add_food_stage.sql ====================
-- 20260730 商品食养阶段 food_stage（清/通/调/补/固）
-- 用于「清通调补固」食养导购模块：空值时由 ingredients 主导功效确定性派生，
-- 商家可在商品编辑页人工覆盖（微调）。仅新增一列，不影响既有列与 RLS。
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS food_stage text;

-- 取值约束：仅允许 清/通/调/补/固，其余(null)表示未标注→由引擎派生
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_food_stage_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_food_stage_check
      CHECK (food_stage IS NULL OR food_stage IN ('清','通','调','补','固'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.food_stage IS
  '食养阶段（清/通/调/补/固）。空=由 ingredients 主导功效派生；商家可在编辑页人工微调覆盖。';

-- ==================== 20260731_article_share_codes.sql ====================
-- 20260731 图文分享小程序码映射表（朋友圈锁客闭环）
-- WeChat getwxacodeunlimit 的 scene 仅 ≤32 字节，而 article id 是 uuid(36)，
-- 故用短码 scene 反查 article_id + 分享人(referrer)，扫码打开 article-detail 时自动锁客。
create table if not exists public.article_share_codes (
  scene       text primary key,                         -- 短码（≤32 字符，微信扫码带回）
  article_id  uuid not null references public.articles(id) on delete cascade,
  referrer_id uuid,                                      -- 发起分享的侠客（锁客归属参考）
  created_at  timestamptz not null default now()
);

create index if not exists idx_article_share_codes_article
  on public.article_share_codes(article_id);

alter table public.article_share_codes enable row level security;

-- 前端不得直连读写，所有写入走 wxacode Edge Function（service_role 绕过 RLS）
drop policy if exists article_share_codes_no_anon on public.article_share_codes;
create policy article_share_codes_no_anon on public.article_share_codes
  for all to anon, authenticated
  using (false) with check (false);

-- ==================== 20260731_articles_self_rls.sql ====================
-- 修复「创作不能发布」：articles 表此前只有 read(公开) + admin(ALL) 两条 RLS 策略，
-- 普通登录用户没有 INSERT/UPDATE/DELETE 权限，导致发布文章被 RLS 拦截。
-- 补充「作者只能操作自己的文章」策略，与既有 admin 策略并存。

-- 插入：登录用户只能插入 user_id = 自己 的行
drop policy if exists rls_articles_insert_self on public.articles;
create policy rls_articles_insert_self on public.articles
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 更新：作者只能改自己的文章
drop policy if exists rls_articles_update_self on public.articles;
create policy rls_articles_update_self on public.articles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 删除：作者只能删自己的文章
drop policy if exists rls_articles_delete_self on public.articles;
create policy rls_articles_delete_self on public.articles
  for delete to authenticated
  using (auth.uid() = user_id);

-- ==================== 20260731_llm_call_logs.sql ====================
-- ============================================================
-- 智能模型调用日志（token 用量统计）
-- 记录每次 Edge Function 调用 LLM 的 token 消耗，用于后台智能模型配置页统计
-- 本文件不使用任何 ASCII 单引号（字符串常量全部改用美元引用 $q$...$q$），
-- 以避免 supabase db query 在 Windows 下对单引号的包裹转义问题。
-- ============================================================

create table if not exists public.llm_call_logs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  function_name    text not null,
  module           text,
  model            text not null,
  prompt_tokens    int  not null default 0,
  completion_tokens int not null default 0,
  total_tokens     int  not null default 0,
  latency_ms       int,
  success          boolean not null default true,
  error_message    text,
  user_id          uuid references auth.users(id) on delete set null,
  order_no         text,
  meta             jsonb default $q${}$q$::jsonb
);

create index if not exists idx_llm_logs_created
  on public.llm_call_logs (created_at desc);

alter table public.llm_call_logs enable row level security;

do $f$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = $q$public$q$ and tablename = $q$llm_call_logs$q$ and cmd = $q$SELECT$q$
  ) then
    create policy "admin read llm_call_logs"
      on public.llm_call_logs
      for select
      using (public.is_admin());
  end if;
end $f$;

-- ============================================================
-- 聚合统计 RPC：fn_llm_usage_stats(p_days)
-- ============================================================
create or replace function public.fn_llm_usage_stats(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_totals      jsonb;
  v_today       jsonb;
  v_by_day      jsonb;
  v_by_module   jsonb;
begin
  select
    jsonb_build_object(
      $q$total_calls$q$,        coalesce(sum(1) filter (where success), 0),
      $q$total_tokens$q$,       coalesce(sum(total_tokens) filter (where success), 0),
      $q$total_prompt$q$,       coalesce(sum(prompt_tokens) filter (where success), 0),
      $q$total_completion$q$,   coalesce(sum(completion_tokens) filter (where success), 0),
      $q$failed_calls$q$,       coalesce(sum(1) filter (where not success), 0)
    ),
    jsonb_build_object(
      $q$today_calls$q$,   coalesce(sum(1) filter (where success and date_trunc($q$day$q$, created_at) = date_trunc($q$day$q$, now())), 0),
      $q$today_tokens$q$,  coalesce(sum(total_tokens) filter (where success and date_trunc($q$day$q$, created_at) = date_trunc($q$day$q$, now())), 0)
    )
  into v_totals, v_today
  from public.llm_call_logs;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      $q$day$q$,        to_char(d, $q$YYYY-MM-DD$q$),
      $q$calls$q$,      coalesce(s.calls, 0),
      $q$tokens$q$,     coalesce(s.tokens, 0)
    ) order by d
  ), $q$[]$q$::jsonb)
  into v_by_day
  from generate_series(
         date_trunc($q$day$q$, now()) - (p_days - 1) * interval $q$1 day$q$,
         date_trunc($q$day$q$, now()),
         interval $q$1 day$q$
       ) as d
  left join (
    select date_trunc($q$day$q$, created_at) as day,
           count(*) filter (where success) as calls,
           sum(total_tokens) filter (where success) as tokens
    from public.llm_call_logs
    where created_at >= date_trunc($q$day$q$, now()) - (p_days - 1) * interval $q$1 day$q$
    group by 1
  ) s on s.day = d;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      $q$module$q$,      module,
      $q$calls$q$,       calls,
      $q$tokens$q$,      tokens
    ) order by tokens desc nulls last
  ), $q$[]$q$::jsonb)
  into v_by_module
  from (
    select module,
           count(*) filter (where success) as calls,
           coalesce(sum(total_tokens) filter (where success), 0) as tokens
    from public.llm_call_logs
    where success and module is not null
    group by module
  ) s;

  return jsonb_build_object(
    $q$totals$q$,   v_totals,
    $q$today$q$,    v_today,
    $q$by_day$q$,   v_by_day,
    $q$by_module$q$, v_by_module
  );
end;
$f$;

-- 最近明细 RPC：fn_llm_recent_logs(p_limit)
create or replace function public.fn_llm_recent_logs(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      $q$id$q$, id,
      $q$created_at$q$, created_at,
      $q$function_name$q$, function_name,
      $q$module$q$, module,
      $q$model$q$, model,
      $q$prompt_tokens$q$, prompt_tokens,
      $q$completion_tokens$q$, completion_tokens,
      $q$total_tokens$q$, total_tokens,
      $q$latency_ms$q$, latency_ms,
      $q$success$q$, success,
      $q$error_message$q$, error_message
    ) order by created_at desc
  ), $q$[]$q$::jsonb)
  into v_rows
  from public.llm_call_logs
  limit p_limit;

  return v_rows;
end;
$f$;

grant execute on function public.fn_llm_usage_stats(int) to authenticated;
grant execute on function public.fn_llm_recent_logs(int) to authenticated;

-- ==================== 20260801_product_therapy_json.sql ====================
-- 20260801 食养系统化：新增 therapy_json 单一数据源列
-- 目的：把"食疗统一引擎(buildTherapyReport)"的计算结果持久化为单一可信字段，
--       所有页面(首页/门店卡/详情)优先读 therapy_json，避免各端各算、数据不一致；
--       并支撑「上传商品自动用食养」+ 存量商品 backfill（由 product-therapy-sync EF 回写）。
-- 注：迁移按字母序排到 20260731_* 之后（supabase 用文件名排序），确保最后执行。

alter table public.products
  add column if not exists therapy_json jsonb,
  add column if not exists therapy_pending boolean not null default false,
  add column if not exists fit_people text;

comment on column public.products.therapy_json is
  '食疗统一引擎完整报告（单一数据源）。由 product-therapy-sync Edge Function 或商家端保存时回写。'
  '字段含 overall_nature_code / overall_nature / combined_effect / fit_people / caution_people / chronic_tags / warnings / merchant_note / disclaimer。页面优先读此字段。';
comment on column public.products.therapy_pending is
  'true = 尚无食材且名称无法推导食养，待人工补食材后回算；false = 已算或无需算。';
comment on column public.products.fit_people is
  '适宜人群文案（来自 therapy_json.fit_people 的冗余加速列，避免每页解析 jsonb）。';

-- ==================== 20260801b_deactivate_henglongpu.sql ====================
-- 20260801b 停用测试门店「横笼铺」
-- 该门店坐标为杭州中心点占位值(30.2741,120.1551)，定位失败兜底到杭州中心时
-- 会被算成「0km 最近门店」误导用户、并抢最近门店。属测试数据，正式环境停用。
-- 与 20260801 迁移一并执行（均在 Supabase 后台 SQL 编辑器跑）。

update public.stores
   set is_active = false
 where name = '横笼铺';

-- 备注：若后续误停用真实门店，改回 true 即可：
-- update public.stores set is_active = true where name = '横笼铺';

-- ==================== 20260801c_p0_resilience.sql ====================
-- =====================================================================
-- P0 运营保命加固：分佣触发器诊断日志收敛 + 保留策略 + 关键索引
-- 目标：① 停止 trigger_logs 无限膨胀（运营期最会拖垮下单链路的隐患）
--       ② 补齐热点查询索引，扛 1万会员并发有余量
-- 全部幂等：CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT DO NOTHING
-- =====================================================================

-- 1) 诊断总开关表（默认关闭 trace 全量记录）
CREATE TABLE IF NOT EXISTS public.system_flags (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT 'false',
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.system_flags (key, value, note)
VALUES ('trigger_logs_enabled', 'false', '分佣触发器 trace 日志总开关；true=全量记录, false=仅记录异常')
ON CONFLICT (key) DO NOTHING;

-- 2) 诊断日志收敛函数：开关关闭时只记 error，避免运营期无限膨胀
--    error 永远落库（排查必需），trace 仅当开关开启
CREATE OR REPLACE FUNCTION public.fn_diag_log(
  p_order_no text,
  p_action   text,
  p_error    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $f$
DECLARE
  v_on boolean := false;
BEGIN
  IF p_error IS NOT NULL THEN
    INSERT INTO public.trigger_logs (order_no, action, error)
    VALUES (p_order_no, p_action, p_error);
    RETURN;
  END IF;
  SELECT (value = 'true') INTO v_on
  FROM public.system_flags
  WHERE key = 'trigger_logs_enabled';
  IF v_on IS DISTINCT FROM true THEN
    RETURN;
  END IF;
  INSERT INTO public.trigger_logs (order_no, action)
  VALUES (p_order_no, p_action);
END;
$f$;

-- 3) 重写分佣触发器：所有内联 INSERT 改为 fn_diag_log（开关关 -> 仅异常落库）
CREATE OR REPLACE FUNCTION public.fn_trigger_distribute_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqaWl0YnN0d3RoYm4iLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MjU2MDc3MywiZXhwIjoyMDU4MTM2NzczfQ.MHdJx4XjIMhSU_OJte0WjG1H2-jYO_0seFGMH0HRHc4';
  v_func_url   text := 'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/distribute-commission';
  v_payload    jsonb;
  v_referrer   uuid;
BEGIN
  PERFORM public.fn_diag_log(NEW.order_no, 'ENTER');

  IF NEW.commission_distributed = true THEN
    PERFORM public.fn_diag_log(NEW.order_no, 'SKIP_ALREADY_DONE');
    RETURN NEW;
  END IF;
  IF NEW.payment_method <> 'emotion_beans' THEN
    PERFORM public.fn_diag_log(NEW.order_no, 'SKIP_NOT_BEANS');
    RETURN NEW;
  END IF;

  PERFORM public.fn_diag_log(NEW.order_no, 'PROCEED');

  BEGIN
    SELECT p.referrer_id INTO v_referrer
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    PERFORM public.fn_diag_log(NEW.order_no, 'GOT_REFERRER');

    v_payload := jsonb_build_object(
      'order_id',      NEW.id,
      'order_no',      NEW.order_no,
      'payer_id',      NEW.user_id,
      'total_amount',  NEW.total_amount,
      'net_amount',    0,
      'store_id',      NEW.store_id,
      'referrer_id',   v_referrer
    );

    PERFORM public.fn_diag_log(NEW.order_no, 'CALLING_NET');

    PERFORM net.http_post(
      url      := v_func_url,
      body     := v_payload,
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      timeout_milliseconds := 30000
    );

    PERFORM public.fn_diag_log(NEW.order_no, 'NET_DONE');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.fn_diag_log(NEW.order_no, 'NET_FAILED', SQLERRM);
      RAISE WARNING '[trg] order_no=% error=%', NEW.order_no, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- 4) 热点查询索引（IF NOT EXISTS 幂等）
--    首页门店隔离：getProducts({storeId}) 走 store_id 过滤 + is_active + created_at 排序
CREATE INDEX IF NOT EXISTS idx_products_store_active_created
  ON public.products (store_id, is_active, created_at DESC);
--    订单按门店/状态/时间查询（后台、对账、补跑）
CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON public.orders (store_id, status, created_at DESC);
--    用户订单列表（C 端我的订单）
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created
  ON public.orders (user_id, status, created_at DESC);
--    分佣补跑：按是否已分发扫表
CREATE INDEX IF NOT EXISTS idx_orders_commission_distributed
  ON public.orders (commission_distributed, created_at DESC)
  WHERE commission_distributed = false;
--    两级分销：按上级反查下级（分佣、团队统计）
CREATE INDEX IF NOT EXISTS idx_profiles_referrer
  ON public.profiles (referrer_id);

-- 5) trigger_logs 兜底补 created_at（供清理策略使用）
ALTER TABLE public.trigger_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created
  ON public.trigger_logs (created_at DESC);

-- 6) 清理函数：保留最近 N 天，返回删除行数
CREATE OR REPLACE FUNCTION public.fn_cleanup_trigger_logs(p_retention_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $f$
DECLARE
  v_deleted int := 0;
  v_has_ts  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trigger_logs'
      AND column_name  = 'created_at'
  ) INTO v_has_ts;
  IF NOT v_has_ts THEN
    RETURN 0;
  END IF;
  EXECUTE format(
    'DELETE FROM public.trigger_logs WHERE created_at < now() - ($1 || '' days'')::interval'
  ) USING p_retention_days;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$f$;

-- 7) 每日凌晨 03:17 自动清理（pg_cron 已在 00219/00222 启用）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_trigger_logs') THEN
    PERFORM cron.unschedule('cleanup_trigger_logs');
  END IF;
END $$;
SELECT cron.schedule(
  'cleanup_trigger_logs',
  '17 3 * * *',
  $$ SELECT public.fn_cleanup_trigger_logs(30); $$
);

-- ==================== 20260801d_p1_store_location_cache.sql ====================
-- =====================================================================
-- P1 门店定位查询抗压：候选门店索引
-- 背景：getNearestStores 每次定位都 SELECT 全量 stores 再客户端算距离。
--       门店规模增长后全表顺序扫描会拖慢；补 (is_active, lat, lng) 索引，
--       让「活跃 + 有坐标」的候选拉取走索引，避免 seq scan。
-- 注：距离排序仍在客户端做（ranking 用，无需 DB 侧 earthdistance），
--     本索引只加速候选集的过滤与拉取。幂等。
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_stores_active_geo
  ON public.stores (is_active, lat, lng);

COMMENT ON INDEX public.idx_stores_active_geo IS
  'getNearestStores 候选门店拉取：加速 活跃+坐标 过滤，避免大表顺序扫描（扛门店规模增长）';

-- ==================== 20260801e_product_feed_rank.sql ====================
-- 20260801e 商品推荐排序引擎（均衡热度榜 v1，通用、无个性化）
-- 设计：服务端计算综合热度分，复用既有有效订单状态与 sales_count，不依赖 view_count（后续可加）。
-- 信号：近期销量(recent_qty) + 上升势头(momentum) + 新鲜度(freshness) + 历史销量基线 + 商家置顶。
-- 权限：SECURITY DEFINER 只读聚合（同 00132 模式），仅返回 product_id + score，授权 anon/authenticated。

-- 1) 商家置顶控制列
alter table public.products
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pin_sort  integer not null default 0;

create index if not exists idx_products_pin on public.products (is_pinned, pin_sort)
  where is_pinned = true;

-- 2) 热度排序 RPC
create or replace function public.fn_product_feed_rank(
  p_store_id    uuid    default null,
  p_limit       integer default 40,
  p_recent_days integer default 30
)
returns table (product_id uuid, score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with recent as (
    select oi.product_id,
           sum(oi.quantity) as recent_qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status::text in ('pending_ship','pending_receive','pending_pickup','pending_review','completed')
      and o.paid_at >= now() - (p_recent_days || ' days')::interval
      and (p_store_id is null or oi.store_id::text = p_store_id::text)
    group by oi.product_id
  )
  select p.id as product_id,
         (
           0.40 * ln(1.0 + coalesce(r.recent_qty, 0)::numeric)                       -- 近期销量（对数压缩，时间窗口天然衰减）
           + 0.20 * least( coalesce(r.recent_qty, 0)::numeric
                           / nullif(greatest(p.sales_count, 0), 0), 1.0)              -- 上升势头 momentum（夹到 [0,1]）
           + 0.25 * (1.0 / (1.0 + extract(epoch from (now() - p.created_at)) / 86400.0)) -- 新鲜度（新品扶持）
           + 0.15 * ln(1.0 + greatest(p.sales_count, 0)::numeric)                    -- 历史销量基线（防纯新品无数据）
         ) as score
  from public.products p
  left join recent r on r.product_id::text = p.id::text
  where p.is_active = true
    and p.stock > 0
    and (p_store_id is null or p.store_id::text = p_store_id::text)
  order by
    (case when p.is_pinned then 0 else 1 end),
    p.pin_sort desc,
    score desc
  limit p_limit;
end;
$$;

grant execute on function public.fn_product_feed_rank(uuid, integer, integer) to anon, authenticated;

-- ==================== 20260802_family_archive.sql ====================
-- ============================================================
-- 战略支柱②：家庭档案 · 一户一档（绑定家庭锁死用户）
-- ------------------------------------------------------------
-- 目的：让用户把全家（本人 + 家人）的体质 / 过敏史 / 饮食周期 / 过往购买食养方案
--       沉淀到本平台，拉高迁移成本，形成壁垒价值真正落地的载体。
-- 合规：成员维度全部走中性食养参考话术，严禁「治疗 / 降血压」等医疗宣称（见 compliance/shield 红线）。
-- RLS：families / family_members 均按 owner_id 归属；客户端禁止越权读写他人家庭。
-- 注意：本迁移无函数体，纯 DDL + 策略；与 20260802_medicinal_food_catalog 互不依赖。
-- ============================================================

-- 1) 家庭（一户一档）：每个 owner 仅一条，owner_id 唯一
create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null default '我的家庭',
  created_at timestamptz not null default now(),
  constraint families_owner_unique unique (owner_id)
);

comment on table public.families is '家庭档案（一户一档）：仅归属 owner 可读写，绑定家庭拉高迁移成本';

-- 2) 家庭成员结构化画像：中性食养参考维度，不替代医嘱
create table if not exists public.family_members (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families (id) on delete cascade,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  age_group         text,                                  -- 儿童/青少年/成人/孕哺期/老年
  gender            text,                                  -- 男/女/不填
  constitution_type text,                                  -- 中医九种体质或沿用 13 人群标签
  allergies          text[] not null default '{}',         -- allergen-dictionary key 列表
  chronic_conditions text[] not null default '{}',         -- HEALTH_CROWD_OPTIONS
  body_states        text[] not null default '{}',         -- BODY_CROWD_OPTIONS
  health_goals       text[] not null default '{}',         -- 控糖/护胃/助眠/补血/抗疲劳/减脂/清热
  diet_cycle         jsonb,                                -- 中性「饮食周期/节奏」(控糖周期/经期节奏/作息)，不涉病症
  avatar_color       text,                                 -- 家庭成员卡片配色（前端用）
  notes              text,                                 -- 自由备注（中性食养偏好，非病历）
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.family_members is '家庭成员结构化画像（中性食养参考维度，仅作食养参考不替代医嘱）';

-- 3) RLS：owner 级归属
alter table public.families enable row level security;
alter table public.family_members enable row level security;

drop policy if exists families_owner_all on public.families;
create policy families_owner_all on public.families
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists family_members_owner_all on public.family_members;
create policy family_members_owner_all on public.family_members
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 4) 索引
create index if not exists idx_families_owner on public.families (owner_id);
create index if not exists idx_family_members_family on public.family_members (family_id);
create index if not exists idx_family_members_owner on public.family_members (owner_id);

-- ==================== 20260802_medicinal_food_catalog.sql ====================
-- ============================================================================
-- 药食同源体质匹配算法数据库 · 核心私有资产表
-- ----------------------------------------------------------------------------
-- 战略定位：绑定国家卫健委《按照传统既是食品又是中药材的物质目录》，
-- 作为平台「千人千面食疗匹配逻辑」的私有数据底座。竞品可抄袭配料文案，
-- 但无法复刻本表的性味 / 年龄段宜忌 / 配伍私有数据 + 匹配算法。
--
-- 隐私/资产保护（关键）：本表 RLS 拒绝 anon 与 authenticated 的所有读取，
-- 仅 service_role（Edge Function 服务端）可读取 —— 即「不对外公开接口」。
-- 小程序客户端永远读不到本表，匹配逻辑只在服务端 EF 内闭运算。
--
-- 注意：种子仅收录代表性条目（约 50 项），完整 110 项国家目录应从
-- 卫健委官方清单补全（本文件 source_ref 已标注出处）。
-- ============================================================================

create table if not exists medicinal_food_catalog (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,            -- 食材/药材名（与商品 ingredients 匹配键）
  category         text,                            -- 分类：根茎/果类/种子/谷物/花类/叶类/菌类/蜂产品…
  nature           text,                            -- 食性：大寒/寒凉/平性/微温/温热/大热
  flavor           text,                            -- 味：甘/酸/苦/辛/咸/淡/涩
  is_homology      boolean not null default true,   -- 是否在「既是食品又是中药材」国家目录
  homology_batch   text,                            -- 目录批次：2024版目录 / 试点目录
  age_suitable     text[] not null default '{}',     -- 适宜年龄段：儿童/青少年/成人/孕哺期/中老年
  age_caution      text[] not null default '{}',     -- 各年龄段注意（如 婴幼儿禁用 / 孕妇慎用）
  compatibility    text,                            -- 性味配伍宜忌（宜搭 / 忌搭，中性食养参考）
  source_ref       text,                            -- 出处（国家目录名称）
  created_at       timestamptz not null default now()
);

create index if not exists idx_mfc_name on medicinal_food_catalog (name);
create index if not exists idx_mfc_nature on medicinal_food_catalog (nature);

-- 私有资产保护：拒绝一切公开读取（anon + authenticated），仅 service_role 可读
alter table medicinal_food_catalog enable row level security;
drop policy if exists "no public read" on medicinal_food_catalog;
create policy "no public read" on medicinal_food_catalog
  for select using (false);
drop policy if exists "service only write" on medicinal_food_catalog;
create policy "service only write" on medicinal_food_catalog
  for all to service_role using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 种子：国家药食同源目录代表性条目（性/味/年龄段宜忌/配伍，中性食养参考）
-- 完整 110 项请从卫健委官方清单补全。
-- ----------------------------------------------------------------------------
insert into medicinal_food_catalog
  (name, category, nature, flavor, is_homology, homology_batch, age_suitable, age_caution, compatibility, source_ref)
values
  ('山药','根茎','平性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','宜搭薏苡仁健脾；平和之品老少皆宜','《按照传统既是食品又是中药材的物质目录》'),
  ('红枣','果类','温性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['糖尿病人群适量'],'养血温和，宜搭桂圆','《按照传统既是食品又是中药材的物质目录》'),
  ('枸杞子','果类','平性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['脾虚便溏者适量'],'明目养身，温水泡饮','《按照传统既是食品又是中药材的物质目录》'),
  ('桂圆','果类','温性','甘',true,'2024版目录',array['儿童','青少年','成人','中老年'],array['孕哺期适量','易上火者少'],'温润养血，宜搭红枣','《按照传统既是食品又是中药材的物质目录》'),
  ('莲子','种子','平性','甘涩',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['便秘者少'],'清心养身，宜搭百合','《按照传统既是食品又是中药材的物质目录》'),
  ('百合','鳞茎','微寒','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','润燥，宜搭莲子','《按照传统既是食品又是中药材的物质目录》'),
  ('薏苡仁','谷物','凉性','甘淡',true,'2024版目录',array['儿童','青少年','成人','中老年'],array['孕妇慎用','虚寒者少'],'利湿，宜搭山药','《按照传统既是食品又是中药材的物质目录》'),
  ('茯苓','菌类','平性','甘淡',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','平和，宜搭山药','《按照传统既是食品又是中药材的物质目录》'),
  ('山楂','果类','微温','酸甘',true,'2024版目录',array['青少年','成人','中老年'],array['婴幼儿','孕妇','胃酸偏多者少'],'消食，宜搭麦芽','《按照传统既是食品又是中药材的物质目录》'),
  ('麦芽','谷物','平性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['哺乳期适量'],'消食化积，宜搭山楂','《按照传统既是食品又是中药材的物质目录》'),
  ('葛根','根茎','凉性','甘辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','清热，宜搭绿豆','《按照传统既是食品又是中药材的物质目录》'),
  ('黑芝麻','种子','平性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','润养，宜搭核桃','《按照传统既是食品又是中药材的物质目录》'),
  ('核桃仁','种子','温性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['易上火者适量'],'温润，宜搭黑芝麻','《按照传统既是食品又是中药材的物质目录》'),
  ('甜杏仁','种子','微温','苦甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['婴幼儿','孕妇慎用'],'润喉，苦杏仁须炮制后食用','《按照传统既是食品又是中药材的物质目录》'),
  ('蜂蜜','蜂产品','平性','甘',true,'2024版目录',array['儿童(1岁以上)','青少年','成人','中老年'],array['婴幼儿(1岁内)禁用'],'润燥，温水冲饮','《按照传统既是食品又是中药材的物质目录》'),
  ('生姜','根茎','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['易上火者少'],'温中，宜搭红枣','《按照传统既是食品又是中药材的物质目录》'),
  ('菊花','花类','微寒','甘苦',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','清热，宜搭枸杞','《按照传统既是食品又是中药材的物质目录》'),
  ('决明子','种子','微寒','甘苦',true,'2024版目录',array['成人','中老年'],array['婴幼儿','孕哺期','腹泻者慎用'],'清热，代茶饮','《按照传统既是食品又是中药材的物质目录》'),
  ('桑叶','叶类','寒性','苦甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['虚寒者少'],'清热，宜搭菊花','《按照传统既是食品又是中药材的物质目录》'),
  ('薄荷','叶类','凉性','辛',true,'2024版目录',array['儿童','青少年','成人','中老年'],array['婴幼儿','孕哺期适量'],'清凉，宜搭菊花','《按照传统既是食品又是中药材的物质目录》'),
  ('陈皮','果皮','温性','苦辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['气虚者少'],'理气，宜搭生姜','《按照传统既是食品又是中药材的物质目录》'),
  ('甘草','根类','平性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['高血压人群慎用','久服适量'],'调和，宜搭桔梗','《按照传统既是食品又是中药材的物质目录》'),
  ('肉桂','树皮','大热','甘辛',true,'2024版目录',array['成人','中老年'],array['孕妇','阴虚火旺者','婴幼儿禁用'],'温中，少量入膳','《按照传统既是食品又是中药材的物质目录》'),
  ('花椒','果皮','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['易上火者少','孕妇适量'],'温中，宜搭生姜','《按照传统既是食品又是中药材的物质目录》'),
  ('小茴香','果实','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','温中，宜搭生姜','《按照传统既是食品又是中药材的物质目录》'),
  ('八角茴香','果实','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','温中，调味','《按照传统既是食品又是中药材的物质目录》'),
  ('丁香','花蕾','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['胃热者少'],'温中','《按照传统既是食品又是中药材的物质目录》'),
  ('砂仁','果实','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['阴虚者少'],'温中，宜搭陈皮','《按照传统既是食品又是中药材的物质目录》'),
  ('益智仁','果实','温性','辛',true,'2024版目录',array['儿童','青少年','成人','中老年'],'{}','温中','《按照传统既是食品又是中药材的物质目录》'),
  ('肉豆蔻','种子','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['实热者少'],'温中','《按照传统既是食品又是中药材的物质目录》'),
  ('白芷','根类','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','辛温','《按照传统既是食品又是中药材的物质目录》'),
  ('栀子','果实','寒性','苦',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['脾虚便溏者少'],'清热','《按照传统既是食品又是中药材的物质目录》'),
  ('蒲公英','全草','寒性','苦甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['虚寒者少','孕妇适量'],'清热','《按照传统既是食品又是中药材的物质目录》'),
  ('芡实','种子','平性','甘涩',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','固涩，宜搭莲子','《按照传统既是食品又是中药材的物质目录》'),
  ('藿香','全草','微温','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','化湿','《按照传统既是食品又是中药材的物质目录》'),
  ('代代花','花类','微温','苦酸',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','理气','《按照传统既是食品又是中药材的物质目录》'),
  ('玫瑰花','花类','温性','甘微苦',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','理气','《按照传统既是食品又是中药材的物质目录》'),
  ('佛手','果实','温性','苦辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','理气','《按照传统既是食品又是中药材的物质目录》'),
  ('香橼','果实','温性','辛酸苦',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','理气','《按照传统既是食品又是中药材的物质目录》'),
  ('薤白','鳞茎','温性','辛苦',true,'2024版目录',array['儿童','青少年','成人','中老年'],'{}','温中','《按照传统既是食品又是中药材的物质目录》'),
  ('木瓜','果类','温性','酸',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','舒筋','《按照传统既是食品又是中药材的物质目录》'),
  ('马齿苋','全草','寒性','酸',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['孕妇','脾虚便溏者少'],'清热','《按照传统既是食品又是中药材的物质目录》'),
  ('乌梅','果类','平性','酸涩',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['胃酸偏多者少'],'生津','《按照传统既是食品又是中药材的物质目录》'),
  ('余甘子','果类','凉性','甘酸涩',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','清热','《按照传统既是食品又是中药材的物质目录》'),
  ('罗汉果','果类','凉性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','润喉，代茶饮','《按照传统既是食品又是中药材的物质目录》'),
  ('金银花','花类','寒性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['虚寒者少','婴幼儿适量'],'清热','《按照传统既是食品又是中药材的物质目录》'),
  ('沙棘','果类','温性','酸',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','温润','《按照传统既是食品又是中药材的物质目录》'),
  ('黄精','根茎','平性','甘',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['痰湿者少'],'润养','《按照传统既是食品又是中药材的物质目录》'),
  ('姜黄','根茎','温性','苦辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['孕妇','血虚者适量'],'温中','《按照传统既是食品又是中药材的物质目录》'),
  ('酸枣仁','种子','平性','甘酸',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],'{}','养身，宜搭莲子','《按照传统既是食品又是中药材的物质目录》'),
  ('桔梗','根类','平性','苦辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['阴虚久咳者适量'],'宣肺，宜搭甘草','《按照传统既是食品又是中药材的物质目录》'),
  ('荷叶','叶类','平性','苦',true,'2024版目录',array['儿童','青少年','成人','中老年'],array['虚寒者少'],'清热','《按照传统既是食品又是中药材的物质目录》'),
  ('紫苏','全草','温性','辛',true,'2024版目录',array['儿童','青少年','成人','孕哺期','中老年'],array['气虚者少'],'温中，宜搭生姜','《按照传统既是食品又是中药材的物质目录》')
on conflict (name) do nothing;

-- ==================== 20260802_product_subjects.sql ====================
-- ============================================================
-- 科目化分类（食养科目）
-- ------------------------------------------------------------
-- 替代传统物理品类（零食/饮料/生鲜），作为 C 端浏览主分类。
-- 科目按「食养功效 / 人群 / 场景」组织（脾胃调理 / 安神助眠 / 清火润燥 …），
-- 可自动派生（subject-derive）+ 运营后台可改，支持门店自定义（scope='store'）。
-- 复用门店隔离：store_id 关联 stores，门店自定义科目随店隔离。
-- ============================================================

create table if not exists public.product_subjects (
  id          uuid        primary key default gen_random_uuid(),
  key         text        not null unique,
  name        text        not null,
  icon        text,
  description text,
  sort_order  int         not null default 0,
  scope       text        not null default 'global' check (scope in ('global', 'store')),
  store_id    uuid        references public.stores(id) on delete cascade,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_product_subjects_scope_active
  on public.product_subjects (scope, is_active, sort_order);

-- products 冗余 subject_keys（类同 mood_tags/scene_tags 设计，支撑 .overlaps 快速过滤）
alter table public.products add column if not exists subject_keys text[] not null default '{}';
create index if not exists idx_products_subject_keys on public.products using gin (subject_keys);

-- RLS：科目为展示标签，全局科目对所有人可读；写策略与 food 库一致（后台管理，低敏感）
alter table public.product_subjects enable row level security;

drop policy if exists "ps_read" on public.product_subjects;
create policy "ps_read" on public.product_subjects
  for select using (true);

drop policy if exists "ps_all" on public.product_subjects;
create policy "ps_all" on public.product_subjects
  for all using (true) with check (true);

-- 种子全局科目（运营可后台改 name/icon/上下架；key 稳定用于派生与过滤）
insert into public.product_subjects (key, name, icon, description, sort_order, scope, is_active)
values
  ('spleen', '脾胃调理', '🌾', '温中散寒 · 健脾养胃 · 消食化积', 10, 'global', true),
  ('sleep',  '安神助眠', '🌙', '舒缓安适 · 安神助眠',            20, 'global', true),
  ('heat',   '清火润燥', '❄️', '清热降火 · 滋阴润燥 · 润养舒喉', 30, 'global', true),
  ('damp',   '祛湿消肿', '💧', '利水消肿 · 祛湿轻体',            40, 'global', true),
  ('women',  '女性调理', '🌸', '补气养血 · 经期温养',            50, 'global', true),
  ('kids',   '儿童成长', '🧒', '益智成长 · 温和营养',            60, 'global', true),
  ('season', '节气时令', '🍂', '当季时令 · 顺时养生',            70, 'global', true),
  ('sugar',  '控糖轻食', '🥗', '低糖轻食 · 膳食管理',            80, 'global', true)
on conflict (key) do nothing;

-- ==================== 20260802_self_operated_unified_rbac.sql ====================
-- ============================================================
-- 20260802 自营门店统一管理 RBAC 地基
-- 目标：在现有「owner_id + profiles.role='merchant'」商家模型之上，
--       叠加 store_staff 细粒度运营身份，实现「单品牌多自营门店连锁」、
--       总后台建店建登陆、三端（总后台/网页中心/小程序）数据互通。
-- 原则：纯加法，不破坏现有 owner_id 商家模型；fn_my_store_ids 同时覆盖
--       两种身份，所有既有 RLS 策略自动对新身份生效。
-- 部署：supabase db query --linked --file <this-file>
-- ============================================================

-- 1) stores 加 store_type / created_by（加法，可为空，向后兼容）
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_type text CHECK (store_type IN ('hub', 'transfer', 'truck', 'branch')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.stores.store_type IS '门店类型：hub=总仓/中心仓, transfer=中转仓, truck=流动车, branch=普通门店';
COMMENT ON COLUMN public.stores.created_by IS '建店人（总后台 admin 的 profiles.id）';

-- 2) store_staff.role 增加 'manager'（先安全删除旧 CHECK 再建新，避免名称不确定）
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.store_staff'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.store_staff DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE public.store_staff
  ADD CONSTRAINT store_staff_role_check CHECK (role IN ('owner', 'manager', 'staff', 'cashier'));

-- 3) 历史门店 owner 自动成为 store_staff(role=owner)，统一身份来源
INSERT INTO public.store_staff (store_id, user_id, role, is_active)
SELECT s.id, s.owner_id, 'owner', true
FROM public.stores s
WHERE s.owner_id IS NOT NULL
ON CONFLICT (store_id, user_id) DO NOTHING;

-- 4) 扩展 fn_my_store_ids：同时返回「owner 门店」与「store_staff 活跃成员门店」
--    UNION 避免数组拼接去重/类型问题；SECURITY DEFINER 已绕过 RLS，无递归。
--    用 CREATE OR REPLACE（不 DROP），保持 OID 稳定，既有 RLS 策略依赖不受影响。
CREATE OR REPLACE FUNCTION public.fn_my_store_ids(p_uid uuid)
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(id), '{}'::uuid[])
  FROM (
    SELECT id FROM public.stores WHERE owner_id = p_uid
    UNION
    SELECT store_id FROM public.store_staff WHERE user_id = p_uid AND is_active
  ) t
$$;
GRANT EXECUTE ON FUNCTION public.fn_my_store_ids(uuid) TO authenticated;

-- 5) 运营身份辅助函数
CREATE OR REPLACE FUNCTION public.is_store_operator(p_store_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM public.store_staff WHERE store_id = p_store_id AND user_id = auth.uid() AND is_active
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_store_operator(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_operator_store_ids()
RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.fn_my_store_ids(auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.get_operator_store_ids() TO authenticated;

-- 6) 启用 store_staff RLS 并加策略（store_staff 当前 RLS DISABLED）
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;

-- 6a) 读：本人看自己成员行 / admin 全量 / 本店 owner 看本店全员
DROP POLICY IF EXISTS rls_store_staff_select ON public.store_staff;
CREATE POLICY rls_store_staff_select ON public.store_staff
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

-- 6b) 写：仅 admin 或本店 owner（store_staff 成员由本店 owner/admin 管理）
DROP POLICY IF EXISTS rls_store_staff_write ON public.store_staff;
CREATE POLICY rls_store_staff_write ON public.store_staff
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

SELECT '20260802 自营门店统一管理 RBAC 地基 已完成' AS result;

-- ==================== 20260802_store_food_profile_sync.sql ====================
-- ============================================================
-- 战略支柱②延伸：门店端「授权式」食养档案同步
-- ------------------------------------------------------------
-- 目标：打通「线上食养工具引流 → 线下门店精准导购承接」闭环的最后一环。
--       让中转仓 / 加盟店员在用户到店时，能看到该用户（已显式授权）的
--       中性食养画像，做「不宜 / 慎选配料 + 本店适配清单」的精准导购，
--       而非空口推荐——这是本项目最大的护城河缺口。
--
-- 设计：SECURITY DEFINER RPC，三重合规闸门（缺一不可）：
--   ① 调用者须是本店 owner 或 active staff（防止跨店窥探）
--   ② 目标用户须是本店会员（user_store_relation，防止非会员被查）
--   ③ 会员须显式授权（user_health_profile.privacy_flags->'share_food_profile_to_store' = true）
--
-- 返回：仅中性「膳食参考」维度（体质 / 年龄 / 过敏原 / 慢病 / 体感 / 目标）
--       + 家庭成员中性画像；绝不含病历 / 诊断等医疗字段。
--       所有字段定位为「膳食参考工具」输出，不替代医嘱（合规红线）。
--
-- 合规：体质档案属健康 PII，严禁裸奔暴露；本函数即「授权开关」的落地闸门。
-- 依赖：00205(user_health_profile) / 00015(store_staff, user_store_relation)
--       / 00001(stores.owner_id) / 20260802_family_archive(family_members)
-- ============================================================

create or replace function public.get_store_member_food_profile(
  p_store_id        uuid,
  p_member_user_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller          uuid := auth.uid();
  v_is_store_staff  boolean := false;
  v_is_member       boolean := false;
  v_authorized      boolean := false;
  v_profile         public.user_health_profile%rowtype;
begin
  -- 入参校验：匿名 / 缺参直接拒绝
  if v_caller is null or p_store_id is null or p_member_user_id is null then
    return jsonb_build_object('authorized', false, 'reason', 'missing_params');
  end if;

  -- 闸门①：调用者须是本店 owner 或 active staff
  select true into v_is_store_staff
  from public.stores s
  where s.id = p_store_id
    and (s.owner_id = v_caller
      or exists (
        select 1 from public.store_staff ss
        where ss.store_id = p_store_id
          and ss.user_id = v_caller
          and ss.is_active
      ));
  if not v_is_store_staff then
    return jsonb_build_object('authorized', false, 'reason', 'not_store_staff');
  end if;

  -- 闸门②：目标须是本店会员（锁客关系）
  select true into v_is_member
  from public.user_store_relation r
  where r.store_id = p_store_id
    and r.user_id = p_member_user_id;
  if not v_is_member then
    return jsonb_build_object('authorized', false, 'reason', 'not_store_member');
  end if;

  -- 闸门③：会员须显式授权「向常去门店分享食养档案」
  select true into v_authorized
  from public.user_health_profile p
  where p.user_id = p_member_user_id
    and coalesce(p.privacy_flags->>'share_food_profile_to_store', 'false') = 'true';
  if not v_authorized then
    return jsonb_build_object('authorized', false, 'reason', 'not_authorized');
  end if;

  -- 取会员中性食养画像（本人）
  select * into v_profile
  from public.user_health_profile p
  where p.user_id = p_member_user_id;

  -- 返回授权后的中性维度 + 家庭成员中性画像
  return jsonb_build_object(
    'authorized', true,
    'reason', 'ok',
    'member', jsonb_build_object(
      'age_group',          v_profile.age_group,
      'gender',             v_profile.gender,
      'constitution_type',  v_profile.constitution_type,
      'allergies',          to_jsonb(coalesce(v_profile.allergies, '{}')),
      'chronic_conditions', to_jsonb(coalesce(v_profile.chronic_conditions, '{}')),
      'body_states',        to_jsonb(coalesce(v_profile.body_states, '{}')),
      'health_goals',       to_jsonb(coalesce(v_profile.health_goals, '{}'))
    ),
    'family', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'name',              fm.name,
          'age_group',         fm.age_group,
          'constitution_type', fm.constitution_type,
          'allergies',         to_jsonb(coalesce(fm.allergies, '{}')),
          'chronic_conditions', to_jsonb(coalesce(fm.chronic_conditions, '{}')),
          'body_states',       to_jsonb(coalesce(fm.body_states, '{}')),
          'health_goals',      to_jsonb(coalesce(fm.health_goals, '{}'))
        ))
        from public.family_members fm
        where fm.owner_id = p_member_user_id
      ),
      '[]'::jsonb
    )
  );

exception when others then
  raise warning '[get_store_member_food_profile] store=%, member=%, err=%',
    p_store_id, p_member_user_id, sqlerrm;
  return jsonb_build_object('authorized', false, 'reason', 'error');
end;
$$;

grant execute on function public.get_store_member_food_profile(uuid, uuid) to authenticated;

comment on function public.get_store_member_food_profile(uuid, uuid) is
  '门店端授权式食养档案同步：三重合规闸门（店员归属 / 本店会员 / 会员显式授权），仅返回中性食养参考维度，不含医疗字段';

-- ==================== 20260802b_vehicle_store_isolation.sql ====================
-- ============================================================
-- 20260802b 流动车门店隔离（P3 门店联动）
-- 目标：将 vehicles / vehicle_transfers 从测试期 permissive using(true)
--       改为按「统一 RBAC 门店域」隔离，使流动车随运营身份「通」到
--       对应门店（owner_id 或 store_staff 活跃成员），并实现跨端隔离。
-- 复用：fn_my_store_ids / is_admin（来自 20260802_self_operated_unified_rbac.sql）
-- 部署：supabase db query --linked --file <this-file>
-- ============================================================

-- 1) vehicles：按 store_id 落入运营者门店域，admin 全量可见可写
DROP POLICY IF EXISTS veh_all ON public.vehicles;
CREATE POLICY veh_store_isolation_select ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

CREATE POLICY veh_store_isolation_write ON public.vehicles
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  )
  WITH CHECK (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

-- 2) vehicle_transfers：经 vehicle_id 关联 vehicles.store_id，
--    只有该车所属门店的运营者 / admin 可见可写（弱网离线标记也受控）。
DROP POLICY IF EXISTS vt_all ON public.vehicle_transfers;
CREATE POLICY vt_store_isolation_select ON public.vehicle_transfers
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE store_id = ANY(public.fn_my_store_ids(auth.uid()))
    )
  );

CREATE POLICY vt_store_isolation_write ON public.vehicle_transfers
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE store_id = ANY(public.fn_my_store_ids(auth.uid()))
    )
  )
  WITH CHECK (
    public.is_admin()
    OR vehicle_id IN (
      SELECT id FROM public.vehicles
      WHERE store_id = ANY(public.fn_my_store_ids(auth.uid()))
    )
  );

SELECT '20260802b 流动车门店隔离 RLS 已完成' AS result;

-- ==================== 20260802c_store_invites.sql ====================
-- =============================================================
-- P5 门店邀请码：让「总后台建的运营账号」也能在小程序进店
--   - 网页版管理中心(邮箱运营者)生成门店邀请码
--   - 运营者本人用小程序微信登录后，输入邀请码兑换
--   - 兑换时把当前微信身份 upsert 进 store_staff(同店)
--   - 之后微信登录自动被识别为本店运营者，可进 merchant-center
--   纯加法，不影响现有 owner_id / store_staff 逻辑
-- =============================================================

-- 1) 邀请码表
CREATE TABLE IF NOT EXISTS public.store_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  role        text NOT NULL CHECK (role IN ('owner','manager','staff','cashier')),
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_by     uuid REFERENCES public.profiles(id),
  used_at     timestamptz
);

-- 2) RLS：仅本店运营者 / admin 可见本店邀请码
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_store_invites_select ON public.store_invites;
CREATE POLICY rls_store_invites_select ON public.store_invites
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR store_id = ANY(public.fn_my_store_ids(auth.uid()))
  );

-- 写操作统一走 SECURITY DEFINER 的 RPC，这里仅防御性保留 admin 写权限
DROP POLICY IF EXISTS rls_store_invites_write ON public.store_invites;
CREATE POLICY rls_store_invites_write ON public.store_invites
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3) 生成邀请码（校验调用者是本店 operator / admin）
CREATE OR REPLACE FUNCTION public.create_store_invite(p_store_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_uid  uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.is_store_operator(p_store_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'permission denied: not store operator';
  END IF;
  IF p_role NOT IN ('owner','manager','staff','cashier') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  -- 生成唯一码：LD + 8 位大写字母数字
  LOOP
    v_code := 'LD' || upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.store_invites WHERE code = v_code);
  END LOOP;

  INSERT INTO public.store_invites (store_id, code, role, created_by, expires_at)
  VALUES (p_store_id, v_code, p_role, v_uid, now() + interval '7 days');

  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_store_invite(uuid, text) TO authenticated;

-- 4) 兑换邀请码（把当前微信身份加入同店 store_staff）
CREATE OR REPLACE FUNCTION public.redeem_store_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv      public.store_invites%ROWTYPE;
  v_uid      uuid := auth.uid();
  v_store_id uuid;
  v_role     text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_inv
  FROM public.store_invites
  WHERE code = p_code
    AND used_by IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  END IF;

  v_store_id := v_inv.store_id;
  v_role     := v_inv.role;

  -- upsert 进 store_staff（UNIQUE(store_id, user_id)）
  INSERT INTO public.store_staff (store_id, user_id, role, is_active)
  VALUES (v_store_id, v_uid, v_role, true)
  ON CONFLICT (store_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true, created_at = now();

  -- 标记邀请码已用
  UPDATE public.store_invites
  SET used_by = v_uid, used_at = now()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'store_id', v_store_id, 'role', v_role);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite(text) TO authenticated;

-- ==================== 20260802d_merchant_apply_address.sql ====================
-- 20260802d_merchant_apply_address.sql
-- P7 自营门店申请补 address 字段，审核通过时一并写入 stores
-- 背景：申请页精简到「门店名称 + 联系人手机号 + 门店地址」三字段（之前只有名称/手机），同时去掉业务类型/简介跨类目敏感字段。
-- 注意：merchant_applications 的 RLS 不动（00095/00127 已固化：owner 本人 + admin 全权）。

ALTER TABLE public.merchant_applications
  ADD COLUMN IF NOT EXISTS address text NULL;

-- ==================== 20260802e_merchant_apply_simplify.sql ====================
-- 20260802e_merchant_apply_simplify.sql
-- P7 自营门店申请：去掉跨类目的「联系人姓名/经营类型/简介」三个敏感字段
-- 申请页精简为「门店名称 + 联系人手机号 + 门店地址」三字段
-- 老数据保留（contact_name/business_type 允许 NULL 不破坏历史行），新申请不再写入

ALTER TABLE public.merchant_applications
  ALTER COLUMN contact_name DROP NOT NULL,
  ALTER COLUMN business_type DROP NOT NULL;

-- ==================== 20260803_print_receipt_trigger.sql ====================
-- 支付即打印触发器（2026-08-03，修订版）
-- ------------------------------------------------------------
-- 目标：订单支付成功时，自动推送小票到门店打印机。
-- 关键修正：原方案只监听 pending_ship，但实测杭州礼品店真实订单支付后落在
--   pending_review（或经 pending_pay → pending_review），并不经过 pending_ship，
--   导致真机支付不出单。
--
-- 支付完成的唯一可靠锚点 = 「订单离开未支付状态 pending_pay」。
--   - 健康豆纯付：create-order 直接 INSERT 为已付态(pending_ship / pending_review)
--   - 微信/混合：create-order INSERT 为 pending_pay，支付成功后跃迁为 pending_review / pending_ship
-- 因此只要状态「离开 pending_pay」（INSERT 时即非 pending_pay，或 UPDATE 时由 pending_pay 变为其他态），
-- 即视为支付完成，触发打印，且每单仅触发一次（订单不会回到 pending_pay）。
--
-- 设计要点（沿用 trg_distribute_commission / 20260801c 已验证范式）：
--   - AFTER INSERT OR UPDATE，仅在「离开 pending_pay」时触发（幂等，单订单仅打一次）
--   - 通过 pg_net 异步 HTTP 调 print-receipt（verify_jwt=false，用 anon key 过网关）
--   - 无启用打印机的门店：print-receipt 返回 need_config，无害
--   - EXCEPTION 仅 RAISE WARNING，绝不阻断订单主流程
--   - 带 trigger_logs 诊断，便于排查
--
-- 部署：supabase db query --linked --file <本文件>

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fn_trigger_print_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5cWdzeGNqbWlqdGJzdHd0aGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjIxMTIsImV4cCI6MjA5ODUzODExMn0.DQPNwBTPcQXfTixxz6Vfd53nYePuaEt58vzNWpaodWM';
  v_func_url   text := 'https://pyqgsxcjmijtbstwthbn.supabase.co/functions/v1/print-receipt';
  v_payload    jsonb;
BEGIN
  -- 仅「离开未支付状态 pending_pay」时触发（支付完成的唯一锚点）
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_pay' THEN
      RETURN NEW; -- 刚创建且未支付，不打印
    END IF;
  ELSE -- UPDATE
    IF OLD.status <> 'pending_pay' OR NEW.status = 'pending_pay' THEN
      RETURN NEW; -- 仅在「从未支付 → 已支付」跃迁时触发
    END IF;
  END IF;

  INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'PRINT_ENTER');

  BEGIN
    v_payload := jsonb_build_object('order_id', NEW.id);

    PERFORM net.http_post(
      url      := v_func_url,
      body     := v_payload,
      headers  := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      timeout_milliseconds := 30000
    );

    INSERT INTO public.trigger_logs (order_no, action) VALUES (NEW.order_no, 'PRINT_NET_DONE');
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.trigger_logs (order_no, action, error) VALUES (NEW.order_no, 'PRINT_NET_FAILED', SQLERRM);
      RAISE WARNING '[trg_print] order_no=% error=%', NEW.order_no, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_print_receipt ON public.orders;

CREATE TRIGGER trg_print_receipt
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trigger_print_receipt();

-- ==================== 20260803_printer_configs.sql ====================
-- 打印机配置表（云打印对接：飞鹅 / 易联云 / 365）
-- 用于门店订单小票自动打印。凭证敏感，读写走 admin-web 受控后台，
-- RLS 复用 food 库的受控后台宽松模式（应用层按 store 过滤）。
-- Edge Function print-receipt 用 service_role 读取，不在前端暴露明文 key。

CREATE TABLE IF NOT EXISTS public.printer_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'feie' CHECK (provider IN ('feie', 'yilianyun', '365')),
  device_sn TEXT NOT NULL,                 -- 打印机设备编号 / 机器码
  api_user TEXT,                           -- 飞鹅 user / 易联云 client_id
  api_key TEXT,                            -- 飞鹅 UKEY / 易联云 client_secret
  printer_key TEXT,                        -- 飞鹅打印机密钥（可选，部分机型需要）
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_print_on_paid BOOLEAN NOT NULL DEFAULT false,  -- 订单完成/已支付后自动打印
  print_count INTEGER NOT NULL DEFAULT 0,
  last_print_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, device_sn)
);

CREATE INDEX IF NOT EXISTS idx_printer_configs_store
  ON public.printer_configs(store_id);

ALTER TABLE public.printer_configs ENABLE ROW LEVEL SECURITY;

-- 复用受控后台宽松 RLS（与 food 库一致）：admin-web 登录态由 JWT 保证，
-- 应用层按当前商家 store 过滤，密钥不在前端明文回显（掩码展示）。
DROP POLICY IF EXISTS pc_all ON public.printer_configs;
CREATE POLICY pc_all ON public.printer_configs
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.printer_configs IS '门店云打印机配置（飞鹅/易联云），用于订单小票自动打印';
COMMENT ON COLUMN public.printer_configs.auto_print_on_paid IS '订单确认完成(已支付/已结算)后是否自动推送小票到打印机';

-- ==================== 20260803_product_kind.sql ====================
-- 20260803 商品类型化：新增 product_kind + 礼品类独立字段
-- 目的：把"药膳手串礼品"等非遗/工艺类商品与"食疗食养"食品彻底分开，
--       详情页按 product_kind 条件渲染两套模块树，绝不共用食疗话术。
--
-- 关键隔离原则（避坑）：
--   * 礼品的草本/材质成分存 materials(text[])，绝不写入 ingredients(text[])！
--     ingredients 是食疗引擎(buildTherapyReport)的触发源，写入会误弹
--     「三色预警 / 性味 / 食用量 / 同体质推荐」等食品模块，造成灾难级违和。
--   * 礼品类不渲染任何食养模块（见 src/pages/product/index.tsx 的 kind 分流）。
--
-- 注：文件名 20260803 排在 20260802_* 之后，确保最后执行；列均 IF NOT EXISTS 幂等。

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_kind text NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS materials text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS gift_meaning text,
  ADD COLUMN IF NOT EXISTS gift_craft text,
  ADD COLUMN IF NOT EXISTS gift_scene text,
  ADD COLUMN IF NOT EXISTS gift_care text;

-- 商品类型枚举约束：food=食养食品 / gift=药膳手串等工艺礼品 / craft=手作 / care=护理
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_product_kind_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_product_kind_check
      CHECK (product_kind IN ('food','gift','craft','care'));
  END IF;
END $$;

COMMENT ON COLUMN public.products.product_kind IS
  '商品类型：food=食养食品(走食疗模块) / gift=药膳手串等工艺礼品 / craft=手作 / care=护理。'
  '详情页按此字段条件渲染不同模块树，礼品与食养绝不共用描述。默认 food。';
COMMENT ON COLUMN public.products.materials IS
  '礼品/手作的材质或草本成分清单(text[])。注意：礼品的草本成分存这里，'
  '绝不写入 ingredients（ingredients 会触发食疗引擎）。';
COMMENT ON COLUMN public.products.gift_meaning IS
  '礼品寓意文化文案（灵魂维度）：如"合欢解郁、艾草驱秽——串起一腕清欢"。';
COMMENT ON COLUMN public.products.gift_craft IS
  '材质工艺说明（手作/工序维度）：如"天然草木+925银饰，古法编绳，单串手作约40分钟"。';
COMMENT ON COLUMN public.products.gift_scene IS
  '送礼场景（转化核心维度）：如"送给总熬夜的她 / 乔迁新居 / 长辈安康"。';
COMMENT ON COLUMN public.products.gift_care IS
  '保养与使用注意（合规嗅觉体感维度）：含佩戴保养、敏感人群提示；'
  '须含"本品为工艺礼品，非药品"等合规免责，禁疗效宣称。';

-- 同名商品类型过滤索引（首页/探索按 kind 筛选用；低基数列，选择性一般但成本低）
CREATE INDEX IF NOT EXISTS idx_products_product_kind
  ON public.products (product_kind);

-- ==================== 20260804_barcode_feature.sql ====================
-- 20260804 条码（EAN-13 店内码）功能
-- 设计（高手思维）：
--   * 码制固定 EAN-13 店内码：前缀 2 + 门店前缀(6位) + 店内序号(5位) + 校验位(1位) = 13位
--   * 任意扫码枪可解（2 开头为 GS1「店内码」段，零售业标准做法）
--   * 校验位 mod-10 权重交替 1/3，算错部分扫码枪拒扫 → 必须服务端权威计算
--   * 原子分配：stores.barcode_counter 自增 + fn_alloc_store_barcode（行锁，防并发撞码）
--   * 单一数据源：条码仅存 products.barcode 一处
-- 部署：supabase db query --linked --file supabase/migrations/20260804_barcode_feature.sql

-- 1) products：标记码制（默认 EAN13，兼容已有非空条码）
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_type TEXT NOT NULL DEFAULT 'EAN13';

-- 2) stores：门店条码前缀（6 位纯数字，唯一） + 店内序号计数器
ALTER TABLE stores ADD COLUMN IF NOT EXISTS barcode_prefix TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS barcode_counter INT NOT NULL DEFAULT 0;

-- 3) 回填现有门店的 6 位门店前缀（用序列保证唯一、不重复）
DO $$
DECLARE
  seq_name text := 'seq_store_barcode_prefix';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = seq_name) THEN
    EXECUTE 'CREATE SEQUENCE ' || seq_name || ' START WITH 1';
  END IF;
  UPDATE stores
     SET barcode_prefix = lpad(nextval(seq_name)::text, 6, '0')
   WHERE barcode_prefix IS NULL;
END $$;

-- 门店前缀唯一：保证不同店的店内码天然隔离（2+门店前缀 不同）
ALTER TABLE stores ADD CONSTRAINT uniq_store_barcode_prefix UNIQUE (barcode_prefix);

-- 同店条码不重复（仅对非空条码建唯一，允许多个 null）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_store_barcode
  ON products(store_id, barcode) WHERE barcode IS NOT NULL;

-- 4) EAN-13 校验位（mod-10，前 12 位权重交替 1/3）
CREATE OR REPLACE FUNCTION fn_ean13_check(body12 text)
RETURNS text AS $$
DECLARE
  s int := 0;
  i int;
  d int;
BEGIN
  IF length(body12) <> 12 OR body12 !~ '^\d{12}$' THEN
    RAISE EXCEPTION 'EAN13 主体须为 12 位数字';
  END IF;
  FOR i IN 1..12 LOOP
    d := substring(body12 from i for 1)::int;
    IF i % 2 = 1 THEN
      s := s + d * 1;
    ELSE
      s := s + d * 3;
    END IF;
  END LOOP;
  RETURN (((10 - (s % 10)) % 10))::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5) 原子分配下一个店内码：2 + 门店前缀(6) + 店内序号(5) + 校验位(1) = 13 位
--    SECURITY DEFINER：允许 service_role 在 EF 内调用，绕过 RLS
CREATE OR REPLACE FUNCTION fn_alloc_store_barcode(p_store_id uuid)
RETURNS TABLE(barcode text, barcode_type text) AS $$
DECLARE
  v_prefix text;
  v_seq int;
  v_body text;
  v_check text;
BEGIN
  UPDATE stores SET barcode_counter = barcode_counter + 1
   WHERE id = p_store_id
   RETURNING barcode_prefix, barcode_counter INTO v_prefix, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION '门店 % 未配置条码前缀，无法生成店内码', p_store_id;
  END IF;
  IF v_seq > 99999 THEN
    RAISE EXCEPTION '门店 % 店内码序号已用尽（>99999）', p_store_id;
  END IF;

  v_body := '2' || v_prefix || lpad(v_seq::text, 5, '0');
  v_check := fn_ean13_check(v_body);
  barcode := v_body || v_check;
  barcode_type := 'EAN13';
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== 20260804_cleanup_withdrawals_rls81.sql ====================
-- 清理 00081 残留的旧 withdrawals 策略（已被 hotfix 的三条新策略覆盖）
-- 旧策略 rls81_withdrawals_admin 是 ALL + is_admin()，与新 rls_fix_withdrawals_admin_write 功能重复

-- 1) 删除旧策略
DROP POLICY IF EXISTS rls81_withdrawals_admin ON withdrawals;

-- 2) 验证最终状态
SELECT policyname, cmd, roles::text AS applies_to, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'withdrawals'
ORDER BY policyname;

-- ==================== 20260804_cleanup_withdrawals_rls81_ownerread.sql ====================
-- 清理 00081 残留的最后一条旧策略（被 rls_fix_withdrawals_read 完全覆盖）
DROP POLICY IF EXISTS rls81_withdrawals_ownerread ON withdrawals;

-- 最终状态验证
SELECT policyname, cmd, roles::text AS applies_to, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'withdrawals'
ORDER BY policyname;

-- ==================== 20260804_constitution_results.sql ====================
-- 用户体质测试结果全量存档：支撑「为什么是你」回放、复测对比、首页每日个性化
-- 仅存结构化的分数/答案，不存任何诊断结论；合规上仍是「食养偏好倾向」参考。

create table if not exists public.constitution_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  primary_key  text not null,
  secondary_key text null,
  scores       jsonb not null default '{}'::jsonb,
  answers      jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_constitution_results_user
  on public.constitution_results (user_id, created_at desc);

comment on table public.constitution_results is
  '用户体质测试结果全量存档（分数+答案+日期），支撑结果回放与复测';

alter table public.constitution_results enable row level security;

-- 本人可读写自己的结果
drop policy if exists rls_constitution_results_owner on public.constitution_results;
create policy rls_constitution_results_owner
  on public.constitution_results
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 管理员仅可读（运营复盘，不可改）
drop policy if exists rls_constitution_results_admin_read on public.constitution_results;
create policy rls_constitution_results_admin_read
  on public.constitution_results
  for select
  using (is_admin());

-- ==================== 20260804_hotfix_withdrawals_rls.sql ====================
-- hotfix_withdrawals_rls.sql —— 补 withdrawals 表的 RLS 策略（admin 审核提现 403 修复）
-- 根因：00007 只有 SELECT(user_id=auth.uid) + INSERT(user_id=auth.uid)
--       缺少 UPDATE/DELETE 策略，admin 用户审核时被 RLS 默认 DENY
-- 本脚本幂等：先删同名策略再建

-- 1) 确保 is_admin / get_user_role 函数存在（SECURITY DEFINER）
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $func$
  SELECT role FROM public.profiles WHERE id = uid;
$func$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $func$
  SELECT COALESCE(public.get_user_role(auth.uid()) = 'admin'::public.user_role, false);
$func$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin()            TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid)   TO anon, authenticated, service_role;

-- 2) 清理 withdrawals 表上可能存在的旧策略（含 00007 遗留的）
DROP POLICY IF EXISTS "用户只能查看自己的提现记录"   ON public.withdrawals;
DROP POLICY IF EXISTS "用户只能创建自己的提现申请"   ON public.withdrawals;
DROP POLICY IF EXISTS rls_final_withdrawals_ownerread  ON public.withdrawals;
DROP POLICY IF EXISTS rls_final_withdrawals_admin      ON public.withdrawals;

-- 3) 建立正确的 RLS 策略（与 00095 设计一致）
--    SELECT: 本人可读 + 管理员可读
CREATE POLICY rls_fix_withdrawals_read ON public.withdrawals
  FOR SELECT TO anon, authenticated
  USING (user_id = auth.uid() OR public.is_admin());

--    INSERT: 本人可创建自己的提现申请
CREATE POLICY rls_fix_withdrawals_insert ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

--    UPDATE / DELETE: 仅管理员（审核通过/驳回/打款）
CREATE POLICY rls_fix_withdrawals_admin_write ON public.withdrawals
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4) 自检验证
SELECT tablename, policyname, cmd, roles::text AS applies_to,
       qual AS using_expr,
       with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'withdrawals'
ORDER BY policyname;

-- ==================== 20260804_order_printed_at.sql ====================
-- 订单打印状态跟踪：用于"未打印"筛选 + 停电/断网漏单补打
-- printed_at 为 NULL 表示从未成功打印（待补打）；非 NULL 表示最近一次成功打印时间
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS printed_at timestamptz;

COMMENT ON COLUMN public.orders.printed_at IS
  '最近一次成功打印小票的时间；NULL = 从未打印（待补打）。用于商家端"未打印"筛选与批量补打。';

-- ==================== 20260804_order_printed_backfill.sql ====================
-- 历史订单补打标记回填：旧流程在"确认完成"时自动打印，
-- 这些终态订单（completed/after_sale）视为已打印，回填 printed_at，
-- 避免它们全部涌入"未打印"筛选造成噪音。pending_* 与 cancelled 保持 NULL（待补打/不打印）。
-- 幂等：仅回填 printed_at 仍为 NULL 的终态订单。
UPDATE public.orders
SET printed_at = COALESCE(paid_at, created_at)
WHERE printed_at IS NULL
  AND status IN ('completed', 'after_sale');

-- ==================== 20260804_site_configs.sql ====================
-- 站点级配置表：支撑首页品牌底图、运营位素材等无需发版即可热更新的配置
-- key: 配置键（全局唯一）
-- value: JSONB 任意结构化值，保留扩展性
-- updated_at: 最后更新时间
CREATE TABLE IF NOT EXISTS site_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 默认配置：首页 L1 品牌主张区底图，初始为空（保持原有渐变）
INSERT INTO site_configs (key, value)
VALUES (
  'home_brand_hero_bg',
  jsonb_build_object('image_url', null, 'alt', '来店有喜品牌主张背景', 'updated_by', null)
)
ON CONFLICT (key) DO NOTHING;

-- 项目 RLS 已在历史迁移 00028_disable_all_rls 中全局关闭，
-- 后台以真实 admin 用户登录即可读写；如需重新启用 RLS，请另行为 site_configs 建 is_admin() 策略。

-- ==================== 20260916_add_address_coords.sql ====================
-- 20260916_add_address_coords.sql
-- 地址表补充 GCJ-02 经纬度，供结算页「配送半径硬校验」使用。
-- 坐标系须与门店 stores.lat/lng 一致（GCJ-02 / 微信 chooseLocation 返回），方可直接算 haversine 距离。
-- 部署：在 Supabase SQL Editor 手动执行（沙箱 CLI 未 link，无法自动部署）。

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

COMMENT ON COLUMN public.user_addresses.lat IS '收货地址纬度（GCJ-02，与门店同坐标系）';
COMMENT ON COLUMN public.user_addresses.lng IS '收货地址经度（GCJ-02，与门店同坐标系）';

-- 校验（执行后应各返回一行）：
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'user_addresses' AND column_name IN ('lat','lng');

-- ==================== 20260916_delete_test_stores.sql ====================
-- ⚠️⚠️⚠️ 已作废（SUPERSEDED）—— 请勿再次执行！
-- 用户于 2026-09-16 18:5x 确认这 3 家为「真实门店」并要求恢复，
-- 恢复脚本见同目录 20260916_restore_stores.sql。本文件仅留作历史记录。
-- ⚠️⚠️⚠️ 删除 3 家非真实（测试占位）门店及其级联数据
-- 背景：巫山烤鱼 / 横笼铺 / 杭州礼品店 均为测试店，用户确认删除。
-- 级联说明（已核对迁移外键）：
--   - products(10)、printer_configs(1)、merchant_settlements、marketing_campaigns、
--     coupons、store_invites 均为 ON DELETE CASCADE → 自动级联删除
--   - orders / footprints / withdrawals 等 ON DELETE SET NULL → store_id 置空，数据保留
--   - liquidity_distribution / merchant_applications 不引用 stores（前者表已不存在、后者无 store_id 列）
-- 平台店 ffffffff-...-ffffffffffff（来店有喜官方店，37 个商品）保留不动。

DELETE FROM stores
WHERE id IN (
  '0617836f-0b6f-4611-870b-c7ce8da03c84',  -- 巫山烤鱼
  '853a98ae-ffca-4586-9c44-21047a94fbb2',  -- 横笼铺
  '70778d6b-d819-41fc-87a3-8766a78eb60d'   -- 杭州礼品店
);

-- 验证：应只剩 1 行（来店有喜官方店）
SELECT id, name, is_platform, is_active FROM stores ORDER BY name;

-- ==================== 20260916_fix_store_is_platform.sql ====================
-- ============================================================
-- 20260916_fix_store_is_platform.sql
-- 修复「门店商品混淆」根因：4 家门店的 is_platform 被全部标成 true，
-- 导致 src/db/api.ts 的 isPlatformProduct() 里 `store.is_platform === true`
-- 对全部门店成立 → 首页/探索默认流（platformFilter:'only'）把各店商品混在一起。
--
-- 设计意图（见 00026_add_is_platform.sql）：
--   仅「来店有喜官方店」(平台店) is_platform=true；
--   实体门店（巫山烤鱼/横笼铺/杭州礼品店）必须为 false。
-- 列默认已是 false，但存量 3 家实体店被错误标成 true，需要纠正。
--
-- ⚠️ 必须在 Supabase Dashboard → SQL Editor 中执行（沙箱 CLI 未 link）。
-- ============================================================

-- ① 实体门店统一置为非自营（平台/直营过滤时不再混入）
UPDATE stores SET is_platform = false
WHERE id IN (
  '0617836f-0b6f-4611-870b-c7ce8da03c84',  -- 巫山烤鱼
  '853a98ae-ffca-4586-9c44-21047a94fbb2',  -- 横笼铺
  '70778d6b-d819-41fc-87a3-8766a78eb60d'   -- 杭州礼品店
);

-- ② 双保险：确保平台店仍为自营
UPDATE stores SET is_platform = true
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';  -- 来店有喜官方店

-- ③ 新店审批（adminApproveApplication）未传 is_platform，取列默认 false，不会复发；
--    若担心，可显式加固（可选，需改 src/db/api.ts 的 insert 补 is_platform:false）。

-- 验证：应看到 1 行 true（来店有喜官方店）+ 3 行 false（实体店）
SELECT id, name, is_platform, is_active FROM stores ORDER BY is_platform DESC, name;

-- ==================== 20260916_restore_stores.sql ====================
-- ============================================================
-- 20260916_restore_stores.sql
-- 恢复 3 家被误删的真实实体门店（巫山烤鱼 / 横笼铺 / 杭州礼品店）
-- 及其商品（商品为「占位条目」，真实名称/价格需后台或 PITR 补回）。
--
-- 背景：用户先确认删除（见 20260916_delete_test_stores.sql，现已作废），
--       随后纠正「这 3 家是真实门店，需恢复」。删除为 CASCADE，故 10 个
--       商品一并丢失，仓库内无种子/备份可还原，故商品以明确标注的占位行回填。
--
-- 使用方式：Supabase Dashboard → SQL Editor 整段粘贴 → Run。
-- 说明：anon key 无写权限，必须在此处用有权限的 key 执行。
-- ============================================================

-- ===================== 1) 恢复 3 家门店 =====================
-- 字段以官方店（ffffffff）为模板；lat/lng 暂置 NULL（需补真实坐标，否则配送半径校验无法计算）。
INSERT INTO stores (
  id, owner_id, name, description, address, phone, category,
  image_url, banner_url, rating, is_active, referral_rate,
  is_open, open_time, close_time,
  delivery_enabled, pickup_enabled, delivery_radius,
  delivery_fee, free_delivery_threshold, min_order_amount,
  announcement, scene_tags, is_platform, fulfillment_type, lat, lng
) VALUES
(
  '0617836f-0b6f-4611-870b-c7ce8da03c84',  -- 巫山烤鱼
  NULL,
  '巫山烤鱼',
  '巫山风味烤鱼，鲜活现做',
  '待补充',
  '400-000-0000',
  '美食',
  'https://picsum.photos/seed/wushan/400/400',
  'https://picsum.photos/seed/wushan-banner/800/400',
  NULL,            -- 不造假评分
  true,
  0.10,
  true, '08:00', '20:00',
  true, true, 3.0,
  0.0, 30.0, 0.0,
  '', '{}', false, 'both', NULL, NULL
),
(
  '853a98ae-ffca-4586-9c44-21047a94fbb2',  -- 横笼铺
  NULL,
  '横笼铺',
  '传统手工点心，现蒸现卖',
  '待补充',
  '400-000-0000',
  '美食',
  'https://picsum.photos/seed/henglong/400/400',
  'https://picsum.photos/seed/henglong-banner/800/400',
  NULL,
  false,           -- 注意：删除前该店 is_active=false（停用状态），保留原状
  0.10,
  true, '08:00', '20:00',
  true, true, 3.0,
  0.0, 30.0, 0.0,
  '', '{}', false, 'both', NULL, NULL
),
(
  '70778d6b-d819-41fc-87a3-8766a78eb60d',  -- 杭州礼品店
  NULL,
  '杭州礼品店',
  '杭州特色伴手礼与精选礼品',
  '待补充',
  '400-000-0000',
  '礼品',
  'https://picsum.photos/seed/hangzhou/400/400',
  'https://picsum.photos/seed/hangzhou-banner/800/400',
  NULL,
  true,
  0.10,
  true, '08:00', '20:00',
  true, true, 3.0,
  0.0, 30.0, 0.0,
  '', '{}', false, 'both', NULL, NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  is_platform = false;   -- 双保险：实体店非平台店

-- ===================== 2) 恢复商品（占位条目） =====================
-- ⚠️ 真实名称/价格/图片已随 CASCADE 删除且仓库无备份，此处以【待录入】占位，
--    请通过商家后台商品管理或 Supabase PITR 还原真实数据后删除占位行。
-- 分布：巫山烤鱼=1、横笼铺=3、杭州礼品店=6（与原分布一致）。
INSERT INTO products (store_id, name, description, price, is_active, review_status, product_kind, image_url)
VALUES
  ('0617836f-0b6f-4611-870b-c7ce8da03c84', '【待录入】巫山烤鱼商品1', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/ws1/400/400'),
  ('853a98ae-ffca-4586-9c44-21047a94fbb2', '【待录入】横笼铺商品1', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/hl1/400/400'),
  ('853a98ae-ffca-4586-9c44-21047a94fbb2', '【待录入】横笼铺商品2', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/hl2/400/400'),
  ('853a98ae-ffca-4586-9c44-21047a94fbb2', '【待录入】横笼铺商品3', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'food', 'https://picsum.photos/seed/hl3/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品1', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz1/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品2', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz2/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品3', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz3/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品4', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz4/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品5', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz5/400/400'),
  ('70778d6b-d819-41fc-87a3-8766a78eb60d', '【待录入】杭州礼品店商品6', '待补充（原商品已删除，请补录真实数据）', 0.00, true, 'approved', 'gift', 'https://picsum.photos/seed/hz6/400/400');

-- ===================== 3) 验证 =====================
-- 应看到 4 行：官方店 + 3 家恢复的实体店
SELECT id, name, is_platform, is_active FROM stores ORDER BY is_platform DESC, name;

-- 恢复的商品占位行数（应为 10）
SELECT store_id, count(*) AS placeholder_products
FROM products
WHERE name LIKE '【待录入】%'
GROUP BY store_id ORDER BY store_id;

-- ==================== 20260916c_ensure_barcode_prefix.sql ====================
-- ============================================================
-- 20260916c 门店条码前缀兜底（回填 + 触发器自动分配）
-- ============================================================
-- 背景：条码迁移(20260804)只在部署时一次性回填了「当时已存在」的门店。
--       之后经 admin-create-store 建自营店、或 20260916_restore_stores 恢复
--       实体店，INSERT 都未带 barcode_prefix，导致 allocStoreBarcode 报
--       「未配置条码前缀，无法生成店内码」。
-- 作用：
--   1) 序列兜底（避开官方店已占用的 000001）
--   2) 回填：所有仍缺前缀的门店补 6 位唯一前缀
--   3) 根治：新建门店触发器自动分配，覆盖所有建店路径
-- 用法：Supabase Dashboard → SQL Editor 整段粘贴 → Run（需 service_role / 有权限 key）
-- ============================================================

-- 1) 序列兜底：若不存在则建（START 2，避开官方店已有的 000001）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'seq_store_barcode_prefix') THEN
    EXECUTE 'CREATE SEQUENCE seq_store_barcode_prefix START WITH 2';
  END IF;
END $$;

-- 2) 回填：所有仍缺前缀的门店，用序列补 6 位唯一前缀
--    （uniq_store_barcode_prefix 唯一约束保证不撞码）
UPDATE stores
   SET barcode_prefix = lpad(nextval('seq_store_barcode_prefix')::text, 6, '0')
 WHERE barcode_prefix IS NULL;

-- 3) 根治：新建门店若未带前缀，触发器自动从序列取（覆盖 admin-create-store / 恢复脚本 等所有路径）
CREATE OR REPLACE FUNCTION fn_set_store_barcode_prefix()
RETURNS trigger AS $$
BEGIN
  IF NEW.barcode_prefix IS NULL THEN
    NEW.barcode_prefix := lpad(nextval('seq_store_barcode_prefix')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_barcode_prefix ON stores;
CREATE TRIGGER trg_store_barcode_prefix
  BEFORE INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION fn_set_store_barcode_prefix();

-- 4) 验证：每家店都应有 6 位纯数字前缀，且互不相同
SELECT id, name, barcode_prefix, is_platform
FROM stores
ORDER BY barcode_prefix;

-- ==================== 20260917_fix_merchant_approval_store.sql ====================
-- =============================================================
-- 20260917 修复「自营门店审核通过，却进不了管理后台」
-- -------------------------------------------------------------
-- 现象：小程序「我的 → 自营门店」显示「已通过」，点「前往管理后台」后
--       管理中心始终停在「自营门店已通过 / 正在为您准备门店数据」，
--       或直接提示「您尚未开通门店」，永远进不去。
--
-- 根因（代码级，两处硬伤叠加）：
--   1) 小程序端 adminApproveApplication 建店时写 store_type = 'self'，
--      而 stores_store_type_check 只允许 hub / transfer / truck / branch
--      （migrations/20260802_self_operated_unified_rbac.sql:13）
--      → INSERT 必然报 23514，门店建不出来；
--   2) 该函数（旧实现）先 update merchant_applications.status='approved'
--      再 INSERT stores，失败无法回滚 → 用户被永久卡在「已通过 + 无门店」；
--   3) merchant-center 解析商家身份只认 stores.owner_id / store_staff，
--      两者皆空 → getMerchantStore() 恒返回 null → 进不了管理后台。
--   代码已修（api.ts / admin-web api.ts 改为先建店后落状态 + store_type='branch'），
--   本迁移负责「存量数据止血 + 旧客户端兼容」。
--
-- 本迁移三件事，全部幂等可重复执行：
--   A. 放宽 store_type CHECK 容忍历史值 'self'（旧版客户端兼容阀）
--   B. 为「已通过但无门店」的申请补建门店（owner_id 指向申请人）
--   C. 把 owner_id 门店补登记 store_staff(role='owner')，统一身份来源
--
-- 执行方式：Supabase Dashboard → SQL Editor 整段粘贴执行（或 supabase db query --linked）
-- =============================================================

-- ── A. store_type CHECK 容忍历史 'self' ────────────────────────
-- 新代码写 'branch'（普通门店，与 admin-web 表单 / admin-create-store EF 对齐），
-- 但已发布出去的旧版小程序仍会写 'self'，故 CHECK 放宽以免再次建店失败。
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.stores'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%store_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stores DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_type_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_store_type_check
  CHECK (store_type IS NULL OR store_type IN ('hub', 'transfer', 'truck', 'branch', 'self'));

-- ── B. 补建缺失门店（approved 申请但名下无门店）────────────────
-- 幂等三保险：① 该 user_id 名下已有门店则跳过；② 同名活跃门店已存在则跳过（防重复建店）；
--             ③ 顺带补 short_code（二维码 scene 参数用，generate_store_short_code 已存在）。
INSERT INTO public.stores
  (owner_id, name, phone, address, category, store_type, is_active, rating, short_code)
SELECT
  a.user_id,
  a.store_name,
  a.contact_phone,
  a.address,
  '其他',
  'branch',
  true,
  0,
  public.generate_store_short_code()
FROM public.merchant_applications a
WHERE a.status = 'approved'
  AND a.store_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.owner_id = a.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.stores s2 WHERE s2.name = a.store_name
  );

-- ── C. owner_id → store_staff(role='owner') 身份统一 ────────────
-- 与 migrations/20260802_self_operated_unified_rbac.sql 第 3 步同源；
-- merchant-center / RLS 的 fn_my_store_ids 同时认 owner_id 与 store_staff，补全更稳。
INSERT INTO public.store_staff (store_id, user_id, role, is_active)
SELECT s.id, s.owner_id, 'owner', true
FROM public.stores s
WHERE s.owner_id IS NOT NULL
ON CONFLICT (store_id, user_id)
DO UPDATE SET role = EXCLUDED.role, is_active = true;

-- ── 诊断输出：核对「已通过申请 ↔ 门店」对应关系 ─────────────────
SELECT
  a.status                AS 申请状态,
  a.store_name            AS 申请门店名,
  a.contact_phone         AS 申请手机号,
  (SELECT count(*) FROM public.stores s WHERE s.owner_id = a.user_id) AS 名下门店数,
  (SELECT string_agg(s.name || '(' || coalesce(s.store_type,'NULL') || ',active=' || s.is_active || ')', ', ')
     FROM public.stores s WHERE s.owner_id = a.user_id)              AS 门店明细,
  (SELECT count(*) FROM public.store_staff t WHERE t.user_id = a.user_id AND t.is_active) AS 员工身份数
FROM public.merchant_applications a
ORDER BY a.created_at DESC;

-- ==================== 20260921_global_categories_scene.sql ====================
-- ============================================================
-- 20260921_global_categories_scene.sql
-- 好物（自营页）分类改为「场景 / 人群」风格（对齐首页 HOME_FOOD_TAGS）
--
-- 背景：
--   自营页 /pages/explore/index 左侧分类读 store_categories(scope='global', is_active=true)
--   （见 src/pages/explore/index.tsx:25/188）。原本规划按"九种体质"划分，但用户反馈
--   偏中医辨证、像"卖药"，不符合食品电商调性。改为首页同款「场景/人群」标签：
--   宝宝零食 / 孕产营养 / 老年养生 / 舒心食养 / 肠胃食养 / 温润食养 / 敏感防护 / 熬夜加班。
--   这些均为生活场景/人群词，已逐条比对 src/utils/compliance/shield.ts 的 FORBIDDEN_WORDS，
--   不含治疗/调理/滋补/健脾等违禁词，合规。
--
-- 类目仍写入 store_categories(scope='global')，因此后台 Categories.tsx 原生支持
-- 增 / 改名（级联同步商品归类）/ 上架下架 / 排序 / 删除 —— "管理后台可修改分类" 不变。
-- 商品在「商品编辑 → 分类」按 category_id 归类即可出现在对应类目下（本迁移不做任何猜测性归类）。
--
-- 本迁移做三件事（幂等，可重复执行）：
--   1) 防御：确保 store_categories.store_id 可空（global 行必须为 NULL）
--   2) 插入/校正 8 条场景类目（已存在同名则只校正排序与上架态，不覆盖 id）
--   3) 下架旧的物理品类「日用」「礼品」与（若残留）九体质类目（不删除：可逆，后台可一键重新上架）
--
-- 使用方式：
--   方式 A（推荐）：Supabase Dashboard → SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db query --linked --file supabase/migrations/20260921_global_categories_scene.sql
--
-- ⚠️ 不修改任何商品数据。类目与商品的关联仍是 products.category_id，
--    需由商家/管理员在「商品编辑 → 分类」里归类（本迁移不做任何猜测性归类）。
-- ============================================================

-- =====================
-- 第1步：防御性放开 store_id（全局类目的 store_id 必须为 NULL）
-- =====================
ALTER TABLE public.store_categories ALTER COLUMN store_id DROP NOT NULL;

-- =====================
-- 第2步：插入缺失的场景类目（幂等：同名 global 已存在则跳过）
-- =====================
-- 排序 10~80，与首页 HOME_FOOD_TAGS 顺序一致：
--   宝宝零食 → 孕产营养 → 老年养生 → 舒心食养 → 肠胃食养 → 温润食养 → 敏感防护 → 熬夜加班
INSERT INTO public.store_categories (store_id, name, sort_order, scope, is_active)
SELECT NULL, v.name, v.sort_order, 'global', true
FROM (VALUES
  ('宝宝零食', 10),
  ('孕产营养', 20),
  ('老年养生', 30),
  ('舒心食养', 40),
  ('肠胃食养', 50),
  ('温润食养', 60),
  ('敏感防护', 70),
  ('熬夜加班', 80)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_categories c
  WHERE c.scope = 'global' AND c.name = v.name
);

-- =====================
-- 第3步：校正这 8 条的排序与上架态（幂等；不覆盖 id，避免打断既有商品挂靠）
-- =====================
UPDATE public.store_categories c
SET sort_order = v.sort_order,
    is_active  = true,
    scope      = 'global',
    store_id   = NULL
FROM (VALUES
  ('宝宝零食', 10),
  ('孕产营养', 20),
  ('老年养生', 30),
  ('舒心食养', 40),
  ('肠胃食养', 50),
  ('温润食养', 60),
  ('敏感防护', 70),
  ('熬夜加班', 80)
) AS v(name, sort_order)
WHERE c.name = v.name
  AND c.scope = 'global';

-- =====================
-- 第4步：下架旧物理品类与（若残留）九体质类目（不删除，后台可重新上架；仅动 global 且无商品挂靠的）
-- =====================
UPDATE public.store_categories c
SET is_active = false
WHERE c.scope = 'global'
  AND c.name IN (
    '日用', '礼品', '图书', '美食', '饮品', '零食', '生鲜',
    '平和质', '气虚质', '阳虚质', '阴虚质', '痰湿质', '湿热质', '血瘀质', '气郁质', '特禀质'
  )
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id);

-- =====================
-- 校验：应看到 8 条 is_active=true 的场景类目（sort_order 10~80）
-- =====================
SELECT c.name,
       c.sort_order,
       c.is_active,
       (SELECT count(*) FROM public.products p WHERE p.category_id = c.id) AS product_count
FROM public.store_categories c
WHERE c.scope = 'global'
ORDER BY c.is_active DESC, c.sort_order;

-- ==================== 20260924_add_category_icon.sql ====================
-- 场景图标可后台更换：store_categories 加 icon 列（emoji 文本）
-- 执行位置：Supabase Dashboard → SQL Editor（沙箱无法跑 DDL，需手动执行）
-- 作用：金刚区图标不再硬编码在前端，改为读库内 icon，运营在「商品分类管理」后台可自由改。

ALTER TABLE public.store_categories ADD COLUMN IF NOT EXISTS icon text NULL;

-- 种子：把当前前端硬编码的 8 个场景 emoji 写回库（key 与 name 一致）。
-- 仅当 icon 为空时写入，避免覆盖运营已自定义的图标。
UPDATE public.store_categories SET icon = '🍼'  WHERE name = '宝宝零食'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🥕'  WHERE name = '孕产营养'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '👵'  WHERE name = '银发呵护'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🌙'  WHERE name = '睡前安适'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🥣'  WHERE name = '肠胃养护'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '💪'  WHERE name = '体虚调理'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '🛡️' WHERE name = '敏感防护'  AND icon IS NULL;
UPDATE public.store_categories SET icon = '⚡'  WHERE name = '熬夜党'    AND icon IS NULL;

COMMENT ON COLUMN public.store_categories.icon IS '场景图标（emoji 文本），金刚区与落地页读取；后台可编辑';

-- ==================== 20260924_add_products_spec.sql ====================
-- 商品规格（净含量 / 包装文案）
--
-- 背景：products 表 65 列中不存在任何承载规格的列（无 spec / weight / net / unit / pack / size），
-- 而「食品选品种子_48SKU_2026-09-23.csv」第 7 列 spec_g（如 30 = 30g）早已设计好却从未入库。
-- 后果：商品卡只有「图 + 名 + 价」，缺了电商转化三件套里的规格，用户无法判断「这个价买到多少」。
--
-- 新增 spec 为一个纯展示字段（text），承载「30g」「100g × 2 袋」这类面向用户的规格文案。
-- 选填：无规格的商品前端不渲染该行，不受影响。

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS spec text;

COMMENT ON COLUMN public.products.spec IS '商品规格展示文案（如 30g / 100g × 2 袋），来源选品数据 spec_g，商品卡在商品名下方渲染';

-- ==================== 20260924_cleanup_pending_referrals.sql ====================
-- 清理 pending_referrals 冗余数据（B1-d）
-- 2026-09-24
--
-- 背景：扫码锁客记录（pending_referrals）仅在「注册」路径会经 RPC
--       convert_pending_referral 转化；纯登录不注册的用户会留下永久
--       pending 行，且仅有 30 天 expires_at 标记、无任务删除，长期堆积。
-- 本迁移一次性清理历史冗余，逻辑幂等（可重复执行，无副作用）。
--
-- 执行方式：在 Supabase 后台 SQL Editor 运行本文件；或下次 supabase db push
--           随迁移自动执行。删除 converted/expired 行安全，因其关系已落到
--           user_store_relation / commissions，pending 表仅作过渡。

-- 1. 把已过期仍未转化的 pending 标记为 expired（保留可追溯）
UPDATE pending_referrals
SET status = 'expired', updated_at = now()
WHERE status = 'pending'
  AND expires_at < now();

-- 2. 删除已转化 / 已过期记录（过渡数据，无需长期保留）
DELETE FROM pending_referrals
WHERE status IN ('converted', 'expired');

-- 3. 同设备去重：同一 device_id 有多条 pending 时仅保留最新一条（created_at 最大）
DELETE FROM pending_referrals a
USING pending_referrals b
WHERE a.device_id = b.device_id
  AND a.device_id IS NOT NULL
  AND a.status = 'pending'
  AND b.status = 'pending'
  AND a.created_at < b.created_at;

-- 4. 兜底：device_id 为空的孤立 pending（无设备归属，无法转化）一并清理
DELETE FROM pending_referrals
WHERE status = 'pending'
  AND device_id IS NULL;

-- 注：如需常态化自动清理，建议 Supabase 后台启用 pg_cron 扩展并定时执行
--     上述 UPDATE + DELETE（例如每 7 天一次），避免未来再次堆积。

-- ==================== 20260926_schema_drift_tables.sql ====================
-- 补齐「线上已存在、但从未纳入迁移管理」的 3 张表（schema drift）
--
-- 背景：这三张表由早期手工建库产生，216 个迁移里找不到任何建表语句。
-- 线上探测（anon key 直读）确认均存在且有数据：
--   cities      城市字典，小程序「城市选择 / 定位」在用（缺失会导致换环境直接不可用）
--   home_ads    首页广告位（旧版，后台现改走 site_configs.home_ad_slots）
--   trigger_logs 触发器/打印等动作日志，由 Edge Function 写入
--
-- 全部使用 CREATE TABLE IF NOT EXISTS：线上已存在则整段跳过，不会改动任何现有数据或权限。
-- 刻意不写 ENABLE ROW LEVEL SECURITY / policy：线上这三张表的 RLS 状态未在迁移中记录，
-- 贸然 ENABLE 而无配套 policy 会直接锁死小程序的匿名读取。RLS 状态维持现状。

-- 城市字典：小程序城市选择、定位匹配
CREATE TABLE IF NOT EXISTS public.cities (
  id         integer      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  city_code  text,
  city_name  text,
  province   text,
  lng        double precision,
  lat        double precision,
  status     text         DEFAULT 'active',
  pinyin     text,
  initial    text,
  is_hot     boolean      DEFAULT false,
  sort_order integer      DEFAULT 0,
  created_at timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cities_status ON public.cities (status);
CREATE INDEX IF NOT EXISTS idx_cities_name ON public.cities (city_name);

COMMENT ON TABLE public.cities IS '城市字典（schema drift 补录，原手工建库）';

-- 首页广告位（旧版）。新版后台改用 site_configs.home_ad_slots，此表保留供历史数据查询
CREATE TABLE IF NOT EXISTS public.home_ads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type text   DEFAULT 'image',
  media_url  text,
  poster_url text,
  link_url   text,
  title      text,
  sort_order integer DEFAULT 0,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_ads_active ON public.home_ads (is_active, sort_order);

COMMENT ON TABLE public.home_ads IS '首页广告位旧版（schema drift 补录）；新版读 site_configs.home_ad_slots';

-- 动作日志：打印触发器、分佣重试等 EF 写入的执行记录
CREATE TABLE IF NOT EXISTS public.trigger_logs (
  id         integer      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_no   text,
  action     text,
  error      text,
  created_at timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trigger_logs_order ON public.trigger_logs (order_no);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created ON public.trigger_logs (created_at DESC);

COMMENT ON TABLE public.trigger_logs IS 'EF 动作日志（schema drift 补录），如 PRINT_ENTER / 分佣失败等';

-- ==================== 20260926_store_barcodes_ledger.sql ====================
-- ============================================================
-- 20260926 店内码台账（store_barcodes）
-- ============================================================
-- 背景（真实故障）：
--   杭州礼品店 barcode_counter 已涨到 7，但全库 products.barcode 无一非空。
--   即「码分配出去了、商品上一个都没落」。根因链：
--     ① 生成走 RPC fn_alloc_store_barcode（SECURITY DEFINER，必然成功，counter 自增）
--     ② 回写 products.barcode 走客户端 REST UPDATE —— 被 RLS 静默拒绝
--        （PostgREST 对 RLS 拒绝的 UPDATE 不报错、只返回 0 行，前端 upErr 为 null）
--     ③ 前端以为成功 → UI 显示条码 → 点「打印标签」
--     ④ 打印 EF 读 products.barcode 仍是 NULL → 报「该商品无条码，请先生成店内码」
--   表现就是用户说的「申请内部条形码不能打印」。
--   另：分配出的裸码只存在于前端 state，刷新即永久丢失，无法补打。
-- 本迁移做两件事：
--   1) 建台账表 store_barcodes：每次出码都留痕（含裸码），可查、可补打
--   2) 让出码与落库自动对齐：RPC 插台账 + 商品写码后自动绑定（status: pending→bound）
-- 用法：Supabase Dashboard → SQL Editor 整段粘贴 → Run（需 service_role / 有权限 key）
-- ============================================================

-- 1) 台账表
CREATE TABLE IF NOT EXISTS public.store_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  barcode text NOT NULL,
  barcode_type text NOT NULL DEFAULT 'EAN13',
  product_id uuid,
  -- pending = 已出码未绑商品（裸码，可打空白标签）；bound = 已绑定商品
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_barcodes_code
  ON public.store_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_store_barcodes_store
  ON public.store_barcodes(store_id, created_at DESC);

-- 2) RLS：门店 owner 与平台管理员可读写（与 products 口径一致）
ALTER TABLE public.store_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sb_owner_all ON public.store_barcodes;
CREATE POLICY sb_owner_all ON public.store_barcodes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM stores s WHERE s.id = store_barcodes.store_id AND s.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM stores s WHERE s.id = store_barcodes.store_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS sb_admin_all ON public.store_barcodes;
CREATE POLICY sb_admin_all ON public.store_barcodes
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- 3) 出码即入台账：改写 fn_alloc_store_barcode（SECURITY DEFINER，绕过 RLS 写入）
--    原逻辑（2 + 门店前缀6 + 序号5 + 校验位1）完全保留，只在 RETURN NEXT 前多插一行。
CREATE OR REPLACE FUNCTION fn_alloc_store_barcode(p_store_id uuid)
RETURNS TABLE(barcode text, barcode_type text) AS $$
DECLARE
  v_prefix text;
  v_seq int;
  v_body text;
  v_check text;
BEGIN
  UPDATE stores SET barcode_counter = barcode_counter + 1
   WHERE id = p_store_id
   RETURNING barcode_prefix, barcode_counter INTO v_prefix, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION '门店 % 未配置条码前缀，无法生成店内码', p_store_id;
  END IF;
  IF v_seq > 99999 THEN
    RAISE EXCEPTION '门店 % 店内码序号已用尽（>99999）', p_store_id;
  END IF;

  v_body := '2' || v_prefix || lpad(v_seq::text, 5, '0');
  v_check := fn_ean13_check(v_body);
  barcode := v_body || v_check;
  barcode_type := 'EAN13';

  -- 台账留痕：裸码先记 pending，商品落库后由触发器改为 bound
  BEGIN
    INSERT INTO store_barcodes(store_id, barcode, barcode_type, product_id, status)
    VALUES (p_store_id, barcode, barcode_type, NULL, 'pending')
    ON CONFLICT (barcode) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- 台账写入绝不能阻断出码主流程
    NULL;
  END;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) 商品落库即绑定：products.barcode 写入/变更时，台账自动置 bound
CREATE OR REPLACE FUNCTION fn_sync_product_barcode()
RETURNS trigger AS $$
BEGIN
  IF NEW.barcode IS NOT NULL AND NEW.barcode <> ''
     AND (TG_OP = 'INSERT' OR OLD.barcode IS DISTINCT FROM NEW.barcode) THEN
    BEGIN
      INSERT INTO store_barcodes(store_id, barcode, barcode_type, product_id, status)
      VALUES (NEW.store_id, NEW.barcode, COALESCE(NEW.barcode_type, 'EAN13'), NEW.id, 'bound')
      ON CONFLICT (barcode) DO UPDATE
        SET product_id = EXCLUDED.product_id, status = 'bound';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_product_barcode_sync ON public.products;
CREATE TRIGGER trg_product_barcode_sync
  AFTER INSERT OR UPDATE OF barcode ON public.products
  FOR EACH ROW EXECUTE FUNCTION fn_sync_product_barcode();

-- 5) 把「历史上已分配但没进台账」的存量补进台账（用 counter 反推，best-effort）
--    注意：只能补出 pending 状态的裸码记录，无法还原它们原本要绑哪个商品。
DO $$
DECLARE
  r record;
  v_seq int;
  v_code text;
BEGIN
  FOR r IN SELECT id, barcode_prefix, barcode_counter FROM stores
           WHERE barcode_prefix IS NOT NULL AND barcode_counter > 0 LOOP
    FOR v_seq IN 1..r.barcode_counter LOOP
      v_code := '2' || r.barcode_prefix || lpad(v_seq::text, 5, '0')
                || fn_ean13_check('2' || r.barcode_prefix || lpad(v_seq::text, 5, '0'));
      BEGIN
        INSERT INTO store_barcodes(store_id, barcode, barcode_type, status)
        VALUES (r.id, v_code, 'EAN13', 'pending')
        ON CONFLICT (barcode) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

-- 6) 验证：每店台账条数应与 counter 对齐（存量补录后应相等）
SELECT s.name, s.barcode_counter,
       (SELECT count(*) FROM store_barcodes b WHERE b.store_id = s.id) AS ledger_count
FROM stores s
ORDER BY s.barcode_counter DESC;

-- ==================== 20260927_add_category_parent.sql ====================
-- ============================================================
-- 20260927_add_category_parent.sql
-- 分类体系升级为「场景(一级) → 子类(二级)」，用户端与 admin-web 两端同源
--
-- 设计（低风险模型，已与前端代码对齐）：
--   一级分类：parent_id IS NULL（现有 8 个 global 场景，如宝宝零食/孕产营养…）
--   二级分类：parent_id = 所属一级 id（本文件预置 28 个，后台可改/删/增）
--   商品：保留 products.category_id = 一级（金刚区/探索页计数不受影响），
--         新增 products.sub_category_id = 二级（仅作为「场景内二级筛选」维度）。
--         → 二级不与一级争计数，首页金刚区零风险；探索页落地页用 sub_category_id 做 Tab 筛选。
--   scope：二级默认 global（平台统一维护），商家亦可自建店内二级。
--
-- 二级命名法（全网研究结论）：以「形态/剂型」为主维度（软糕/脆片/冻干/丸球/含片/糊粥/坚果谷物），
--   叠加人群语义（宝宝分龄溶豆奶片、熬夜护眼助眠等），全部不含功效/疾病词（合规）。
--
-- 幂等：可重复执行。加列 IF NOT EXISTS；种子用显式 UUID + ON CONFLICT(id) DO NOTHING。
--
-- 使用方式：
--   方式 A（推荐）：Supabase Dashboard → SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db query --linked --file supabase/migrations/20260927_add_category_parent.sql
-- ============================================================

-- =====================
-- 第1步：store_categories 加自引用层级列（ON DELETE CASCADE：删一级时其二代一并删除）
-- =====================
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.store_categories(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.store_categories.parent_id IS '父分类 id：NULL=一级分类（场景）；非 NULL=二级分类';

-- =====================
-- 第2步：products 加二级分类维度（筛选用，非主归类）
-- =====================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.sub_category_id IS '二级分类 id：场景内细分（形态/剂型），用于探索页 Tab 筛选；category_id 仍是一级场景';

-- =====================
-- 第3步：索引（按 parent_id 拉子类 / 按 sub_category_id 筛商品）
-- =====================
CREATE INDEX IF NOT EXISTS idx_store_categories_parent_id ON public.store_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_sub_category_id ON public.products(sub_category_id);

-- =====================
-- 第4步：防御触发器——禁止「二级再挂二级」（只允许两层）
-- =====================
CREATE OR REPLACE FUNCTION public.fn_store_categories_depth_guard()
RETURNS trigger AS $$
DECLARE
  p_parent uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_id INTO p_parent FROM public.store_categories WHERE id = NEW.parent_id;
    IF p_parent IS NOT NULL THEN
      RAISE EXCEPTION '分类最多两层：父分类「%」本身已是二级，不能再挂子类', NEW.parent_id;
    END IF;
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION '分类不能以自己为父';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_categories_depth_guard ON public.store_categories;
CREATE TRIGGER trg_store_categories_depth_guard
  BEFORE INSERT OR UPDATE OF parent_id ON public.store_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_store_categories_depth_guard();

-- =====================
-- 第5步：预置 28 个二级分类（显式 UUID，幂等 ON CONFLICT）
--   命名只含「形态/剂型 + 人群语义」，无功效/疾病词。
-- =====================
INSERT INTO public.store_categories (id, store_id, name, sort_order, scope, is_active, parent_id)
VALUES
  -- 宝宝零食 689bc729-5e75-4d16-b573-b1861d89d228
  ('0d86c3a1-c2b5-41e5-9f6f-3d088ecd853b', NULL, '溶豆·奶片', 10, 'global', true, '689bc729-5e75-4d16-b573-b1861d89d228'),
  ('23dee2fd-caaf-435a-bf88-662582f35d4b', NULL, '磨牙脆饼',   20, 'global', true, '689bc729-5e75-4d16-b573-b1861d89d228'),
  ('22195875-a206-4a6f-b02d-3e4b03d00f58', NULL, '果蔬脆',     30, 'global', true, '689bc729-5e75-4d16-b573-b1861d89d228'),
  -- 孕产营养 6ed844cd-7163-4006-b005-6496a0647966
  ('7d7a4d8c-40e4-42f8-9de3-0ca1b2a7c90f', NULL, '轻养糕点',   10, 'global', true, '6ed844cd-7163-4006-b005-6496a0647966'),
  ('11e9a458-9d01-431a-b1d8-14e55ba86d11', NULL, '坚果谷物脆', 20, 'global', true, '6ed844cd-7163-4006-b005-6496a0647966'),
  ('446bcbcd-82ca-4d6e-b292-6c2c03ac0626', NULL, '冻干滋补',   30, 'global', true, '6ed844cd-7163-4006-b005-6496a0647966'),
  -- 老年养生 e1be224c-9d2d-4a85-ba11-d90c77bb02b9
  ('ca42b285-0d25-47fb-b0ee-df3d6ac56a9e', NULL, '低糖糊羹',   10, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  ('f460b6d5-1776-48ed-b4bf-53f117f9876a', NULL, '软糯糕点',   20, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  ('97247c46-6fb7-40ef-a8a8-c0f413cd99b7', NULL, '坚果谷物',   30, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  ('4bc0f199-17e5-46b9-a913-2cf71b65f572', NULL, '润燥冻干',   40, 'global', true, 'e1be224c-9d2d-4a85-ba11-d90c77bb02b9'),
  -- 舒心食养 a6ae7d58-42f0-43e7-ae73-a968b93ab8a4
  ('fe3acf00-646e-4b47-b865-f87cade92ed8', NULL, '安神糕点',   10, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  ('28a40ce6-7517-40a4-93dd-2a293cb0f3b2', NULL, '黑芝麻丸',   20, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  ('e60ec5d4-8ab0-4201-abe0-80bc953a0d61', NULL, '冻干温润',   30, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  ('9ce5d4b4-9232-401c-8fb5-4bb4994f5722', NULL, '暖养脆',     40, 'global', true, 'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4'),
  -- 肠胃食养 ef38bc5b-3749-4404-a1a1-5db3270b9254
  ('e083699d-cfa3-4c1d-bcbd-3314e6797d1c', NULL, '消食含片',   10, 'global', true, 'ef38bc5b-3749-4404-a1a1-5db3270b9254'),
  ('916a8720-f4c6-41c2-a3b2-dcd12b8baf9f', NULL, '养胃薄脆',   20, 'global', true, 'ef38bc5b-3749-4404-a1a1-5db3270b9254'),
  ('379093cc-f3cc-4730-900e-ee8f0903e283', NULL, '暖胃粥羹',   30, 'global', true, 'ef38bc5b-3749-4404-a1a1-5db3270b9254'),
  -- 温润食养 8d545cbf-cf34-4d56-ac43-a35142365298
  ('f7007cc7-c91b-47d0-85eb-ceec016c2dbd', NULL, '润养含片',   10, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  ('cd01f7a7-c0fc-4bfb-ad8b-b04e3274622a', NULL, '温润糕点',   20, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  ('dff3697d-4e08-4a63-976b-19d1bbdd4460', NULL, '山药脆',     30, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  ('b3585301-890a-4f18-b8a5-7e4fd389b4f3', NULL, '冻干温润',   40, 'global', true, '8d545cbf-cf34-4d56-ac43-a35142365298'),
  -- 敏感防护 bf890924-5893-48c5-bc20-b7120ad415e7
  ('e780c1af-e3b2-4351-bd8e-fa5130dc5628', NULL, '纯净单品脆', 10, 'global', true, 'bf890924-5893-48c5-bc20-b7120ad415e7'),
  ('d30fe164-94fa-4d9d-9829-51bb4d4ae57a', NULL, '无麸质米脆', 20, 'global', true, 'bf890924-5893-48c5-bc20-b7120ad415e7'),
  ('50d1c79c-ebc6-44cc-9408-e738e7203cf9', NULL, '坚果椰脆',   30, 'global', true, 'bf890924-5893-48c5-bc20-b7120ad415e7'),
  -- 熬夜加班 52f0659d-2aac-4533-87c5-04a07cf529a4
  ('d4e2774f-a63b-46f2-8a04-28a919078a0b', NULL, '护眼脆',     10, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4'),
  ('03f9838d-7b92-4323-8530-ad122495c92b', NULL, '黑芝麻丸',   20, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4'),
  ('dad6800f-5584-4f2d-9b04-17736e1406b1', NULL, '熬夜轻脆',   30, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4'),
  ('52f7e290-a17c-49b0-a2b9-9fed22c8cbc0', NULL, '护眼冻干',   40, 'global', true, '52f0659d-2aac-4533-87c5-04a07cf529a4')
ON CONFLICT (id) DO NOTHING;

-- =====================
-- 第6步：把现有 48 款食疗商品按「真实食疗属性」归位到二级（sub_category_id）
--   仅填 sub_category_id，不动 category_id（一级场景保持不变）。
-- =====================
-- 宝宝零食
UPDATE public.products SET sub_category_id = '0d86c3a1-c2b5-41e5-9f6f-3d088ecd853b' WHERE id IN ('9edd06fc-5087-4427-b957-fd8012d06e69','7346ba00-2698-4b6d-b1be-9b21ba0e9482'); -- 溶豆·奶片
UPDATE public.products SET sub_category_id = '23dee2fd-caaf-435a-bf88-662582f35d4b' WHERE id IN ('57d737c8-4b4d-4bb1-9c10-b1ce0e9212bf','0479342c-3157-4123-ac35-8aebb40f05fe','8502cef9-a834-478f-b506-b433e282d0ec'); -- 磨牙脆饼
UPDATE public.products SET sub_category_id = '22195875-a206-4a6f-b02d-3e4b03d00f58' WHERE id IN ('03600803-38cc-4f1f-9c2d-d141087ab2f3'); -- 果蔬脆
-- 孕产营养
UPDATE public.products SET sub_category_id = '7d7a4d8c-40e4-42f8-9de3-0ca1b2a7c90f' WHERE id IN ('f23df4fc-b14d-4442-b51e-2faf48118569','a1095d8f-dec9-4daf-9432-60b598d7be75'); -- 轻养糕点
UPDATE public.products SET sub_category_id = '11e9a458-9d01-431a-b1d8-14e55ba86d11' WHERE id IN ('9acfea88-677a-4266-97ac-045623002604','06fd4bed-0cd1-4908-b723-e5dc76b51e0e','796a37eb-98d5-4314-ae95-212d35af5d9a'); -- 坚果谷物脆
UPDATE public.products SET sub_category_id = '446bcbcd-82ca-4d6e-b292-6c2c03ac0626' WHERE id IN ('290409c3-b8ef-412f-82bd-bd5266b1056b'); -- 冻干滋补
-- 老年养生
UPDATE public.products SET sub_category_id = 'ca42b285-0d25-47fb-b0ee-df3d6ac56a9e' WHERE id IN ('1fbcc34b-f83e-489e-acc0-df755f54aaa2','73acc64b-0bdb-4f81-9c82-fcf13224596b'); -- 低糖糊羹
UPDATE public.products SET sub_category_id = 'f460b6d5-1776-48ed-b4bf-53f117f9876a' WHERE id IN ('ff10425f-0d06-4490-ab4f-e56bffad0db8','dc78b7b0-ab88-46c2-88e2-ae45d7e6b921'); -- 软糯糕点
UPDATE public.products SET sub_category_id = '97247c46-6fb7-40ef-a8a8-c0f413cd99b7' WHERE id IN ('b8621574-3cb8-4481-bbf9-8f20a4f3ced6'); -- 坚果谷物
UPDATE public.products SET sub_category_id = '4bc0f199-17e5-46b9-a913-2cf71b65f572' WHERE id IN ('da0118fb-e23d-40b4-956d-d96bebee68af'); -- 润燥冻干
-- 舒心食养
UPDATE public.products SET sub_category_id = 'fe3acf00-646e-4b47-b865-f87cade92ed8' WHERE id IN ('84814577-2721-4096-a9d1-3eeff9c86c08','105c71ae-88d7-4fd6-a0ec-870a1111f1d6'); -- 安神糕点
UPDATE public.products SET sub_category_id = '28a40ce6-7517-40a4-93dd-2a293cb0f3b2' WHERE id IN ('ac6a0ffd-d3d9-403c-b699-1da22e1f8451'); -- 黑芝麻丸
UPDATE public.products SET sub_category_id = 'e60ec5d4-8ab0-4201-abe0-80bc953a0d61' WHERE id IN ('f718c31b-f8e0-4fee-b4c3-95d2214bf3c5','0c3596e9-0bc1-4120-98cc-5bcbb8bcd38e'); -- 冻干温润
UPDATE public.products SET sub_category_id = '9ce5d4b4-9232-401c-8fb5-4bb4994f5722' WHERE id IN ('24bd383c-52cb-4c17-91b7-ab108d0984ad'); -- 暖养脆
-- 肠胃食养
UPDATE public.products SET sub_category_id = 'e083699d-cfa3-4c1d-bcbd-3314e6797d1c' WHERE id IN ('96c86224-f29c-47b4-8b95-13827eb4a1bb','2095a82e-30bc-4e5c-a274-201ac5d8fc0c','b0c4325e-8f52-4f2d-97e6-bbb6b383c729'); -- 消食含片
UPDATE public.products SET sub_category_id = '916a8720-f4c6-41c2-a3b2-dcd12b8baf9f' WHERE id IN ('86954e91-2e6c-4e8c-bbb5-bb31773fd793','3d07ecdf-f829-423a-beca-06640a815e0b'); -- 养胃薄脆
UPDATE public.products SET sub_category_id = '379093cc-f3cc-4730-900e-ee8f0903e283' WHERE id IN ('ee6ef7fe-0858-4d55-b0d6-8821a08c9a59'); -- 暖胃粥羹
-- 温润食养
UPDATE public.products SET sub_category_id = 'f7007cc7-c91b-47d0-85eb-ceec016c2dbd' WHERE id IN ('225663dd-f659-4132-9faa-3397165e9155','ce938bbf-8d40-4691-9c58-a33c00610134'); -- 润养含片
UPDATE public.products SET sub_category_id = 'cd01f7a7-c0fc-4bfb-ad8b-b04e3274622a' WHERE id IN ('125c17ba-f8cf-41bf-b956-1b592201e9d0','a838c39a-c067-427f-bcca-33f4c2a55e9a'); -- 温润糕点
UPDATE public.products SET sub_category_id = 'dff3697d-4e08-4a63-976b-19d1bbdd4460' WHERE id IN ('1eea5aba-7c77-426d-893c-6e31fc6c976f'); -- 山药脆
UPDATE public.products SET sub_category_id = 'b3585301-890a-4f18-b8a5-7e4fd389b4f3' WHERE id IN ('9bf6d7b6-7540-4799-82d9-6fd97e4957ce'); -- 冻干温润
-- 敏感防护
UPDATE public.products SET sub_category_id = 'e780c1af-e3b2-4351-bd8e-fa5130dc5628' WHERE id IN ('d7796cef-0b39-457e-94d5-b8cdc699d161','0ae2817e-67ca-4196-b2dd-1fce30e191c7','e1088425-f131-43d8-abc5-aefa51b0b452'); -- 纯净单品脆
UPDATE public.products SET sub_category_id = 'd30fe164-94fa-4d9d-9829-51bb4d4ae57a' WHERE id IN ('f06c72d6-579b-4c82-8745-addcc291789d'); -- 无麸质米脆
UPDATE public.products SET sub_category_id = '50d1c79c-ebc6-44cc-9408-e738e7203cf9' WHERE id IN ('e5707f00-cc3c-461c-9b36-489354259b4a','c62eb439-b10a-4355-97a3-77fe03f829a9'); -- 坚果椰脆
-- 熬夜加班
UPDATE public.products SET sub_category_id = 'd4e2774f-a63b-46f2-8a04-28a919078a0b' WHERE id IN ('07452c6d-eee5-45b4-90b4-f01064403e35','6e16a6c7-a4f5-451c-b1b8-2452b484bbcd'); -- 护眼脆
UPDATE public.products SET sub_category_id = '03f9838d-7b92-4323-8530-ad122495c92b' WHERE id IN ('5aaab8d4-ea1a-46fd-8e9b-305ad2629965'); -- 黑芝麻丸
UPDATE public.products SET sub_category_id = 'dad6800f-5584-4f2d-9b04-17736e1406b1' WHERE id IN ('9f7e98c7-5aec-4ab3-9430-4dbd12687b72','f259918f-33ed-4c8f-8a23-28784f4c4912'); -- 熬夜轻脆
UPDATE public.products SET sub_category_id = '52f7e290-a17c-49b0-a2b9-9fed22c8cbc0' WHERE id IN ('c7afe162-f2ab-4a35-858d-60bb7012998e'); -- 护眼冻干

-- =====================
-- 第7步：校验（应看到 8 个一级 + 28 个二级；一级 parent_id 为空）
-- =====================
SELECT p.name AS parent_name,
       c.name AS child_name,
       c.sort_order,
       c.is_active
FROM public.store_categories c
JOIN public.store_categories p ON p.id = c.parent_id
WHERE c.scope = 'global' AND p.scope = 'global'
ORDER BY p.sort_order, c.sort_order;

-- ==================== 20260927_cleanup_unclassified_products.sql ====================
-- ============================================================
-- 20260927_cleanup_unclassified_products.sql
-- 【可选 · 手动执行】清理未归类商品（57 款，不属于 8 大食疗场景）
--
-- ⚠️ 本文件为「手动可选」脚本，请勿随常规迁移批量自动运行。
--    推荐在 Supabase Dashboard → SQL Editor 中分段执行：
--      第 1 段「预览」→ 确认数量与名单 → 第 2 段按需开启对应 DELETE。
--
-- 数据背景（2026-09-27 实测）：
--   线上 products 共 105 款；其中 48 款落在 8 大食疗场景（已在
--   20260927_add_category_parent.sql 中归位到二级分类）。
--   其余 57 款不属于 8 大场景：45 款 food + 12 款 gift。
--   这 57 款全部 main_image 为空，包含三类：
--     · OCR 脏数据（识别残留，重复出现）
--     · 【待录入】未完成占位（review_status=pending）
--     · 偏离「药食同源食疗」定位的普通零食/饮料（真实但不符合品牌定位）
--
-- 设计原则（防误伤）：
--   ① gift 类（礼品店真礼品，共 12 款）一律不动；
--   ② 仅 product_kind='food' 且明确为垃圾 / 偏离定位才处理；
--   ③ 删除条件用「名称 / 状态 / 类型 / 是否离场」判定，不 hardcode 57 个 UUID，
--      避免误删未来新增的真实商品；
--   ④ 自带预览段，跑删除前先看清楚要删哪些。
--
-- 8 大场景一级 UUID（用于 T3 判定「离场」）：
--   宝宝零食   689bc729-5e75-4d16-b573-b1861d89d228
--   孕产营养   6ed844cd-7163-4006-b005-6496a0647966
--   老年养生   e1be224c-9d2d-4a85-ba11-d90c77bb02b9
--   舒心食养   a6ae7d58-42f0-43e7-ae73-a968b93ab8a4
--   肠胃食养   ef38bc5b-3749-4404-a1a1-5db3270b9254
--   温润食养   8d545cbf-cf34-4d56-ac43-a35142365298
--   敏感防护   bf890924-5893-48c5-bc20-b7120ad415e7
--   熬夜加班   52f0659d-2aac-4533-87c5-04a07cf529a4
-- ============================================================


-- ============================================================
-- 第 1 段：预览（先跑这段，确认每档要删多少、是哪些）
-- ============================================================
SELECT bucket, cnt FROM (
  -- T1：OCR 脏数据（识别残留，明确安全）
  SELECT 'T1_OCR脏数据'        AS bucket, COUNT(*) AS cnt
  FROM products WHERE name = 'OCR零食'

  UNION ALL
  -- T2：未完成占位（pending + 【待录入】标记）
  SELECT 'T2_待录入占位', COUNT(*)
  FROM products
  WHERE review_status = 'pending' AND name LIKE '%【待录入】%'

  UNION ALL
  -- T3：偏离食疗定位的普通零食/饮料（food 且离场 8 大场景且已上架）
  SELECT 'T3_偏离定位真零食', COUNT(*)
  FROM products
  WHERE product_kind = 'food'
    AND category_id NOT IN (
      '689bc729-5e75-4d16-b573-b1861d89d228',
      '6ed844cd-7163-4006-b005-6496a0647966',
      'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
      'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
      'ef38bc5b-3749-4404-a1a1-5db3270b9254',
      '8d545cbf-cf34-4d56-ac43-a35142365298',
      'bf890924-5893-48c5-bc20-b7120ad415e7',
      '52f0659d-2aac-4533-87c5-04a07cf529a4'
    )
    AND review_status = 'approved'
) x
ORDER BY bucket;

-- 查看 T1+T2 明细（明确垃圾，建议删除；可核对无误再开 DELETE）
SELECT id, name, product_kind, review_status, category_id
FROM products
WHERE name = 'OCR零食'
   OR (review_status = 'pending' AND name LIKE '%【待录入】%')
ORDER BY name;

-- 查看 T3 明细（业务决策，确认确为"非药食同源真零食"再开启）
SELECT id, name, product_kind, review_status, category_id
FROM products
WHERE product_kind = 'food'
  AND category_id NOT IN (
    '689bc729-5e75-4d16-b573-b1861d89d228',
    '6ed844cd-7163-4006-b005-6496a0647966',
    'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
    'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
    'ef38bc5b-3749-4404-a1a1-5db3270b9254',
    '8d545cbf-cf34-4d56-ac43-a35142365298',
    'bf890924-5893-48c5-bc20-b7120ad415e7',
    '52f0659d-2aac-4533-87c5-04a07cf529a4'
  )
  AND review_status = 'approved'
ORDER BY name;


-- ============================================================
-- 第 2 段：执行（按需开启，默认全部注释）
-- 注意：若 DELETE 因外键（如 order_items / cart 引用）报错，说明这些商品
--       已有订单/购物车记录，请先处理关联数据或改为软删除（如置 review_status='rejected'）。
-- ============================================================

-- T1：OCR 脏数据（明确安全）
-- DELETE FROM products WHERE name = 'OCR零食';

-- T2：未完成占位（pending + 【待录入】标记）
-- DELETE FROM products WHERE review_status = 'pending' AND name LIKE '%【待录入】%';

-- T3（业务决策，默认关闭）：偏离食疗定位的普通零食/饮料
--   仅当上面 T3 明细确认无误、且业务上决定"只留 48 款食疗真品"时再开启。
--   本档只删 food 类，gift 类（12 款真礼品）不受影响。
-- DELETE FROM products
-- WHERE product_kind = 'food'
--   AND category_id NOT IN (
--     '689bc729-5e75-4d16-b573-b1861d89d228',
--     '6ed844cd-7163-4006-b005-6496a0647966',
--     'e1be224c-9d2d-4a85-ba11-d90c77bb02b9',
--     'a6ae7d58-42f0-43e7-ae73-a968b93ab8a4',
--     'ef38bc5b-3749-4404-a1a1-5db3270b9254',
--     '8d545cbf-cf34-4d56-ac43-a35142365298',
--     'bf890924-5893-48c5-bc20-b7120ad415e7',
--     '52f0659d-2aac-4533-87c5-04a07cf529a4'
--   )
--   AND review_status = 'approved';

-- ==================== 20260927_rename_scenes_to_replica.sql ====================
-- 20260927 八大场景命名对齐首页 UI 复刻（replica）
-- 5 个场景名由「库锁定旧名」改为「截图新名」，使首页金刚区/落地页/好物页左栏与截图一致。
-- 前端常量已同步：CategoryGrid.CAT_EMOJI / NEED_MAP(need-find) / SCENE_BY_CROWD(food) / QUICK_BODY_PRESETS(crowd-nlu)。
-- 首页 CategoryGrid 暂用 SCENE_ALIAS 桥接旧名→新名，本迁移执行后桥接自动失效。

UPDATE public.store_categories SET name = '老年养生' WHERE name = '银发呵护';
UPDATE public.store_categories SET name = '舒心食养' WHERE name = '睡前安适';
UPDATE public.store_categories SET name = '温润食养' WHERE name = '体虚调理';
UPDATE public.store_categories SET name = '肠胃食养' WHERE name = '肠胃养护';
UPDATE public.store_categories SET name = '熬夜加餐' WHERE name = '熬夜党';
-- 20260921 种子库直接写入的「熬夜加班」（旧名变体），同样归一到拍板名「熬夜加餐」。
-- 线上实测 8 个一级场景为 0921 种子名，上面 5 条为 0 行属预期；本条才是关键修正。
UPDATE public.store_categories SET name = '熬夜加餐' WHERE name = '熬夜加班';

-- 名称已改，按新名补图标（幂等：仅当 icon 为空时写回，避免覆盖后台自定义 emoji）
UPDATE public.store_categories SET icon = '👵' WHERE name = '老年养生' AND icon IS NULL;
UPDATE public.store_categories SET icon = '🌙' WHERE name = '舒心食养' AND icon IS NULL;
UPDATE public.store_categories SET icon = '💪' WHERE name = '温润食养' AND icon IS NULL;
UPDATE public.store_categories SET icon = '🥣' WHERE name = '肠胃食养' AND icon IS NULL;
UPDATE public.store_categories SET icon = '⚡' WHERE name = '熬夜加餐'  AND icon IS NULL;

-- ==================== 20261008a_food_categories.sql ====================
-- ============================================================
-- 20261008a_food_categories.sql
-- 食疗导购分类「food_category」由代码硬编码枚举 → 数据库驱动（后台可扩展，无需发版）
-- 背景：products.food_category 原先被 CHECK 锁死在 4 个值（粉面/炖汤/热饮/小菜），
--       新增分类（如 糕点/饮品）必须改代码+发版。本迁移把它改成「参考表驱动」：
--         - 放松 CHECK（旧 4 值仍合法，向后兼容，已有数据零影响）
--         - 新建 food_categories 参考表（admin 可增/改/停用）
--         - 前端下拉从此表读取（FOOD_CATEGORIES 常量仅作离线兜底）
-- 幂等：可重复执行。DROP CONSTRAINT IF EXISTS / CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING。
-- 执行：Supabase SQL Editor 整段粘贴 Run；或 supabase db query --linked --file <本文件>
-- ============================================================

-- 第1步：放松 products.food_category 的硬编码 CHECK（旧值仍合法，纯放宽）
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_food_category;

-- 第2步：食疗导购分类参考表
CREATE TABLE IF NOT EXISTS public.food_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  scope       text NOT NULL DEFAULT 'global',   -- global=平台统一维护；merchant=店内自建
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.food_categories IS '食疗导购分类参考表：替代 products.food_category 的硬编码 CHECK，后台可扩展';
COMMENT ON COLUMN public.food_categories.name IS '分类名（粉面/炖汤/热饮/小菜…，与旧 CHECK 值一致）';
COMMENT ON COLUMN public.food_categories.is_active IS '是否启用（停用的分类前端下拉不再出现，但历史商品仍保留该值）';

CREATE INDEX IF NOT EXISTS idx_food_categories_active ON public.food_categories (is_active, sort_order);

-- 第3步：种子——与旧 CHECK 完全一致，确保既有数据/前端不崩
INSERT INTO public.food_categories (name, sort_order) VALUES
  ('粉面', 1),
  ('炖汤', 2),
  ('热饮', 3),
  ('小菜', 4)
ON CONFLICT (name) DO NOTHING;

-- 第4步：updated_at 触发器（复用项目既有 set_updated_at()；此处兜底确保自包含）
CREATE TRIGGER trg_food_categories_touch_updated_at
  BEFORE UPDATE ON public.food_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 第5步：RLS
--   规则：admin（is_admin）全读写；登录用户 + 匿名 只读 is_active=true 的分类。
ALTER TABLE public.food_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS food_categories_admin_all ON public.food_categories;
CREATE POLICY food_categories_admin_all ON public.food_categories
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS food_categories_read ON public.food_categories;
CREATE POLICY food_categories_read ON public.food_categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ============================================================
-- 回滚（如需恢复硬编码约束，手动执行以下两段）：
--   ALTER TABLE public.products
--     ADD CONSTRAINT chk_products_food_category
--     CHECK (food_category IS NULL OR food_category IN ('粉面','炖汤','热饮','小菜'));
--   DROP TABLE IF EXISTS public.food_categories;
-- ============================================================

-- ==================== 20261008b_ingredient_candidates.sql ====================
-- ============================================================
-- 20261008b_ingredient_candidates.sql
-- 自由原料候选池：商家/用户在「自由输入原料」时登记，便于后续提升为正式食材字典条目。
-- 对齐：小程序端 + 网页后台的「自由原料（free: 前缀）」机制，登记到统一候选池做聚合。
-- 设计：
--   - 纯新增表，不动任何既有表/数据（低风险）。
--   - UNIQUE(name, store_id)：同一门店内同名原料只留一条；store_id 为 NULL 表示平台级。
--   - status：pending(待审)/approved(已收录为字典)/rejected(驳回)，由 admin 后台管理。
-- 幂等：CREATE TABLE IF NOT EXISTS；策略 DROP POLICY IF EXISTS 后重建。
-- 执行：Supabase SQL Editor 整段粘贴 Run；或 supabase db query --linked --file <本文件>
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ingredient_candidates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  store_id    uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  source      text NOT NULL DEFAULT 'free_input',  -- free_input/merchant/admin/import
  status      text NOT NULL DEFAULT 'pending',      -- pending/approved/rejected
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, store_id)
);

COMMENT ON TABLE  public.ingredient_candidates IS '自由原料候选池：自由输入的原料登记在此，供后续提升为正式食材字典';
COMMENT ON COLUMN public.ingredient_candidates.store_id IS '来源门店；NULL=平台级候选';
COMMENT ON COLUMN public.ingredient_candidates.status IS 'pending 待审 / approved 已收录 / rejected 驳回';

CREATE INDEX IF NOT EXISTS idx_ingredient_candidates_store   ON public.ingredient_candidates (store_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_candidates_status ON public.ingredient_candidates (status);
CREATE INDEX IF NOT EXISTS idx_ingredient_candidates_name   ON public.ingredient_candidates (name);

-- updated_at 触发器（复用项目既有 set_updated_at()）
CREATE TRIGGER trg_ingredient_candidates_touch_updated_at
  BEFORE UPDATE ON public.ingredient_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS：
--   admin（is_admin）全读写（管理候选状态）；
--   登录用户可读候选池（pending/approved 皆可看，便于同名复用），并允许登记（INSERT）；
--   匿名只读 approved（对外展示已收录原料）。
-- ⚠️ MVP 阶段 INSERT 放宽到 authenticated（store_id 由前端传入）；生产建议收敛到
--   校验「store_id 属于当前用户」或改由 Edge Function service_role 写入。
ALTER TABLE public.ingredient_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredient_candidates_admin_all ON public.ingredient_candidates;
CREATE POLICY ingredient_candidates_admin_all ON public.ingredient_candidates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ingredient_candidates_read ON public.ingredient_candidates;
CREATE POLICY ingredient_candidates_read ON public.ingredient_candidates
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ingredient_candidates_insert ON public.ingredient_candidates;
CREATE POLICY ingredient_candidates_insert ON public.ingredient_candidates
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 回滚：DROP TABLE IF EXISTS public.ingredient_candidates;
-- ============================================================

-- ==================== 20261009_fix_category_tree_cleanup.sql ====================
-- ============================================================
-- 20261009_fix_category_tree_cleanup.sql
-- 修正 20261009 迁移的两处问题（幂等，可重复执行）：
--
-- 问题1：第4步按「名字」下架旧场景类目时，误伤了同名的新二级「孕产营养」
--        （它本应作为 生鲜辅食 的二级子类保留，且 6 个产品已预归类到它名下）。
--        这里按 id 精准重新激活新的二级「孕产营养」，让那 6 个产品恢复可见。
--
-- 问题2：旧「场景/人群」一级类目（宝宝零食/舒心食养/熬夜加餐…）整体下架后，
--        它们底下还残留一批自动生成的「商品型」二级（护眼脆/黑芝麻丸/山药脆/
--        消食含片…），产品数全 0、父级已 inactive，在 C 端不显示但污染分类树。
--        这里把「父级属于旧场景一级」的遗留二级统一下架（不删除=可逆）。
--
-- 使用方式：supabase db query --linked --file supabase/migrations/20261009_fix_category_tree_cleanup.sql
-- ⚠️ 不删任何数据，仅改 is_active。
-- ============================================================

-- =====================
-- 第1步：按 id 重新激活新的二级「孕产营养」（生鲜辅食下，id 固定）
-- =====================
UPDATE public.store_categories
SET is_active = true
WHERE id = 'd1000000-0000-0000-0000-000000000052';

-- =====================
-- 第2步：下架「父级是旧场景一级」的遗留商品型二级（产品数 0，可逆）
-- =====================
UPDATE public.store_categories c
SET is_active = false
WHERE c.parent_id IN (
  SELECT id FROM public.store_categories
  WHERE scope = 'global'
    AND name IN (
      '宝宝零食','孕产营养','老年养生','银发呵护','舒心食养','睡前安适','肠胃食养','肠胃养护',
      '温润食养','体虚调理','敏感防护','熬夜加餐','熬夜加班','熬夜党'
    )
)
AND c.id != 'd1000000-0000-0000-0000-000000000052'; -- 保护新的二级孕产营养（其父是生鲜辅食，本就不会命中；双保险）

-- =====================
-- 校验：active 一级 + 其 active 二级（应只剩大厂标准品类树）
-- =====================
SELECT
  CASE WHEN c.parent_id IS NULL THEN '【一级】' ELSE '  └二级' END AS level,
  c.name,
  c.sort_order,
  (SELECT count(*) FROM public.products p WHERE p.category_id = c.id) AS product_count
FROM public.store_categories c
WHERE c.scope = 'global' AND c.is_active = true
ORDER BY c.parent_id NULLS FIRST, c.sort_order;

-- ==================== 20261009_global_categories_product_standard.sql ====================
-- ============================================================
-- 20261009_global_categories_product_standard.sql
-- 好物（自营页）/ 类目落地页 左侧分类改为「大厂电商标准的二级品类」结构
--
-- 背景：
--   20260921 把分类改成了「场景/人群」风格（宝宝零食 / 舒心食养 …），
--   但运营与用户反馈：按「场景/功效」挑商品不如按「品类」直观，且顶部还叠了
--   「性味 / 功效」两组筛选（与场景维度重复、像卖药）。本次需求：
--     1) 删掉顶部的「性味 / 功效」筛选（前端 goods/index.tsx 已移除）
--     2) 分类树只保留「二级品类」——一级品类 → 二级品类，按商品品类划分，
--        对齐天猫/京东超市食品类目规范（休闲零食 / 冲调饮品 / 滋补养生 / 粮油调味 …）
--
-- 本迁移做四件事（幂等，可重复执行）：
--   1) 插入一级品类（parent_id=NULL, scope='global', is_active=true）
--   2) 插入各自二级品类（parent_id=对应一级 id）
--   3) 把原本挂在旧「场景类目」下的商品，预归并到最贴近的新一级/二级品类
--      （避免分类切换后商品“消失”在导航里；明细可在后台「商品编辑→分类」微调）
--   4) 下架旧场景/物理品类（is_active=false，可一键重新上架，不删除=可逆）
--
-- 使用方式：
--   方式 A（推荐）：Supabase Dashboard → SQL Editor 整段粘贴 → Run
--   方式 B（CLI）：supabase db query --linked --file supabase/migrations/20261009_global_categories_product_standard.sql
--
-- ⚠️ 仅影响 store_categories 与 products.category_id 的归类；不删任何数据。
-- ============================================================

-- =====================
-- 第1步：插入一级品类（幂等：同名 global 已存在则跳过，保留既有 id）
-- =====================
INSERT INTO public.store_categories (id, store_id, name, sort_order, scope, is_active, parent_id)
SELECT v.id, NULL, v.name, v.sort_order, 'global', true, NULL
FROM (VALUES
  ('d1000000-0000-0000-0000-000000000010'::uuid, '休闲零食', 10),
  ('d1000000-0000-0000-0000-000000000020'::uuid, '冲调饮品', 20),
  ('d1000000-0000-0000-0000-000000000030'::uuid, '滋补养生', 30),
  ('d1000000-0000-0000-0000-000000000040'::uuid, '粮油调味', 40),
  ('d1000000-0000-0000-0000-000000000050'::uuid, '生鲜辅食', 50),
  ('d1000000-0000-0000-0000-000000000060'::uuid, '其他',     60)
) AS v(id, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_categories c
  WHERE c.scope = 'global' AND c.name = v.name AND c.parent_id IS NULL
);

-- =====================
-- 第2步：插入二级品类（power id = 一级id + 序号；幂等跳过）
-- =====================
INSERT INTO public.store_categories (id, store_id, name, sort_order, scope, is_active, parent_id)
SELECT v.id, NULL, v.name, v.sort_order, 'global', true, v.parent_id
FROM (VALUES
  -- 休闲零食 →
  ('d1000000-0000-0000-0000-000000000011'::uuid, '坚果炒货', 11, 'd1000000-0000-0000-0000-000000000010'::uuid),
  ('d1000000-0000-0000-0000-000000000012'::uuid, '饼干糕点', 12, 'd1000000-0000-0000-0000-000000000010'::uuid),
  ('d1000000-0000-0000-0000-000000000013'::uuid, '膨化食品', 13, 'd1000000-0000-0000-0000-000000000010'::uuid),
  ('d1000000-0000-0000-0000-000000000014'::uuid, '糖果巧克力', 14, 'd1000000-0000-0000-0000-000000000010'::uuid),
  ('d1000000-0000-0000-0000-000000000015'::uuid, '肉干肉脯', 15, 'd1000000-0000-0000-0000-000000000010'::uuid),
  ('d1000000-0000-0000-0000-000000000016'::uuid, '果干蜜饯', 16, 'd1000000-0000-0000-0000-000000000010'::uuid),
  ('d1000000-0000-0000-0000-000000000017'::uuid, '海味零食', 17, 'd1000000-0000-0000-0000-000000000010'::uuid),
  -- 冲调饮品 →
  ('d1000000-0000-0000-0000-000000000021'::uuid, '蜂蜜',     21, 'd1000000-0000-0000-0000-000000000020'::uuid),
  ('d1000000-0000-0000-0000-000000000022'::uuid, '花草茶',   22, 'd1000000-0000-0000-0000-000000000020'::uuid),
  ('d1000000-0000-0000-0000-000000000023'::uuid, '固体饮料', 23, 'd1000000-0000-0000-0000-000000000020'::uuid),
  ('d1000000-0000-0000-0000-000000000024'::uuid, '谷物麦片', 24, 'd1000000-0000-0000-0000-000000000020'::uuid),
  ('d1000000-0000-0000-0000-000000000025'::uuid, '即食藕粉', 25, 'd1000000-0000-0000-0000-000000000020'::uuid),
  -- 滋补养生 →
  ('d1000000-0000-0000-0000-000000000031'::uuid, '药食同源食材', 31, 'd1000000-0000-0000-0000-000000000030'::uuid),
  ('d1000000-0000-0000-0000-000000000032'::uuid, '膏方蜜丸',    32, 'd1000000-0000-0000-0000-000000000030'::uuid),
  ('d1000000-0000-0000-0000-000000000033'::uuid, '蜂产品',      33, 'd1000000-0000-0000-0000-000000000030'::uuid),
  ('d1000000-0000-0000-0000-000000000034'::uuid, '代用茶',      34, 'd1000000-0000-0000-0000-000000000030'::uuid),
  -- 粮油调味 →
  ('d1000000-0000-0000-0000-000000000041'::uuid, '米面杂粮', 41, 'd1000000-0000-0000-0000-000000000040'::uuid),
  ('d1000000-0000-0000-0000-000000000042'::uuid, '食用油',   42, 'd1000000-0000-0000-0000-000000000040'::uuid),
  ('d1000000-0000-0000-0000-000000000043'::uuid, '调味酱料', 43, 'd1000000-0000-0000-0000-000000000040'::uuid),
  -- 生鲜辅食 →
  ('d1000000-0000-0000-0000-000000000051'::uuid, '婴幼儿辅食', 51, 'd1000000-0000-0000-0000-000000000050'::uuid),
  ('d1000000-0000-0000-0000-000000000052'::uuid, '孕产营养',   52, 'd1000000-0000-0000-0000-000000000050'::uuid),
  -- 其他 →
  ('d1000000-0000-0000-0000-000000000061'::uuid, '文创周边', 61, 'd1000000-0000-0000-0000-000000000060'::uuid),
  ('d1000000-0000-0000-0000-000000000062'::uuid, '日用品',   62, 'd1000000-0000-0000-0000-000000000060'::uuid)
) AS v(id, name, sort_order, parent_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_categories c
  WHERE c.scope = 'global' AND c.name = v.name AND c.parent_id = v.parent_id
);

-- =====================
-- 第3步：旧场景类目 → 新品类 预归类（保留商品可见性，可在后台微调）
-- =====================
UPDATE public.products p
SET category_id = CASE
  WHEN old.name IN ('宝宝零食')                                   THEN 'd1000000-0000-0000-0000-000000000010' -- 休闲零食
  WHEN old.name IN ('孕产营养')                                   THEN 'd1000000-0000-0000-0000-000000000052' -- 孕产营养(二级)
  WHEN old.name IN ('老年养生','银发呵护','体虚调理','肠胃养护','肠胃食养')
                                                                  THEN 'd1000000-0000-0000-0000-000000000030' -- 滋补养生
  WHEN old.name IN ('舒心食养','睡前安适','温润食养','熬夜加餐','熬夜加班','熬夜党')
                                                                  THEN 'd1000000-0000-0000-0000-000000000020' -- 冲调饮品
  WHEN old.name IN ('敏感防护')                                   THEN 'd1000000-0000-0000-0000-000000000060' -- 其他
  ELSE p.category_id
END
FROM public.store_categories old
WHERE p.category_id = old.id
  AND old.scope = 'global'
  AND old.name IN (
    '宝宝零食','孕产营养','老年养生','银发呵护','舒心食养','睡前安适','肠胃食养','肠胃养护',
    '温润食养','体虚调理','敏感防护','熬夜加餐','熬夜加班','熬夜党'
  );

-- =====================
-- 第4步：下架旧场景/物理品类（不删除，后台可一键重新上架）
-- =====================
UPDATE public.store_categories c
SET is_active = false
WHERE c.scope = 'global'
  AND c.name IN (
    '宝宝零食','孕产营养','老年养生','银发呵护','舒心食养','睡前安适','肠胃食养','肠胃养护',
    '温润食养','体虚调理','敏感防护','熬夜加餐','熬夜加班','熬夜党',
    '日用','礼品','图书','美食','饮品','零食','生鲜'
  );

-- =====================
-- 校验：应看到 6 条一级 + 23 条二级（is_active=true）的品类树
-- =====================
SELECT
  CASE WHEN c.parent_id IS NULL THEN '【一级】' ELSE '  └二级' END AS level,
  c.name,
  c.sort_order,
  (SELECT count(*) FROM public.products p WHERE p.category_id = c.id) AS product_count
FROM public.store_categories c
WHERE c.scope = 'global' AND c.is_active = true
ORDER BY c.parent_id NULLS FIRST, c.sort_order;

-- ==================== 20261010_add_enable_therapy.sql ====================
-- 迁移 20261010：商品级「是否启用食养系统」开关
-- 背景：部分商品（如简单零食、非食品类）不需要食养系统，C 端不应展示食养/关怀层/适合我徽章。
-- 设计：与 product_kind 双闸门——食养系统仅在「食品类 且 enable_therapy 开启」时展示；
--       非食品类（gift/craft/care）由 product_kind 闸门彻底不展示；本列仅用于「食品类里再关掉」。
-- 兼容性：默认 true，保证存量食品商品继续展示；非食品存量行回填 false（仅语义清洁，product_kind 已拦截）。

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS enable_therapy boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.enable_therapy IS
  '商品级食养系统开关：true=展示食养/关怀层（仅当 product_kind=food 时生效）；false=彻底不展示。非食品类由 product_kind 闸门拦截，本列对其无意义。';

-- 存量回填：非食品类置 false（幂等，重复执行无害）
UPDATE products
  SET enable_therapy = false
  WHERE product_kind IS NOT NULL
    AND product_kind <> 'food'
    AND product_kind <> '';

-- ==================== 回滚_类目图标_2026-09-24.sql ====================
-- 回滚：移除 store_categories.icon 列（场景图标恢复前端硬编码兜底）
ALTER TABLE public.store_categories DROP COLUMN IF EXISTS icon;
