-- ============================================
-- 来店有喜 - 区域扩展 + 营销功能 - 一键部署SQL
-- 执行顺序：删除旧表 → 创建新表 → 插入测试数据 → 创建函数
-- ============================================

-- 步骤1：删除可能存在的旧表（避免冲突）
DROP TABLE IF EXISTS public.user_campaign_claims CASCADE;
DROP TABLE IF EXISTS public.marketing_campaigns CASCADE;
DROP TABLE IF EXISTS public.self_operated_stores CASCADE;
DROP TABLE IF EXISTS public.cities CASCADE;
DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;
DROP FUNCTION IF EXISTS public.activate_commission CASCADE;
DROP FUNCTION IF EXISTS public.get_nearby_stores CASCADE;

-- 步骤2：创建 cities 表（城市信息）
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

-- 步骤3：创建 self_operated_stores 表（自营门店）
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

-- 步骤4：创建 marketing_campaigns 表（营销活动）
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

-- 步骤5：创建 user_campaign_claims 表（用户领取记录）
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

-- 步骤6：扩展现有表（增加 city_id 字段）
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

-- 步骤7：创建索引
CREATE INDEX IF NOT EXISTS idx_cities_city_code ON public.cities(city_code);
CREATE INDEX IF NOT EXISTS idx_cities_status ON public.cities(status);
CREATE INDEX IF NOT EXISTS idx_self_operated_stores_city_id ON public.self_operated_stores(city_id);
CREATE INDEX IF NOT EXISTS idx_self_operated_stores_lng_lat ON public.self_operated_stores(lng, lat);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_city_id ON public.marketing_campaigns(city_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_user_campaign_claims_user_id ON public.user_campaign_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_user_campaign_claims_campaign_id ON public.user_campaign_claims(campaign_id);

-- 步骤8：插入测试数据 - 城市
INSERT INTO public.cities (city_code, city_name, province, lng, lat, status) VALUES
('SH', '上海', '上海市', 121.4737, 31.2304, 'active'),
('BJ', '北京', '北京市', 116.4074, 39.9042, 'active'),
('GZ', '广州', '广东省', 113.2644, 23.1291, 'active'),
('SZ', '深圳', '广东省', 114.0579, 22.5431, 'active'),
('CD', '成都', '四川省', 104.0665, 30.5728, 'active');

-- 步骤9：插入测试数据 - 自营门店
INSERT INTO public.self_operated_stores (store_code, store_name, city_id, address, lng, lat, phone, business_hours, status) VALUES
('SH001', '来店有喜·上海旗舰店', 1, '上海市浦东新区陆家嘴西路168号', 121.4997, 31.2397, '400-888-8888', '10:00-22:00', 'active'),
('SH002', '来店有喜·上海徐家汇店', 1, '上海市徐汇区肇嘉浜路1111号', 121.4365, 31.2108, '400-888-8888', '10:00-22:00', 'active'),
('BJ001', '来店有喜·北京三里屯店', 2, '北京市朝阳区三里屯路19号', 116.4554, 39.9358, '400-888-8888', '10:00-22:00', 'active'),
('GZ001', '来店有喜·广州天河店', 3, '广州市天河区天河路385号', 113.3290, 23.1352, '400-888-8888', '10:00-22:00', 'active');

-- 步骤10：插入测试数据 - 营销活动
INSERT INTO public.marketing_campaigns (campaign_code, campaign_name, campaign_type, city_id, store_id, gift_name, gift_value, commission_rate, daily_limit, total_limit, start_date, end_date, status) VALUES
('SH_RED_001', '上海新人红包活动', 'red_packet', 1, 1, '新人红包', 8.88, 5.00, 100, 1000, '2026-07-01', '2026-12-31', 'active'),
('SH_PHYSICAL_001', '上海精美礼品活动', 'physical', 1, 1, '精美保温杯', 39.90, 8.00, 50, 500, '2026-07-01', '2026-12-31', 'active'),
('BJ_RED_001', '北京新人红包活动', 'red_packet', 2, 3, '新人红包', 6.66, 5.00, 100, 1000, '2026-07-01', '2026-12-31', 'active');

-- 步骤11：创建 RPC 函数 - claim_campaign（领取红包/实物）
CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id UUID,
    p_campaign_id INTEGER,
    p_store_id INTEGER,
    p_device_id VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign RECORD;
    v_existing_claim INTEGER;
    v_daily_claims INTEGER;
    v_result JSONB;
BEGIN
    -- 1. 获取活动信息
    SELECT * INTO v_campaign FROM public.marketing_campaigns WHERE id = p_campaign_id;
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
    WHERE campaign_id = p_campaign_id AND claim_date = CURRENT_DATE;
    IF v_daily_claims >= v_campaign.daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '今日已领完，请明天再来');
    END IF;
    
    -- 6. 检查用户是否重复领取（同一活动每天只能领一次）
    SELECT COUNT(*) INTO v_existing_claim 
    FROM public.user_campaign_claims 
    WHERE user_id = p_user_id AND campaign_id = p_campaign_id AND claim_date = CURRENT_DATE;
    IF v_existing_claim > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '您今天已经领过这个奖励了');
    END IF;
    
    -- 7. 记录领取
    INSERT INTO public.user_campaign_claims (user_id, campaign_id, store_id, device_id)
    VALUES (p_user_id, p_campaign_id, p_store_id, p_device_id);
    
    -- 8. 更新领取计数
    UPDATE public.marketing_campaigns 
    SET claimed_count = claimed_count + 1 
    WHERE id = p_campaign_id;
    
    -- 9. 返回成功
    v_result := jsonb_build_object(
        'success', true,
        'campaign_type', v_campaign.campaign_type,
        'gift_name', v_campaign.gift_name,
        'gift_value', v_campaign.gift_value,
        'commission_rate', v_campaign.commission_rate
    );
    
    RETURN v_result;
