-- ============================================
-- 步骤1：创建表结构
-- ============================================

-- 1.1 删除可能存在的旧表（避免冲突）
DROP TABLE IF EXISTS public.user_campaign_claims CASCADE;
DROP TABLE IF EXISTS public.marketing_campaigns CASCADE;
DROP TABLE IF EXISTS public.self_operated_stores CASCADE;
DROP TABLE IF EXISTS public.cities CASCADE;

-- 1.2 创建 cities 表（城市信息）
CREATE TABLE public.cities (
    id SERIAL PRIMARY KEY,
    city_code VARCHAR(20) UNIQUE NOT NULL,
    city_name VARCHAR(100) NOT NULL,
    province VARCHAR(100),
    lng DECIMAL(10, 7),
    lat DECIMAL(10, 7),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 创建 self_operated_stores 表（自营门店）
CREATE TABLE public.self_operated_stores (
    id SERIAL PRIMARY KEY,
    store_code VARCHAR(50) UNIQUE NOT NULL,
    store_name VARCHAR(200) NOT NULL,
    city_id INTEGER REFERENCES public.cities(id),
    address TEXT,
    lng DECIMAL(10, 7),
    lat DECIMAL(10, 7),
    phone VARCHAR(20),
    business_hours VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 创建 marketing_campaigns 表（营销活动）
CREATE TABLE public.marketing_campaigns (
    id SERIAL PRIMARY KEY,
    campaign_code VARCHAR(50) UNIQUE NOT NULL,
    campaign_name VARCHAR(200) NOT NULL,
    campaign_type VARCHAR(20) NOT NULL CHECK (campaign_type IN ('red_packet', 'physical')),
    city_id INTEGER REFERENCES public.cities(id),
    store_id INTEGER REFERENCES public.self_operated_stores(id),
    gift_name VARCHAR(200),
    gift_value DECIMAL(10, 2),
    commission_rate DECIMAL(5, 2),
    daily_limit INTEGER DEFAULT 100,
    total_limit INTEGER DEFAULT 1000,
    claimed_count INTEGER DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.5 创建 user_campaign_claims 表（用户领取记录）
CREATE TABLE public.user_campaign_claims (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id),
    campaign_id INTEGER REFERENCES public.marketing_campaigns(id),
    store_id INTEGER REFERENCES public.self_operated_stores(id),
    claim_date DATE DEFAULT CURRENT_DATE,
    claim_ip INET,
    device_id VARCHAR(100),
    is_converted BOOLEAN DEFAULT FALSE,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, campaign_id, claim_date)
);

-- 1.6 扩展现有表（增加 city_id 字段）
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);
ALTER TABLE public.store_categories ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

-- 1.7 创建索引
CREATE INDEX IF NOT EXISTS idx_cities_city_code ON public.cities(city_code);
CREATE INDEX IF NOT EXISTS idx_cities_status ON public.cities(status);
CREATE INDEX IF NOT EXISTS idx_self_operated_stores_city_id ON public.self_operated_stores(city_id);
CREATE INDEX IF NOT EXISTS idx_self_operated_stores_lng_lat ON public.self_operated_stores(lng, lat);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_city_id ON public.marketing_campaigns(city_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_user_campaign_claims_user_id ON public.user_campaign_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_user_campaign_claims_campaign_id ON public.user_campaign_claims(campaign_id);

SELECT '步骤1完成：表结构创建成功！' AS result;
