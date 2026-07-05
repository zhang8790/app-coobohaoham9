-- ============================================
-- 全面系统检测 SQL（简化版）
-- 用途：检测所有表的缺失、字段缺失、RLS状态
-- 执行方式：在 Supabase SQL Editor 中一次性执行
-- ============================================

-- ============================================
-- 第一部分：检测所有表是否存在
-- ============================================

-- 1. 列出所有业务表
SELECT 
  table_name,
  CASE WHEN table_name IN (
    'profiles','stores','store_categories','products','cart_items',
    'orders','order_items','articles','merchant_applications',
    'announcements','commissions','withdrawals','refunds',
    'points_logs','user_addresses','favorites','footprints',
    'product_reviews','coupons','user_store_relation','store_staff',
    'cities','self_operated_stores','marketing_campaigns','user_campaign_claims'
  ) THEN '✅ 业务表' ELSE '❓ 其他' END as table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. 检查关键表是否存在
SELECT 
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='profiles' AND table_schema='public') THEN '❌ profiles 表不存在' ELSE '✅ profiles 表存在' END as check_1,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='stores' AND table_schema='public') THEN '❌ stores 表不存在' ELSE '✅ stores 表存在' END as check_2,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='products' AND table_schema='public') THEN '❌ products 表不存在' ELSE '✅ products 表存在' END as check_3,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='articles' AND table_schema='public') THEN '❌ articles 表不存在' ELSE '✅ articles 表存在' END as check_4,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='announcements' AND table_schema='public') THEN '❌ announcements 表不存在' ELSE '✅ announcements 表存在' END as check_5,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cities' AND table_schema='public') THEN '❌ cities 表不存在' ELSE '✅ cities 表存在' END as check_6;

-- ============================================
-- 第二部分：检测关键表的字段是否完整
-- ============================================

-- 3. 检查 profiles 表关键字段
SELECT 
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='referral_code') THEN '❌ 缺少 referral_code' ELSE '✅ referral_code 存在' END as check_1,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='invite_code') THEN '❌ 缺少 invite_code' ELSE '✅ invite_code 存在' END as check_2,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='gold_beans') THEN '❌ 缺少 gold_beans' ELSE '✅ gold_beans 存在' END as check_3,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='points') THEN '❌ 缺少 points' ELSE '✅ points 存在' END as check_4,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='balance') THEN '❌ 缺少 balance' ELSE '✅ balance 存在' END as check_5,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='merchant_status') THEN '❌ 缺少 merchant_status' ELSE '✅ merchant_status 存在' END as check_6;

-- 4. 检查 articles 表关键字段
SELECT 
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='user_id') THEN '❌ 缺少 user_id' ELSE '✅ user_id 存在' END as check_1,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='status') THEN '❌ 缺少 status' ELSE '✅ status 存在' END as check_2,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='cover_image') THEN '❌ 缺少 cover_image' ELSE '✅ cover_image 存在' END as check_3,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='is_published') THEN '❌ 缺少 is_published' ELSE '✅ is_published 存在' END as check_4,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='images') THEN '❌ 缺少 images' ELSE '✅ images 存在' END as check_5,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='tags') THEN '❌ 缺少 tags' ELSE '✅ tags 存在' END as check_6;

-- 5. 检查 stores 表字段（LBS 定位需要 lat/lng）
SELECT 
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='lat') THEN '❌ 缺少 lat（LBS定位需要）' ELSE '✅ lat 存在' END as check_1,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='lng') THEN '❌ 缺少 lng（LBS定位需要）' ELSE '✅ lng 存在' END as check_2,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='short_code') THEN '❌ 缺少 short_code' ELSE '✅ short_code 存在' END as check_3,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='is_platform') THEN '❌ 缺少 is_platform' ELSE '✅ is_platform 存在' END as check_4;

-- 6. 检查 products 表字段
SELECT 
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='mood_tags') THEN '❌ 缺少 mood_tags' ELSE '✅ mood_tags 存在' END as check_1,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='scene_tags') THEN '❌ 缺少 scene_tags' ELSE '✅ scene_tags 存在' END as check_2,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='city_id') THEN '⚠️ 缺少 city_id（区域扩展）' ELSE '✅ city_id 存在' END as check_3,
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='barcode') THEN '⚠️ 缺少 barcode（扫码上架）' ELSE '✅ barcode 存在' END as check_4;