END;
$$;

-- 步骤12：创建 RPC 函数 - activate_commission（激活分佣）
CREATE OR REPLACE FUNCTION public.activate_commission(
    p_user_id UUID,
    p_order_id INTEGER,
    p_store_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_commission RECORD;
    v_result JSONB;
BEGIN
    -- 1. 获取订单信息
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND user_id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '订单不存在');
    END IF;
    
    -- 2. 检查订单状态（必须是已完成）
    IF v_order.status != 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', '订单未完成，不能激活分佣');
    END IF;
    
    -- 3. 查找对应的分佣记录
    SELECT * INTO v_commission 
    FROM public.commissions 
    WHERE user_id = p_user_id AND order_id = p_order_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '没有待激活的分佣记录');
    END IF;
    
    -- 4. 激活分佣
    UPDATE public.commissions 
    SET status = 'active', activated_at = NOW()
    WHERE id = v_commission.id;
    
    -- 5. 返回成功
    v_result := jsonb_build_object(
        'success', true,
        'commission_id', v_commission.id,
        'amount', v_commission.amount
    );
    
    RETURN v_result;
END;
$$;

-- 步骤13：创建 RPC 函数 - get_nearby_stores（获取附近门店）
CREATE OR REPLACE FUNCTION public.get_nearby_stores(
    p_lng DECIMAL,
    p_lat DECIMAL,
    p_radius INTEGER DEFAULT 5000
)
RETURNS TABLE (
    store_id INTEGER,
    store_name VARCHAR,
    address TEXT,
    distance DECIMAL,
    lng DECIMAL,
    lat DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.store_name,
        s.address,
        -- 计算距离（米）
        6371000 * acos(
            cos(radians(p_lat)) * cos(radians(s.lat)) * 
            cos(radians(s.lng) - radians(p_lng)) + 
            sin(radians(p_lat)) * sin(radians(s.lat))
        ) AS distance,
        s.lng,
        s.lat
    FROM public.self_operated_stores s
    WHERE s.status = 'active'
    AND 6371000 * acos(
        cos(radians(p_lat)) * cos(radians(s.lat)) * 
        cos(radians(s.lng) - radians(p_lng)) + 
        sin(radians(p_lat)) * sin(radians(s.lat))
    ) <= p_radius
    ORDER BY distance
    LIMIT 20;
END;
$$;

-- 步骤14：禁用 RLS（测试阶段）
ALTER TABLE public.cities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_operated_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_campaign_claims DISABLE ROW LEVEL SECURITY;

-- 完成提示
SELECT '区域扩展 + 营销功能部署完成！' AS result;
