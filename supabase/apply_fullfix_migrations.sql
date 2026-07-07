-- ============================================================
-- 来店有喜 V3 · 全面修复迁移（00045 ~ 00048）
-- ⚠️ 重要：Supabase SQL Editor 会按 ; 分割执行，
--    所以每段必须只含"简单 DDL 语句"或"单个完整函数"
--    绝对不能有 DO $$ / CREATE FUNCTION 以外的复合语句块！
-- ============================================================

-- ════════════════════════════════════════════════════════
-- 【第 1 段】00045 openid + 00046 删旧外键 + 改类型
-- 复制下面这段 → 新建查询标签页 → 粘贴 → Run
-- ════════════════════════════════════════════════════════

-- 00045 profiles 补 openid 列（幂等）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS openid text;
COMMENT ON COLUMN public.profiles.openid IS '微信 openid，用于微信支付 JSAPI / 商家转账到零钱发放';

-- 00046-1 删除错误的旧外键（指向 self_operated_stores 的那个）
ALTER TABLE public.user_campaign_claims DROP CONSTRAINT IF EXISTS user_campaign_claims_store_id_fkey;

-- 00046-2 store_id 类型从 INTEGER 改为 UUID
-- 注意：如果之前已经跑过改成功了，这句会报错（正常，忽略即可）
ALTER TABLE public.user_campaign_claims
  ALTER COLUMN store_id TYPE UUID USING NULL;

SELECT '✅ 第1段完成：openid已加、旧外键已删、store_id已改UUID' AS result;


-- ════════════════════════════════════════════════════════
-- 【第 2 段】00046 建新外键 + 防重约束
-- 复制下面这段 → 新建查询标签页 → 粘贴 → Run
-- （必须在第1段成功后执行！）
-- ════════════════════════════════════════════════════════

-- 00046-3 重建外键 → stores(id)（两边都是 UUID 了）
ALTER TABLE public.user_campaign_claims
  ADD CONSTRAINT user_campaign_claims_store_id_fkey
  FOREIGN KEY (store_id) REFERENCES public.stores(id)
  ON DELETE SET NULL;

-- 00046-4 每日防重唯一约束（幂等：先删后建）
ALTER TABLE public.user_campaign_claims
  DROP CONSTRAINT IF EXISTS user_campaign_claims_user_campaign_date_uniq;

ALTER TABLE public.user_campaign_claims
  ADD CONSTRAINT user_campaign_claims_user_campaign_date_uniq
  UNIQUE (user_id, campaign_id, claim_date);

SELECT '✅ 第2段完成：新外键→stores(id)、防重约束 OK' AS result;


-- ════════════════════════════════════════════════════════
-- 【第 3 段】00046 claim_campaign 函数（单独一段！）
-- 复制下面这段 → 新建查询标签页 → 粘贴 → Run
-- ════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.claim_campaign CASCADE;

