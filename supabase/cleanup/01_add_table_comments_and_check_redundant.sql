/*
 ========================================
 来店有喜 - 数据库表整理脚本
 功能：
 1. 列出所有表
 2. 给表添加中文备注
 3. 检查冗余表
 4. 生成删除冗余表的 SQL
 ========================================
*/

-- ===========================================
-- 第一步：查看所有表（带备注）
-- ===========================================

SELECT 
  t.table_name as "表名（英文）",
  obj_description(c.oid) as "表备注（中文）",
  (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as "字段数"
FROM information_schema.tables t
LEFT JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- ===========================================
-- 第二步：给所有表添加/更新中文备注
-- ===========================================

-- 用户相关表
COMMENT ON TABLE profiles IS '用户档案表 - 存储用户基本信息、会员段位、积分、余额、邀请关系';
COMMENT ON TABLE user_addresses IS '收货地址表 - 用户收货地址管理';
COMMENT ON TABLE store_staff IS '门店员工表 - 门店员工管理、权限控制';

-- 门店相关表
COMMENT ON TABLE stores IS '门店表 - 门店基本信息、营业设置、佣金比例';
COMMENT ON TABLE store_categories IS '门店分类表 - 门店商品分类';

-- 商品相关表
COMMENT ON TABLE products IS '商品表 - 商品信息、库存、价格、标签';

-- 订单相关表
COMMENT ON TABLE cart_items IS '购物车表 - 用户购物车';
COMMENT ON TABLE orders IS '订单表 - 订单主表';
COMMENT ON TABLE order_items IS '订单商品表 - 订单商品明细';

-- 营销相关表
COMMENT ON TABLE user_store_relation IS '锁客关系表 - 用户与门店的锁定关系（用于分佣）';
COMMENT ON TABLE commissions IS '佣金记录表 - 佣金分配记录';
COMMENT ON TABLE withdrawals IS '提现申请表 - 用户/商家提现申请';
COMMENT ON TABLE refunds IS '退款记录表 - 订单退款';
COMMENT ON TABLE coupons IS '优惠券表 - 用户优惠券';
COMMENT ON TABLE marketing_campaigns IS '营销活动表 - 营销活动配置（红包、物品领取）';
COMMENT ON TABLE user_campaign_claims IS '用户活动领取表 - 记录用户领取营销活动奖励';

-- 内容相关表
COMMENT ON TABLE articles IS '文章表 - 文章/笔记管理';
COMMENT ON TABLE announcements IS '公告表 - 系统公告、活动公告';
COMMENT ON TABLE product_reviews IS '商品评价表 - 商品评价';
COMMENT ON TABLE favorites IS '商品收藏表 - 用户收藏商品';
COMMENT ON TABLE footprints IS '浏览足迹表 - 用户浏览商品足迹';

-- 其他表
COMMENT ON TABLE points_logs IS '积分日志表 - 用户积分变动日志';
COMMENT ON TABLE cities IS '城市表 - 城市列表（用于 LBS 服务）';
COMMENT ON TABLE order_risk_logs IS '订单风险日志表 - 订单风险风控日志';

-- 可能未使用的表（需要确认）
-- COMMENT ON TABLE self_operated_stores IS '自营门店表 - 自营门店配置（当前未使用）';
-- COMMENT ON TABLE referrals IS '推荐关系表 - 推荐关系（已被 profiles.invited_by 替代，未使用）';
-- COMMENT ON TABLE user_staff_bindings IS '用户员工绑定表 - 用户员工绑定（已被 store_staff 替代，未使用）';
-- COMMENT ON TABLE rank_configs IS '段位配置表 - 段位动态配置（当前未使用，硬编码）';
-- COMMENT ON TABLE platform_configs IS '平台配置表 - 平台参数动态配置（当前未使用，硬编码）';

-- ===========================================
-- 第三步：检查冗余表（未使用或有替代）
-- ===========================================

-- 检查哪些表在代码中没有引用
-- 以下是根据代码分析得出的未使用表：

SELECT 'self_operated_stores' as "可能冗余的表", 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'self_operated_stores') 
    THEN '存在' 
    ELSE '不存在' 
  END as "状态",
  '未使用 - 代码中没有引用' as "原因";

SELECT 'referrals' as "可能冗余的表", 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referrals') 
    THEN '存在' 
    ELSE '不存在' 
  END as "状态",
  '未使用 - 已被 profiles.invited_by 替代' as "原因";

