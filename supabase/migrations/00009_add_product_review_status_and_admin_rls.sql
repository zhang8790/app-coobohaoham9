-- 1. products 加 review_status 字段（已有商品默认 approved）
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (review_status IN ('pending','approved','rejected'));

-- 新增商品默认 pending（通过触发器实现）
CREATE OR REPLACE FUNCTION set_product_pending_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status IS NULL OR NEW.review_status = 'approved' THEN
    NEW.review_status := 'pending';
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_pending ON products;
CREATE TRIGGER trg_product_pending
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_product_pending_on_insert();

-- 2. withdrawals admin RLS
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_withdrawals" ON withdrawals;
CREATE POLICY "admin_all_withdrawals" ON withdrawals
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 3. articles admin RLS
DROP POLICY IF EXISTS "admin_all_articles" ON articles;
CREATE POLICY "admin_all_articles" ON articles
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) = 'admin'::user_role);

-- 4. products 审核通过时自动设 is_active=true
CREATE OR REPLACE FUNCTION sync_product_active_on_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status = 'approved' THEN
    NEW.is_active := true;
  ELSIF NEW.review_status = 'rejected' THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_review_active ON products;
CREATE TRIGGER trg_product_review_active
  BEFORE UPDATE OF review_status ON products
  FOR EACH ROW EXECUTE FUNCTION sync_product_active_on_review();