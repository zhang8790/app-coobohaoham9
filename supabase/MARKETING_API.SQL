-- ============================================
-- 红包/实物营销工具 API（后端RPC函数）
-- 包含风控逻辑：防羊毛党、IP/设备关联检测
-- ============================================

-- ============================================
-- 1. 领取红包/实物（包含风控逻辑）
-- ============================================
create or replace function public.claim_campaign(
  p_user_id uuid,
  p_campaign_id uuid,
  p_store_id uuid,
  p_claim_type varchar(20),
  p_claim_amount numeric,
  p_referrer_id uuid default null,
  p_referrer_relation varchar(10) default null,
  p_ip_address inet default null,
  p_device_id varchar(200) default null
) returns jsonb as $$
declare
  v_campaign record;
  v_user_profile record;
  v_already_claimed int;
  v_today_count int;
  v_result jsonb;
begin
  -- 1. 检查活动是否存在且有效
  select * into v_campaign from public.marketing_campaigns
  where id = p_campaign_id and status = 'active';
  
  if not found then
    return jsonb_build_object('success', false, 'error', '活动不存在或已结束');
  end if;
  
  -- 2. 检查库存
  if v_campaign.gift_stock <= v_campaign.gift_claimed then
    return jsonb_build_object('success', false, 'error', '库存不足');
  end if;
  
  -- 3. 检查用户是否已领取（同一活动）
  select count(*) into v_already_claimed from public.user_campaign_claims
  where user_id = p_user_id and campaign_id = p_campaign_id;
  
  if v_already_claimed > 0 then
    return jsonb_build_object('success', false, 'error', '您已领取过此活动');
  end if;
  
  -- 4. 检查每日限领（单用户单店每日限领1份）
  select count(*) into v_today_count from public.user_campaign_claims
  where user_id = p_user_id
    and store_id = p_store_id
    and created_at >= current_date
    and created_at < current_date + interval '1 day';
    
  if v_today_count >= 1 then
    return jsonb_build_object('success', false, 'error', '今日已领取过，明天再来吧');
  end if;
  
  -- 5. 风控检查：IP/设备关联检测（简化版）
  if p_device_id is not null then
    select count(*) into v_today_count from public.user_campaign_claims
    where device_id = p_device_id
      and created_at >= current_date
      and created_at < current_date + interval '1 day';
      
    if v_today_count >= 3 then  -- 同一设备每日最多领取3次
      -- 记录风控日志
      insert into public.risk_control_logs (user_id, risk_type, risk_level, trigger_value, action_taken)
      values (p_user_id, 'device_match', 'high', p_device_id, 'block');
      
      return jsonb_build_object('success', false, 'error', '领取过于频繁，请明天再试');
    end if;
  end if;
  
  -- 6. 插入领取记录
  insert into public.user_campaign_claims (
    user_id, campaign_id, store_id, claim_type, claim_amount,
    referrer_id, referrer_relation, ip_address, device_id
  ) values (
    p_user_id, p_campaign_id, p_store_id, p_claim_type, p_claim_amount,
    p_referrer_id, p_referrer_relation, p_ip_address, p_device_id
  );
  
  -- 7. 更新活动库存
  update public.marketing_campaigns
  set gift_claimed = gift_claimed + 1
  where id = p_campaign_id;
  
  return jsonb_build_object('success', true, 'message', '领取成功');
end;
$$ language plpgsql security definer;

comment on function public.claim_campaign is '领取红包/实物（包含风控逻辑）';

-- ============================================
-- 2. 核销消费后激活分佣
-- ============================================
create or replace function public.activate_campaign_commission(
  p_order_id uuid,
  p_user_id uuid,
  p_store_id uuid,
  p_commission_amount numeric
) returns jsonb as $$
declare
  v_claim record;
  v_referrer_1 record;
  v_referrer_2 record;
  v_l1_amount numeric;
  v_l2_amount numeric;
begin
  -- 1. 查找对应的领取记录
  select * into v_claim from public.user_campaign_claims
  where user_id = p_user_id and store_id = p_store_id and is_activated = false
  order by created_at desc limit 1;
  
  if not found then
    return jsonb_build_object('success', false, 'error', '未找到对应的领取记录');
  end if;
  
  -- 2. 计算分佣金额（一级60%，二级40%？实际应该根据活动配置）
  v_l1_amount = p_commission_amount * 0.6;  -- 一级佣金比例（示例）
  v_l2_amount = p_commission_amount * 0.4;  -- 二级佣金比例（示例）
  
  -- 3. 插入一级分佣记录
  if v_claim.referrer_id is not null then
    insert into public.commissions (
      order_id, user_id, commission_amount, commission_type, 
      is_from_campaign, campaign_claim_id, status
    ) values (
      p_order_id, v_claim.referrer_id, v_l1_amount, 'consumption',
      true, v_claim.id, 'pending'
    );
  end if;
  
  -- 4. 插入二级分佣记录（查找一级推荐人的推荐人）
  if v_claim.referrer_id is not null then
    select * into v_referrer_1 from public.profiles where id = v_claim.referrer_id;
    
    if v_referrer_1 is not null and v_referrer_1.referrer_id is not null then
      insert into public.commissions (
        order_id, user_id, commission_amount, commission_type,
        is_from_campaign, campaign_claim_id, status
      ) values (
        p_order_id, v_referrer_1.referrer_id, v_l2_amount, 'consumption',
        true, v_claim.id, 'pending'
      );
    end if;
  end if;
  
  -- 5. 标记领取记录为已激活
  update public.user_campaign_claims
  set is_activated = true, activated_at = now(), order_id = p_order_id
  where id = v_claim.id;
  
  return jsonb_build_object('success', true, 'message', '分佣激活成功');
end;
$$ language plpgsql security definer;

comment on function public.activate_campaign_commission is '核销消费后激活分佣';

-- ============================================
-- 完成
-- ============================================
raise notice '✅ 红包/实物营销 API 创建完成！';
