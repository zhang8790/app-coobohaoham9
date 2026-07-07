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
