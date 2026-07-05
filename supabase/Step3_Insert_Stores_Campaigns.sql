-- ============================================
-- 步骤3：插入测试数据 - 自营门店和营销活动
-- ============================================

-- 插入自营门店
INSERT INTO public.self_operated_stores (store_code, store_name, city_id, address, lng, lat, phone, business_hours, status) VALUES
('SH001', '来店有喜·上海旗舰店', 1, '上海市浦东新区陆家嘴西路168号', 121.4997, 31.2397, '400-888-8888', '10:00-22:00', 'active'),
('SH002', '来店有喜·上海徐家汇店', 1, '上海市徐汇区肇嘉浜路1111号', 121.4365, 31.2108, '400-888-8888', '10:00-22:00', 'active'),
('BJ001', '来店有喜·北京三里屯店', 2, '北京市朝阳区三里屯路19号', 116.4554, 39.9358, '400-888-8888', '10:00-22:00', 'active'),
('GZ001', '来店有喜·广州天河店', 3, '广州市天河区天河路385号', 113.3290, 23.1352, '400-888-8888', '10:00-22:00', 'active');

-- 插入营销活动
INSERT INTO public.marketing_campaigns (campaign_code, campaign_name, campaign_type, city_id, store_id, gift_name, gift_value, commission_rate, daily_limit, total_limit, start_date, end_date, status) VALUES
('SH_RED_001', '上海新人红包活动', 'red_packet', 1, 1, '新人红包', 8.88, 5.00, 100, 1000, '2026-07-01', '2026-12-31', 'active'),
('SH_PHYSICAL_001', '上海精美礼品活动', 'physical', 1, 1, '精美保温杯', 39.90, 8.00, 50, 500, '2026-07-01', '2026-12-31', 'active'),
('BJ_RED_001', '北京新人红包活动', 'red_packet', 2, 3, '新人红包', 6.66, 5.00, 100, 1000, '2026-07-01', '2026-12-31', 'active');

SELECT '步骤3完成：门店和活动数据插入成功！' AS result;
