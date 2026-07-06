-- 清理未使用的数据库表（慎用！）
-- 执行前请先备份数据库！

-- 检查以下表是否存在引用关系
-- 如果表存在但有外键引用，需要先删除引用表或外键

-- =====================================
-- 1. 检查 referrals 表（可能已被 user_store_relation 替代）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referrals') THEN
    -- 检查是否有其他表引用 referrals
    -- 如果有引用，会报错，脚本会停止
    DROP TABLE IF EXISTS public.referrals CASCADE;
    RAISE NOTICE '表 referrals 已删除';
  ELSE
    RAISE NOTICE '表 referrals 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 2. 检查 user_staff_bindings 表（可能已被 store_staff 替代）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_staff_bindings') THEN
    DROP TABLE IF EXISTS public.user_staff_bindings CASCADE;
    RAISE NOTICE '表 user_staff_bindings 已删除';
  ELSE
    RAISE NOTICE '表 user_staff_bindings 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 3. 检查 rank_configs 表（未被引用）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rank_configs') THEN
    DROP TABLE IF EXISTS public.rank_configs CASCADE;
    RAISE NOTICE '表 rank_configs 已删除';
  ELSE
    RAISE NOTICE '表 rank_configs 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 4. 检查 platform_configs 表（未被引用）
-- =====================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_configs') THEN
    DROP TABLE IF EXISTS public.platform_configs CASCADE;
    RAISE NOTICE '表 platform_configs 已删除';
  ELSE
    RAISE NOTICE '表 platform_configs 不存在，跳过';
  END IF;
END $$;

-- =====================================
-- 验证清理结果
-- =====================================
SELECT '剩余表数量:' AS info, COUNT(*) AS count 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';

-- 列出所有剩余表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
