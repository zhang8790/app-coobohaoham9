-- ============================================================
-- 00016_referral_and_staff.sql
-- 员工推广体系 + 让利率配置
-- 执行方式：在 Supabase SQL Editor 里运行
-- ============================================================

-- 1. stores 表加让利率
ALTER TABLE stores ADD COLUMN IF NOT EXISTS referral_rate NUMERIC(5,2) DEFAULT 10.00;
COMMENT ON COLUMN stores.referral_rate IS '商家让利率（%），0~100，默认10%';

-- 2. store_staff 表加推广相关字段
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS promotion_code TEXT UNIQUE;
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS total_commission NUMERIC(10,2) DEFAULT 0;
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS settled_commission NUMERIC(10,2) DEFAULT 0;
COMMENT ON COLUMN store_staff.promotion_code IS '员工推广码（唯一）';
COMMENT ON COLUMN store_staff.total_commission IS '员工累计佣金';
COMMENT ON COLUMN store_staff.settled_commission IS '员工已结算佣金';

-- 3. orders 表加 staff_id（记录是哪个员工推广的订单）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES store_staff(id);
COMMENT ON COLUMN orders.staff_id IS '推广该订单的员工ID';

-- 4. 为现有测试数据设置让利率
UPDATE stores SET referral_rate = 10.00 WHERE referral_rate IS NULL;

-- 5. 为横笼铺的商家（test account）生成一个员工记录（可选，测试用）
-- 先查看当前 stores 和 profiles 来生成测试员工
-- INSERT INTO store_staff (store_id, user_id, role, promotion_code, is_active)
-- SELECT id, owner_id, 'promoter', 'HCYP001', true FROM stores WHERE name = '横笼铺'
-- ON CONFLICT DO NOTHING;

-- 6. 创建自动生成推广码的函数
CREATE OR REPLACE FUNCTION generate_promotion_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.promotion_code IS NULL OR NEW.promotion_code = '' THEN
    NEW.promotion_code := 'EMP' || UPPER(SUBSTRING(MD5(NEW.id::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_promotion_code ON store_staff;
CREATE TRIGGER trg_generate_promotion_code
  BEFORE INSERT ON store_staff
  FOR EACH ROW
  EXECUTE FUNCTION generate_promotion_code();