-- ============================================
-- 第三部分：检测 RLS 是否已禁用
-- ============================================

-- 7. 检查所有表的 RLS 状态
SELECT 
  tablename as 表名,
  CASE WHEN rowsecurity = true THEN '❌ 已启用（可能阻止操作）' ELSE '✅ 已禁用（测试阶段）' END as RLS状态
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================
-- 第四部分：检测 RPC 函数是否存在
-- ============================================

-- 8. 检查关键 RPC 函数是否存在
SELECT 
  p.proname as 函数名,
  pg_get_function_arguments(p.oid) as 参数
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 检查是否缺少关键函数
SELECT 
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='get_nearby_products') 
    THEN '❌ 缺少 get_nearby_products 函数（探索页距离推荐需要）' 
    ELSE '✅ get_nearby_products 存在' END as check_1,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='claim_campaign') 
    THEN '⚠️ 缺少 claim_campaign 函数（红包领取需要）' 
    ELSE '✅ claim_campaign 存在' END as check_2,
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='public' AND p.proname='activate_commission') 
    THEN '⚠️ 缺少 activate_commission 函数（分佣激活需要）' 
    ELSE '✅ activate_commission 存在' END as check_3;

-- ============================================
-- 第五部分：检测测试数据是否完整
-- ============================================

-- 9. 检查各表数据量（逐表查询，避免语法错误）
SELECT 'profiles' as 表名, COUNT(*) as 数据量 FROM profiles;

SELECT 'stores' as 表名, COUNT(*) as 数据量 FROM stores;

SELECT 'products' as 表名, COUNT(*) as 数据量 FROM products;

SELECT 'articles' as 表名, COUNT(*) as 数据量 FROM articles;

SELECT 'announcements' as 表名, COUNT(*) as 数据量 FROM announcements;

SELECT 'cities' as 表名, COUNT(*) as 数据量 FROM cities;

SELECT 'self_operated_stores' as 表名, COUNT(*) as 数据量 FROM self_operated_stores;

SELECT 'marketing_campaigns' as 表名, COUNT(*) as 数据量 FROM marketing_campaigns;

-- 10. 检查门店是否有经纬度（LBS 定位需要）
-- 先检查 lat 字段是否存在
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stores' AND column_name='lat') THEN
    EXECUTE 'SELECT id, name, 
      CASE WHEN lat IS NULL OR lng IS NULL THEN ''❌ 缺少经纬度'' ELSE ''✅ 有经纬度'' END as 状态
      FROM stores LIMIT 10';
  ELSE
    RAISE NOTICE 'stores 表缺少 lat 字段，跳过经纬度检查';
  END IF;
END $$;

-- ============================================
-- 第六部分：自动修复常见问题
-- ============================================

-- 11. 自动禁用所有表的 RLS（解决 403 错误）
DO $$ 
DECLARE 
  t text;
BEGIN 
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
  LOOP 
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t); 
    RAISE NOTICE '已禁用 % 表的 RLS', t;
  END LOOP; 
END $$;

-- 12. 为 articles 表添加缺失字段（如果不存在）
ALTER TABLE articles 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published')),
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS images TEXT[],
  ADD COLUMN IF NOT EXISTS tags TEXT[];

-- 13. 为 profiles 表添加缺失字段（如果不存在）
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invite_code TEXT,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS total_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_commission NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gold_beans INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_status TEXT DEFAULT 'none' CHECK (merchant_status IN ('none','pending','approved','rejected'));

-- 14. 为 stores 表添加经纬度字段（如果不存在）
ALTER TABLE stores 
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- 15. 刷新 schema cache
NOTIFY pgrest, 'reload schema';

-- ============================================
-- 第七部分：验证修复结果
-- ============================================

-- 16. 验证修复结果
SELECT '✅ 检测完成！请查看上面的结果' as 结果;

-- 查看 articles 表现在的所有字段
SELECT 'articles 表现在字段' as check_item, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'articles'
ORDER BY ordinal_position;

-- 查看 profiles 表现在的所有字段
SELECT 'profiles 表现在字段' as check_item, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 查看所有表的 RLS 状态（应该全部显示"已禁用"）
SELECT 
  tablename as 表名,
  CASE WHEN rowsecurity = true THEN '❌ 已启用' ELSE '✅ 已禁用' END as RLS状态
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
