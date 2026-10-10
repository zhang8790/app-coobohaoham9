-- 20260804 条码（EAN-13 店内码）功能
-- 设计（高手思维）：
--   * 码制固定 EAN-13 店内码：前缀 2 + 门店前缀(6位) + 店内序号(5位) + 校验位(1位) = 13位
--   * 任意扫码枪可解（2 开头为 GS1「店内码」段，零售业标准做法）
--   * 校验位 mod-10 权重交替 1/3，算错部分扫码枪拒扫 → 必须服务端权威计算
--   * 原子分配：stores.barcode_counter 自增 + fn_alloc_store_barcode（行锁，防并发撞码）
--   * 单一数据源：条码仅存 products.barcode 一处
-- 部署：supabase db query --linked --file supabase/migrations/20260804_barcode_feature.sql

-- 1) products：标记码制（默认 EAN13，兼容已有非空条码）
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_type TEXT NOT NULL DEFAULT 'EAN13';

-- 2) stores：门店条码前缀（6 位纯数字，唯一） + 店内序号计数器
ALTER TABLE stores ADD COLUMN IF NOT EXISTS barcode_prefix TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS barcode_counter INT NOT NULL DEFAULT 0;

-- 3) 回填现有门店的 6 位门店前缀（用序列保证唯一、不重复）
DO $$
DECLARE
  seq_name text := 'seq_store_barcode_prefix';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = seq_name) THEN
    EXECUTE 'CREATE SEQUENCE ' || seq_name || ' START WITH 1';
  END IF;
  UPDATE stores
     SET barcode_prefix = lpad(nextval(seq_name)::text, 6, '0')
   WHERE barcode_prefix IS NULL;
END $$;

-- 门店前缀唯一：保证不同店的店内码天然隔离（2+门店前缀 不同）
ALTER TABLE stores ADD CONSTRAINT uniq_store_barcode_prefix UNIQUE (barcode_prefix);

-- 同店条码不重复（仅对非空条码建唯一，允许多个 null）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_store_barcode
  ON products(store_id, barcode) WHERE barcode IS NOT NULL;

-- 4) EAN-13 校验位（mod-10，前 12 位权重交替 1/3）
CREATE OR REPLACE FUNCTION fn_ean13_check(body12 text)
RETURNS text AS $$
DECLARE
  s int := 0;
  i int;
  d int;
BEGIN
  IF length(body12) <> 12 OR body12 !~ '^\d{12}$' THEN
    RAISE EXCEPTION 'EAN13 主体须为 12 位数字';
  END IF;
  FOR i IN 1..12 LOOP
    d := substring(body12 from i for 1)::int;
    IF i % 2 = 1 THEN
      s := s + d * 1;
    ELSE
      s := s + d * 3;
    END IF;
  END LOOP;
  RETURN (((10 - (s % 10)) % 10))::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5) 原子分配下一个店内码：2 + 门店前缀(6) + 店内序号(5) + 校验位(1) = 13 位
--    SECURITY DEFINER：允许 service_role 在 EF 内调用，绕过 RLS
CREATE OR REPLACE FUNCTION fn_alloc_store_barcode(p_store_id uuid)
RETURNS TABLE(barcode text, barcode_type text) AS $$
DECLARE
  v_prefix text;
  v_seq int;
  v_body text;
  v_check text;
BEGIN
  UPDATE stores SET barcode_counter = barcode_counter + 1
   WHERE id = p_store_id
   RETURNING barcode_prefix, barcode_counter INTO v_prefix, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION '门店 % 未配置条码前缀，无法生成店内码', p_store_id;
  END IF;
  IF v_seq > 99999 THEN
    RAISE EXCEPTION '门店 % 店内码序号已用尽（>99999）', p_store_id;
  END IF;

  v_body := '2' || v_prefix || lpad(v_seq::text, 5, '0');
  v_check := fn_ean13_check(v_body);
  barcode := v_body || v_check;
  barcode_type := 'EAN13';
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
