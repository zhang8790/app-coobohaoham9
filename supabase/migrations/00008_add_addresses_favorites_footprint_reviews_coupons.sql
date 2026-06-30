
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
