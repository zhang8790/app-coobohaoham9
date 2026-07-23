-- =======================================
-- 来店有喜 - 安全的表备注添加脚本
-- 只给存在的表添加备注，避免因表不存在报错
-- 执行方式：在 Supabase Dashboard 的 SQL Editor 中运行
-- =======================================

DO $$
DECLARE
  t record;
  table_exists boolean;
BEGIN
  -- 1. profiles - 用户档案表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE profiles IS '用户档案表 - 存储用户基本信息、会员段位、积分、余额、邀请关系';
    RAISE NOTICE '✅ 已添加备注：profiles';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：profiles';
  END IF;

  -- 2. stores - 门店表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE stores IS '门店表 - 普通自营门店基本信息、营业设置、佣金比例';
    RAISE NOTICE '✅ 已添加备注：stores';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：stores';
  END IF;

  -- 3. store_categories - 门店分类表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_categories') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE store_categories IS '门店分类表 - 门店商品分类';
    RAISE NOTICE '✅ 已添加备注：store_categories';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：store_categories';
  END IF;

  -- 4. products - 商品表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE products IS '商品表 - 商品信息、库存、价格、标签';
    RAISE NOTICE '✅ 已添加备注：products';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：products';
  END IF;

  -- 5. cart_items - 购物车表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cart_items') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE cart_items IS '购物车表 - 用户购物车';
    RAISE NOTICE '✅ 已添加备注：cart_items';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：cart_items';
  END IF;

  -- 6. orders - 订单表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE orders IS '订单表 - 订单主表';
    RAISE NOTICE '✅ 已添加备注：orders';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：orders';
  END IF;

  -- 7. order_items - 订单商品表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE order_items IS '订单商品表 - 订单商品明细';
    RAISE NOTICE '✅ 已添加备注：order_items';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：order_items';
  END IF;

  -- 8. user_store_relation - 锁客关系表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_store_relation') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE user_store_relation IS '锁客关系表 - 用户与门店的锁定关系（用于分佣）';
    RAISE NOTICE '✅ 已添加备注：user_store_relation';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：user_store_relation';
  END IF;

  -- 9. commissions - 佣金记录表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'commissions') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE commissions IS '佣金记录表 - 佣金分配记录';
    RAISE NOTICE '✅ 已添加备注：commissions';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：commissions';
  END IF;

  -- 10. withdrawals - 提现申请表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'withdrawals') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE withdrawals IS '提现申请表 - 用户/商家提现申请';
    RAISE NOTICE '✅ 已添加备注：withdrawals';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：withdrawals';
  END IF;

  -- 11. refunds - 退款记录表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'refunds') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE refunds IS '退款记录表 - 订单退款';
    RAISE NOTICE '✅ 已添加备注：refunds';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：refunds';
  END IF;

  -- 12. coupons - 优惠券表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupons') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE coupons IS '优惠券表 - 用户优惠券';
    RAISE NOTICE '✅ 已添加备注：coupons';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：coupons（将在下一步创建）';
  END IF;

  -- 13. articles - 文章表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'articles') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE articles IS '文章表 - 文章/笔记管理';
    RAISE NOTICE '✅ 已添加备注：articles';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：articles';
  END IF;

  -- 14. announcements - 公告表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'announcements') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE announcements IS '公告表 - 系统公告、活动公告';
    RAISE NOTICE '✅ 已添加备注：announcements';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：announcements';
  END IF;

  -- 15. product_reviews - 商品评价表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_reviews') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE product_reviews IS '商品评价表 - 商品评价';
    RAISE NOTICE '✅ 已添加备注：product_reviews';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：product_reviews';
  END IF;

  -- 16. favorites - 商品收藏表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'favorites') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE favorites IS '商品收藏表 - 用户收藏商品';
    RAISE NOTICE '✅ 已添加备注：favorites';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：favorites';
  END IF;

  -- 17. footprints - 浏览足迹表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'footprints') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE footprints IS '浏览足迹表 - 用户浏览商品足迹';
    RAISE NOTICE '✅ 已添加备注：footprints';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：footprints';
  END IF;

  -- 18. points_logs - 积分日志表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'points_logs') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE points_logs IS '积分日志表 - 用户积分变动日志';
    RAISE NOTICE '✅ 已添加备注：points_logs';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：points_logs';
  END IF;

  -- 19. user_addresses - 收货地址表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_addresses') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE user_addresses IS '收货地址表 - 用户收货地址管理';
    RAISE NOTICE '✅ 已添加备注：user_addresses';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：user_addresses';
  END IF;

  -- 20. store_staff - 门店员工表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_staff') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE store_staff IS '门店员工表 - 门店员工管理、权限控制';
    RAISE NOTICE '✅ 已添加备注：store_staff';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：store_staff';
  END IF;

  -- 21. marketing_campaigns - 营销活动表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketing_campaigns') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE marketing_campaigns IS '营销活动表 - 营销活动配置（红包、物品领取，关联自营门店）';
    RAISE NOTICE '✅ 已添加备注：marketing_campaigns';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：marketing_campaigns';
  END IF;

  -- 22. user_campaign_claims - 用户活动领取表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_campaign_claims') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE user_campaign_claims IS '用户活动领取表 - 记录用户领取营销活动奖励';
    RAISE NOTICE '✅ 已添加备注：user_campaign_claims';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：user_campaign_claims';
  END IF;

  -- 23. cities - 城市表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cities') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE cities IS '城市表 - 城市列表（用于 LBS 服务）';
    RAISE NOTICE '✅ 已添加备注：cities';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：cities';
  END IF;

  -- 24. self_operated_stores - 自营门店表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'self_operated_stores') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE self_operated_stores IS '自营门店表 - 平台自营门店配置（与普通门店分开）';
    RAISE NOTICE '✅ 已添加备注：self_operated_stores';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：self_operated_stores';
  END IF;

  -- 25. order_risk_logs - 订单风险日志表
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_risk_logs') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE order_risk_logs IS '订单风险日志表 - 订单风险风控日志';
    RAISE NOTICE '✅ 已添加备注：order_risk_logs';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：order_risk_logs';
  END IF;

  -- 26. referrals - 推荐关系表（未使用）
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referrals') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE referrals IS '推荐关系表 - 推荐关系（已被 profiles.invited_by 替代，未使用）';
    RAISE NOTICE '✅ 已添加备注：referrals';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：referrals';
  END IF;

  -- 27. user_staff_bindings - 用户员工绑定表（未使用）
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_staff_bindings') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE user_staff_bindings IS '用户员工绑定表 - 用户员工绑定（已被 store_staff 替代，未使用）';
    RAISE NOTICE '✅ 已添加备注：user_staff_bindings';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：user_staff_bindings';
  END IF;

  -- 28. rank_configs - 段位配置表（未使用）
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rank_configs') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE rank_configs IS '段位配置表 - 段位动态配置（当前未使用，硬编码）';
    RAISE NOTICE '✅ 已添加备注：rank_configs';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：rank_configs';
  END IF;

  -- 29. platform_configs - 平台配置表（未使用）
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_configs') INTO table_exists;
  IF table_exists THEN
    COMMENT ON TABLE platform_configs IS '平台配置表 - 平台参数动态配置（当前未使用，硬编码）';
    RAISE NOTICE '✅ 已添加备注：platform_configs';
  ELSE
    RAISE NOTICE '⚠️ 表不存在：platform_configs';
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 表备注添加完成！';
  RAISE NOTICE '========================================';
END $$;

-- =======================================
-- 查看所有表的备注
-- =======================================

SELECT 
  t.table_name as "表名（英文）",
  obj_description(c.oid) as "表备注（中文）"
FROM information_schema.tables t
LEFT JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
