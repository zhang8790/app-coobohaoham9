-- ============================================================
-- 20260916c 门店条码前缀兜底（回填 + 触发器自动分配）
-- ============================================================
-- 背景：条码迁移(20260804)只在部署时一次性回填了「当时已存在」的门店。
--       之后经 admin-create-store 建自营店、或 20260916_restore_stores 恢复
--       实体店，INSERT 都未带 barcode_prefix，导致 allocStoreBarcode 报
--       「未配置条码前缀，无法生成店内码」。
-- 作用：
--   1) 序列兜底（避开官方店已占用的 000001）
--   2) 回填：所有仍缺前缀的门店补 6 位唯一前缀
--   3) 根治：新建门店触发器自动分配，覆盖所有建店路径
-- 用法：Supabase Dashboard → SQL Editor 整段粘贴 → Run（需 service_role / 有权限 key）
-- ============================================================

-- 1) 序列兜底：若不存在则建（START 2，避开官方店已有的 000001）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'seq_store_barcode_prefix') THEN
    EXECUTE 'CREATE SEQUENCE seq_store_barcode_prefix START WITH 2';
  END IF;
END $$;

-- 2) 回填：所有仍缺前缀的门店，用序列补 6 位唯一前缀
--    （uniq_store_barcode_prefix 唯一约束保证不撞码）
UPDATE stores
   SET barcode_prefix = lpad(nextval('seq_store_barcode_prefix')::text, 6, '0')
 WHERE barcode_prefix IS NULL;

-- 3) 根治：新建门店若未带前缀，触发器自动从序列取（覆盖 admin-create-store / 恢复脚本 等所有路径）
CREATE OR REPLACE FUNCTION fn_set_store_barcode_prefix()
RETURNS trigger AS $$
BEGIN
  IF NEW.barcode_prefix IS NULL THEN
    NEW.barcode_prefix := lpad(nextval('seq_store_barcode_prefix')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_barcode_prefix ON stores;
CREATE TRIGGER trg_store_barcode_prefix
  BEFORE INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION fn_set_store_barcode_prefix();

-- 4) 验证：每家店都应有 6 位纯数字前缀，且互不相同
SELECT id, name, barcode_prefix, is_platform
FROM stores
ORDER BY barcode_prefix;
