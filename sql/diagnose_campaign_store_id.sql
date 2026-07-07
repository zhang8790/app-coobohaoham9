-- ============================================
-- 检查并修复营销活动 store_id 数据
-- 用途：解决 "领取失败：门店信息异常" 问题
-- 执行位置：Supabase Dashboard → SQL Editor
-- ============================================

-- ──────────────────────────────────────
-- 1) 诊断：查看当前 marketing_campaigns 的 store_id 状况
-- ──────────────────────────────────────
SELECT
    id,
    campaign_name,
    campaign_type,
    store_id,
    pg_typeof(store_id) AS store_id_type,
    CASE
        WHEN store_id IS NULL THEN 'NULL（无门店关联）'
        WHEN store_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN '✅ 合法UUID'
        ELSE '❌ 非法格式: ' || store_id::text
    END AS store_id_status
FROM marketing_campaigns
ORDER BY created_at DESC
LIMIT 20;

-- ──────────────────────────────────────
-- 2) 查看 user_campaign_claims 表的 store_id 列类型
--    （确认 00046 迁移是否已应用）
-- ──────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_campaign_claims'
  AND column_name = 'store_id';

-- ──────────────────────────────────────
-- 3) 修复：将非法 store_id 清空为 NULL
--     （只影响非 UUID 格式的脏数据）
--     ⚠️ 如果 store_id 是整数类型，此语句会报错，
--        说明需要先跑 00046 迁移
-- ──────────────────────────────────────
-- UPDATE marketing_campaigns
-- SET store_id = NULL
-- WHERE store_id IS NOT NULL
--   AND store_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 取消上面 UPDATE 的注释执行即可修复。
-- 或者用下面的方式逐条指定：
-- UPDATE marketing_campaigns SET store_id = NULL WHERE id = <具体的活动ID>;

-- ──────────────────────────────────────
-- 4) 可选：如果需要给某个活动绑定正确的门店
--     先查出商家对应的 stores.id (UUID)
-- ──────────────────────────────────────
-- SELECT id, name, owner_id FROM stores LIMIT 10;
-- UPDATE marketing_campaigns SET store_id = '<正确的stores.uuid>' WHERE id = <活动ID>;