SELECT 'user_staff_bindings' as "可能冗余的表", 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_staff_bindings') 
    THEN '存在' 
    ELSE '不存在' 
  END as "状态",
  '未使用 - 已被 store_staff 替代' as "原因";

SELECT 'rank_configs' as "可能冗余的表", 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rank_configs') 
    THEN '存在' 
    ELSE '不存在' 
  END as "状态",
  '未使用 - 段位配置硬编码在代码中' as "原因";

SELECT 'platform_configs' as "可能冗余的表", 
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_configs') 
    THEN '存在' 
    ELSE '不存在' 
  END as "状态",
  '未使用 - 平台配置硬编码在代码中' as "原因";

-- ===========================================
-- 第四步：生成删除冗余表的 SQL（谨慎执行！）
-- ===========================================

-- ⚠️ 警告：以下 SQL 会删除表，请在确认后执行！
-- 建议先备份数据，或者在测试环境验证

/*
-- 删除未使用的表（如果存在）
DROP TABLE IF EXISTS self_operated_stores;
DROP TABLE IF EXISTS referrals;
DROP TABLE IF EXISTS user_staff_bindings;
DROP TABLE IF EXISTS rank_configs;
DROP TABLE IF EXISTS platform_configs;

-- 注意：order_risk_logs 表部分使用，建议保留
-- 如果确定不使用，可以删除：
-- DROP TABLE IF EXISTS order_risk_logs;
*/

-- ===========================================
-- 第五步：查看每个表的记录数（帮助判断是否有数据）
-- ===========================================

DO $$
DECLARE
  t record;
  cnt bigint;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I', t.table_name) INTO cnt;
      RAISE NOTICE '表 %: % 条记录', t.table_name, cnt;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '表 %: 无法计数（可能不存在或权限问题）', t.table_name;
    END;
  END LOOP;
END $$;

-- ===========================================
-- 第六步：清理重复的 SQL 迁移文件（在本地执行）
-- ===========================================

-- 以下是在项目目录中需要清理的重复 SQL 文件：
-- 这些文件定义了相同的表结构，应该只保留 supabase/migrations/ 目录下的文件

/*
需要清理的重复 SQL 文件（保留 migrations/ 目录，删除其他）：
1. supabase/ALL_IN_ONE_SETUP.sql - 已被 migrations/ 替代
2. supabase/COMPLETE_INIT.SQL - 已被 migrations/ 替代
3. supabase/Step1_Create_Tables.sql - 已被 migrations/ 替代
4. supabase/Step2_Insert_Cities.sql - 已被 migrations/ 替代
5. supabase/Step3_Insert_Stores_Campaigns.sql - 已被 migrations/ 替代
6. supabase/Step4_Create_Functions.sql - 已被 migrations/ 替代
7. supabase/Step5_Disable_RLS.sql - 已被 migrations/ 替代
8. supabase/cloud_init.sql - 已被 migrations/ 替代
9. supabase/complete_init_2026-07-04.sql - 已被 migrations/ 替代
10. supabase/complete_patch.sql - 已被 migrations/ 替代
11. supabase/create_test_user_2026-07-04.sql - 测试文件，可删除
12. supabase/diagnose_2026-07-04.sql - 诊断文件，可删除
13. supabase/fix_all_issues_2026-07-04.sql - 已被 migrations/ 替代
14. supabase/fix_missing_fields_2026-07-04.sql - 已被 migrations/ 替代
15. supabase/fix_orders_table_2026-07-04.sql - 已被 migrations/ 替代
16. supabase/fix_payment_method_enum.sql - 已被 migrations/ 替代
17. supabase/Fix_*.sql - 已被 migrations/ 替代
18. supabase/Add_*.sql - 已被 migrations/ 替代
19. supabase/Markething_API.SQL - 已被 migrations/ 替代
20. supabase/REGIONAL_EXTENSION.SQL - 已被 migrations/ 替代
21. supabase/RPC_Get_Nearby_Products.sql - 已被 migrations/ 替代
22. supabase/SYSTEM_CHECK_SIMPLE.sql - 诊断文件，可删除
23. supabase/FULL_SYSTEM_CHECK.SQL - 诊断文件，可删除

建议操作：
1. 确认 supabase/migrations/ 目录下的迁移文件完整
2. 删除上述重复 SQL 文件
3. 保留 supabase/migrations/ 目录作为唯一的数据库定义来源
*/

-- ===========================================
-- 完成！
-- ===========================================

SELECT '✅ 数据库表整理脚本执行完成！' as "状态";
SELECT '请查看上方的表清单和备注，确认后执行删除冗余表的 SQL' as "下一步";
