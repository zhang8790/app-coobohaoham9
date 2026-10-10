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
