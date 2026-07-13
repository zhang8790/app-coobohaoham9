-- ========================================
-- 来店有喜 - 数据库表添加中文备注
-- 执行方式：在 Supabase Dashboard 的 SQL Editor 中运行
-- ========================================

-- 用户相关表
COMMENT ON TABLE profiles IS '用户档案表 - 存储用户基本信息、会员段位、积分、余额、邀请关系';
COMMENT ON TABLE user_addresses IS '收货地址表 - 用户收货地址管理';
COMMENT ON TABLE store_staff IS '门店员工表 - 门店员工管理、权限控制';

-- 门店相关表
COMMENT ON TABLE stores IS '门店表 - 普通入驻门店基本信息、营业设置、佣金比例';
COMMENT ON TABLE self_operated_stores IS '自营门店表 - 平台自营门店配置（与普通门店分开）';
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
COMMENT ON TABLE marketing_campaigns IS '营销活动表 - 营销活动配置（红包、物品领取，关联自营门店）';
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

-- ========================================
-- 以下是未使用表（可选，确认后执行）
-- ========================================

-- COMMENT ON TABLE referrals IS '推荐关系表 - 推荐关系（已被 profiles.invited_by 替代，未使用）';
-- COMMENT ON TABLE user_staff_bindings IS '用户员工绑定表 - 用户员工绑定（已被 store_staff 替代，未使用）';
-- COMMENT ON TABLE rank_configs IS '段位配置表 - 段位动态配置（当前未使用，硬编码）';
-- COMMENT ON TABLE platform_configs IS '平台配置表 - 平台参数动态配置（当前未使用，硬编码）';

-- ========================================
-- 完成！
-- ========================================

SELECT '✅ 表备注添加完成！' as "状态";
SELECT 
  t.table_name as "表名",
  obj_description(c.oid) as "备注"
FROM information_schema.tables t
LEFT JOIN pg_class c ON c.relname = t.table_name
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
