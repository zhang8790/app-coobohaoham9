-- 来店有喜 · 管理后台测试数据
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴后 Run

-- ============================================================
-- 0. 先禁用 RLS（开发环境）
-- ============================================================
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE articles DISABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE commissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals DISABLE ROW LEVEL SECURITY;
ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;
ALTER TABLE points_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_addresses DISABLE ROW LEVEL SECURITY;
ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
ALTER TABLE footprints DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE coupons DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- ============================================================
-- 1. 用户 profiles（含1个admin）
-- ============================================================
INSERT INTO profiles (id, username, phone, nickname, avatar_url, role, member_rank, points, balance, merchant_status, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin', '13800000000', '超级管理员', '', 'admin', 'vip', 9999, 0, NULL, now()),
  ('00000000-0000-0000-0000-000000000002', 'user01', '13800000001', '张三', '', 'user', 'regular', 120, 50.00, NULL, now()),
  ('00000000-0000-0000-0000-000000000003', 'user02', '13800000002', '李四', '', 'user', 'silver', 350, 120.50, 'approved', now()),
  ('00000000-0000-0000-0000-000000000004', 'user03', '13800000003', '王五', '', 'user', 'regular', 80, 30.00, 'pending', now()),
  ('00000000-0000-0000-0000-000000000005', 'user04', '13800000004', '赵六', '', 'user', 'regular', 0, 0.00, NULL, now())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. 商家申请 merchant_applications
-- ============================================================
INSERT INTO merchant_applications (id, user_id, store_name, contact_name, contact_phone, business_type, description, status, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '张三的炸鸡店', '张三', '13800000001', '餐饮', '主营炸鸡、汉堡、薯条', 'pending', now() - interval '2 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '李四的奶茶铺', '李四', '13800000002', '餐饮', '主营珍珠奶茶、水果茶', 'pending', now() - interval '1 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '王五的便利店', '王五', '13800000003', '零售', '日用百货、零食饮料', 'approved', now() - interval '5 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', '赵六的美甲店', '赵六', '13800000004', '服务', '美甲、美睫、手足护理', 'rejected', now() - interval '3 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. 门店 stores
-- ============================================================
INSERT INTO stores (id, owner_id, name, description, address, phone, category, image_url, banner_url, rating, is_active, created_at, short_code)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000003', '张三的炸鸡店', '香脆可口的炸鸡，送到家', '北京市朝阳区建国路88号', '13800000001', '餐饮', '', '', 4.8, true, now() - interval '5 day', 'ZK001'),
  ('11111111-1111-1111-1111-111111111112', '00000000-0000-0000-0000-000000000002', '王五的便利店', '24小时营业，日用百货齐全', '北京市海淀区中关村大街10号', '13800000003', '零售', '', '', 4.5, true, now() - interval '10 day', 'BH002')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. 商品 products
-- ============================================================
INSERT INTO products (id, store_id, category_id, name, description, price, original_price, image_url, stock, mood_tags, scene_tags, is_active, review_status, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', NULL, '脆皮炸鸡套餐', '外酥里嫩，搭配薯条和可乐', 25.90, 32.00, '', 100, ARRAY['开心', '解压'], ARRAY['聚会', '夜宵'], true, 'approved', now() - interval '4 day'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', NULL, '香辣鸡腿堡', '秘制辣酱，鲜嫩多汁', 18.50, 22.00, '', 80, ARRAY['开心'], ARRAY['午餐', '晚餐'], true, 'approved', now() - interval '3 day'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', NULL, '蜂蜜芥末薯条', '甜芥末酱，独特口感', 12.00, 15.00, '', 150, ARRAY['开心', '治愈'], ARRAY['下午茶'], true, 'pending', now() - interval '1 day'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111112', NULL, '进口矿泉水', '源自阿尔卑斯山，天然弱碱性', 5.00, 8.00, '', 500, ARRAY['治愈'], ARRAY['日常'], true, 'approved', now() - interval '8 day'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111112', NULL, '冰镇可乐330ml', '夏季必备，冰爽解渴', 3.50, 5.00, '', 1000, ARRAY['开心', '解压'], ARRAY['聚会', '夜宵'], true, 'approved', now() - interval '6 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. 订单 orders + order_items
-- ============================================================
INSERT INTO orders (id, order_no, user_id, total_amount, status, payment_method, paid_at, created_at, service_type)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LD20260601001', '00000000-0000-0000-0000-000000000002', 44.40, 'completed', 'wechat', now() - interval '2 day', now() - interval '2 day', 'delivery'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'LD20260602002', '00000000-0000-0000-0000-000000000003', 18.50, 'shipped', 'wechat', now() - interval '1 day', now() - interval '1 day', 'pickup'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', 'LD20260603003', '00000000-0000-0000-0000-000000000002', 25.90, 'pending', NULL, NULL, now() - interval '2 hour', 'delivery')
ON CONFLICT (id) DO NOTHING;

-- 订单明细
INSERT INTO order_items (id, order_id, product_id, store_id, store_name, product_name, product_image, price, quantity)
SELECT gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', p.id, p.store_id, '张三的炸鸡店', p.name, '', p.price, 1
FROM products p WHERE p.name = '脆皮炸鸡套餐'
ON CONFLICT DO NOTHING;

INSERT INTO order_items (id, order_id, product_id, store_id, store_name, product_name, product_image, price, quantity)
SELECT gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', p.id, p.store_id, '张三的炸鸡店', p.name, '', p.price, 1
FROM products p WHERE p.name = '香辣鸡腿堡'
ON CONFLICT DO NOTHING;

INSERT INTO order_items (id, order_id, product_id, store_id, store_name, product_name, product_image, price, quantity)
SELECT gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', p.id, p.store_id, '张三的炸鸡店', p.name, '', p.price, 1
FROM products p WHERE p.name = '脆皮炸鸡套餐'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. 提现申请 withdrawals
-- ============================================================
INSERT INTO withdrawals (id, user_id, store_id, amount, status, bank_name, bank_account, bank_holder, withdraw_method, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 500.00, 'pending', '工商银行', '6222021234567890', '张三', 'bank', now() - interval '1 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111112', 200.00, 'pending', NULL, NULL, NULL, 'alipay', now() - interval '2 hour'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 300.00, 'approved', '工商银行', '6222021234567890', '张三', 'bank', now() - interval '3 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. 退款 refunds
-- ============================================================
INSERT INTO refunds (id, refund_no, order_id, order_no, item_index, user_id, initiated_by, status, refund_amount, reason, created_at)
VALUES
  (gen_random_uuid(), 'RF20260601001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LD20260601001', 0, '00000000-0000-0000-0000-000000000002', 'user', 'pending', 44.40, '商品与描述不符', now() - interval '1 day'),
  (gen_random_uuid(), 'RF20260602002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'LD20260602002', 0, '00000000-0000-0000-0000-000000000003', 'user', 'approved', 18.50, '送达超时', now() - interval '6 hour')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. UGC 文章 articles
-- ============================================================
INSERT INTO articles (id, user_id, title, content, images, tags, is_published, status, created_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '这家炸鸡太好吃了！', '昨天路过张三的炸鸡店，买了一个脆皮炸鸡套餐，外酥里嫩，酱料也很棒，强烈推荐！', ARRAY[]::text[], ARRAY['美食', '推荐'], true, 'published', now() - interval '1 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '便利店24小时营业太方便了', '半夜突然想喝水，下楼就到王五的便利店，24小时营业真的很方便！', ARRAY[]::text[], ARRAY['便利', '日常'], true, 'published', now() - interval '12 hour'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '待审核的文章', '这是一篇等待审核的UGC内容...', ARRAY[]::text[], ARRAY['测试'], false, 'pending', now() - interval '1 hour')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. 公告 announcements
-- ============================================================
INSERT INTO announcements (id, content, is_active, sort_order, created_at)
VALUES
  (gen_random_uuid(), '🎉 来店有喜平台正式上线！商家入驻限时免费！', true, 1, now() - interval '10 day'),
  (gen_random_uuid(), '📢 新功能：到店自取通道已上线，欢迎体验！', true, 2, now() - interval '3 day'),
  (gen_random_uuid(), '⚠️ 系统维护通知：6月30日凌晨2点-4点暂停服务', false, 3, now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 10. 佣金 commissions
-- ============================================================
INSERT INTO commissions (id, order_id, order_no, beneficiary_id, payer_id, level, rank_at_time, ratio, pool_amount, commission_amount, b_coef, status, created_at)
VALUES
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LD20260601001', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 1, 'regular', 0.05, 44.40, 2.22, 1.0, 'settled', now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 完成提示
-- ============================================================
SELECT '✅ 测试数据已创建！' AS status,
       (SELECT count(*) FROM profiles) AS profiles_count,
       (SELECT count(*) FROM merchant_applications) AS applications_count,
       (SELECT count(*) FROM products) AS products_count,
       (SELECT count(*) FROM orders) AS orders_count,
       (SELECT count(*) FROM withdrawals) AS withdrawals_count,
       (SELECT count(*) FROM refunds) AS refunds_count,
       (SELECT count(*) FROM articles) AS articles_count,
       (SELECT count(*) FROM announcements) AS announcements_count;
