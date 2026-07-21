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