CREATE OR REPLACE FUNCTION public.claim_campaign(
    p_user_id      UUID,
    p_campaign_id  INTEGER,
    p_store_id     TEXT DEFAULT NULL,
    p_device_id    VARCHAR DEFAULT NULL,
    p_referrer_id  UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status         TEXT;
    v_start_date     DATE;
    v_end_date       DATE;
    v_claimed_count  INTEGER;
    v_total_limit    INTEGER;
    v_daily_limit    INTEGER;
    v_campaign_type  TEXT;
    v_gift_name      TEXT;
    v_gift_value     NUMERIC;
    v_commission_rate NUMERIC;
    v_existing_claim INTEGER;
    v_daily_claims   INTEGER;
    v_existing_lock  INTEGER;
    v_claim_id       UUID;
    v_result         JSONB;
BEGIN
    -- 取活动信息（逐字段 INTO 标量变量，避免 RECORD 歧义触发 42P01）
    SELECT status, start_date, end_date, claimed_count, total_limit,
           daily_limit, campaign_type, gift_name, gift_value, commission_rate
    INTO v_status, v_start_date, v_end_date, v_claimed_count, v_total_limit,
         v_daily_limit, v_campaign_type, v_gift_name, v_gift_value, v_commission_rate
    FROM public.marketing_campaigns
    WHERE id = p_campaign_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', '活动不存在');
    END IF;

    IF v_status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已结束');
    END IF;

    IF CURRENT_DATE < v_start_date OR CURRENT_DATE > v_end_date THEN
        RETURN jsonb_build_object('success', false, 'error', '活动未开始或已结束');
    END IF;

    IF v_claimed_count >= v_total_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '活动已领完');
    END IF;

    SELECT COUNT(*) INTO v_daily_claims
    FROM public.user_campaign_claims
    WHERE campaign_id = p_campaign_id AND claim_date = CURRENT_DATE;

    IF v_daily_claims >= v_daily_limit THEN
        RETURN jsonb_build_object('success', false, 'error', '今日已领完，请明天再来');
    END IF;

    SELECT COUNT(*) INTO v_existing_claim
    FROM public.user_campaign_claims
    WHERE user_id = p_user_id AND campaign_id = p_campaign_id AND claim_date = CURRENT_DATE;

    IF v_existing_claim > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', '您今天已经领过这个奖励了');
    END IF;

    -- 记录领取（store_id 已是 UUID 类型，p_store_id 直接 ::UUID）
    INSERT INTO public.user_campaign_claims (
        user_id, campaign_id, store_id, device_id, claimed_at
    ) VALUES (
        p_user_id, p_campaign_id,
        CASE WHEN p_store_id IS NOT NULL THEN p_store_id::UUID ELSE NULL END,
        p_device_id, NOW()
    )
    RETURNING id INTO v_claim_id;

    UPDATE public.marketing_campaigns
    SET claimed_count = claimed_count + 1
    WHERE id = p_campaign_id;

    -- 建立锁客关系（user_store_relation.store_id 也是 UUID）
    IF p_store_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_existing_lock
        FROM public.user_store_relation
        WHERE user_id = p_user_id AND store_id = p_store_id::UUID;

        IF v_existing_lock = 0 THEN
            INSERT INTO public.user_store_relation (
                user_id, store_id, referrer_id, lock_type, locked_at, expires_at, status
            ) VALUES (
                p_user_id, p_store_id::UUID, p_referrer_id, 'campaign',
                NOW(), NOW() + INTERVAL '180 days', 'active'
            );
        END IF;
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'claim_id', v_claim_id,
        'campaign_type', v_campaign_type,
        'gift_name', v_gift_name,
        'gift_value', v_gift_value,
        'commission_rate', v_commission_rate,
        'locked', v_existing_lock = 0
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    DECLARE
        v_err text := SQLERRM;
    BEGIN
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
  '领取营销活动奖励（含锁客）- 2026-07-07修复：外键→stores(UUID)，返回claim_id';

SELECT '✅ 第3段完成：claim_campaign 函数已重建' AS result;


-- ════════════════════════════════════════════════════════
-- 【第 4 段】00047 redpacket_payouts 加固（纯 DDL）
-- 复制下面这段 → 新建查询标签页 → 粘贴 → Run
-- ════════════════════════════════════════════════════════

ALTER TABLE public.redpacket_payouts
  DROP CONSTRAINT IF EXISTS redpacket_payouts_status_check;

ALTER TABLE public.redpacket_payouts
  ADD CONSTRAINT redpacket_payouts_status_check
  CHECK (status IN ('pending_manual','processing','accepted','success','failed'));

ALTER TABLE public.redpacket_payouts
  DROP CONSTRAINT IF EXISTS redpacket_payouts_user_campaign_uniq;

ALTER TABLE public.redpacket_payouts
  ADD CONSTRAINT redpacket_payouts_user_campaign_uniq
  UNIQUE (user_id, campaign_id);

COMMENT ON COLUMN public.redpacket_payouts.status IS
  'pending_manual=待启用/processing=受理中/accepted=微信已受理(异步到账)/success=已确认到账/failed=失败';

SELECT '✅ 第4段完成：redpacket_payouts 已加固' AS result;


-- ════════════════════════════════════════════════════════
-- 【第 5 段】00048 锁客脱敏函数（单独一段！）
-- 复制下面这段 → 新建查询标签页 → 粘贴 → Run
-- ════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_store_locked_members(
    p_store_id UUID
)
RETURNS TABLE (
    user_id       UUID,
    nickname      TEXT,
    avatar_url    TEXT,
    phone_masked  TEXT,
    phone_last4   TEXT,
    locked_at     TIMESTAMPTZ,
    lock_type     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 仅允许店主查本店锁客名单
    IF NOT EXISTS (
        SELECT 1 FROM public.stores
        WHERE id = p_store_id AND owner_id = auth.uid()
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
            ELSE substring(p.phone, 1, 3) || '****' || substring(p.phone, length(p.phone)-3, 4)
        END,
        CASE
            WHEN p.phone IS NULL OR length(p.phone) < 4 THEN ''
            ELSE substring(p.phone, length(p.phone)-3, 4)
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

COMMENT ON FUNCTION public.get_store_locked_members IS
  '商家锁客名单（脱敏手机号，仅店主可查）';

SELECT '✅ 第5段完成：get_store_locked_members 已创建' AS result;
