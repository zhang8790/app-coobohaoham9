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
