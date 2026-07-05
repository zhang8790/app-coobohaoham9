-- ============================================
-- 步骤4：创建 RPC 函数
-- ============================================

-- 删除旧函数
DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;
DROP FUNCTION IF EXISTS public.activate_commission CASCADE;
DROP FUNCTION IF EXISTS public.get_nearby_stores CASCADE;

-- 创建 claim_campaign 函数（修复版：添加锁客逻辑）
CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id UUID,
    p_campaign_id INTEGER,
    p_store_id INTEGER,
    p_device_id VARCHAR DEFAULT NULL,
    p_referrer_id UUID DEFAULT NULL  -- 新增：推荐人ID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign RECORD;
    v_existing_claim INTEGER;
    v_daily_claims INTEGER;
    v_existing_lock INTEGER;  -- 新增：检查是否已锁客
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
    
    -- 6. 检查用户是否重复领取
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
    
    -- 9. 建立锁客关系（新增逻辑）
    -- 检查是否已经存在锁客关系
    SELECT COUNT(*) INTO v_existing_lock
    FROM public.user_store_relation
    WHERE user_id = p_user_id AND store_id = p_store_id;
    
    IF v_existing_lock = 0 THEN
        -- 不存在锁客关系，新建
        INSERT INTO public.user_store_relation (
            user_id, 
            store_id, 
            referrer_id, 
            lock_type, 
            locked_at,
            status
        ) VALUES (
            p_user_id,
            p_store_id,
            p_referrer_id,  -- 推荐人ID（可能为NULL）
            'campaign',     -- 锁客来源：活动领取
            NOW(),
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
        'locked', v_existing_lock = 0  -- 告知前端是否新建了锁客关系
    );
    
    RETURN v_result;
END;
$$;

-- 创建 activate_commission 函数
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
    
    -- 2. 检查订单状态
    IF v_order.status != 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', '订单未完成，不能激活分佣');
    END IF;
    
    -- 3. 查找分佣记录
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

-- 创建 get_nearby_stores 函数
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
        s.id AS store_id,
        s.store_name,
        s.address,
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

SELECT '步骤4完成：RPC函数创建成功！' AS result;
