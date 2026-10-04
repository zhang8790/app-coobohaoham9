-- ============================================================================
-- 一次性数据修复：为「未配置条码前缀」的门店补发 barcode_prefix
-- ----------------------------------------------------------------------------
-- 背景：fn_alloc_store_barcode 在门店未配置 barcode_prefix 时直接 RAISE EXCEPTION，
--       而「新增商品」对无手填条码的商品会走 auto_barcode → 调该函数 → 异常 →
--       整条创建失败（表现即"新增商品上不去"）。
--       已建门店若是在 trg_store_barcode_prefix 触发器建立前就存在、且从未被 UPDATE
--       触发过，barcode_prefix 会一直是 NULL，从而中招。
--
-- 安全原则：
--   ① 仅更新 barcode_prefix IS NULL 的门店，不动任何已配置门店；
--   ② 复用 seq_store_barcode_prefix 序列（uniq_store_barcode_prefix 唯一约束保证不撞码）；
--   ③ 幂等：可重复执行，已配置的门店不会被改写；
--   ④ 修复段包在事务里，先预览再 COMMIT，可 ROLLBACK 撤销。
--
-- 执行方式（任选其一）：
--   A. Supabase Dashboard → SQL Editor 粘贴本文件执行
--   B. 本地 CLI： supabase db query --linked -f supabase/fix_missing_barcode_prefix.sql
-- 强烈建议：先单独跑「预览」段确认影响行数，再跑「修复」段。
-- ============================================================================

-- ── 预览：查看将受影响的门店（只读，不写库） ──
SELECT id, name, is_platform, owner_id, barcode_prefix, barcode_counter
FROM stores
WHERE barcode_prefix IS NULL
ORDER BY created_at;

-- ── 修复：为缺失前缀的门店补发（在事务中执行，确认无误后 COMMIT） ──
BEGIN;
  UPDATE stores
  SET barcode_prefix = lpad(nextval('seq_store_barcode_prefix')::text, 6, '0'),
      barcode_counter = COALESCE(barcode_counter, 0)
  WHERE barcode_prefix IS NULL;

  -- 复核：应返回 0 行（所有门店已配前缀）
  SELECT count(*) AS still_null FROM stores WHERE barcode_prefix IS NULL;
-- 确认无误后执行 COMMIT; 若要撤销本次修复，执行 ROLLBACK;
-- COMMIT;

-- ── 验证：补发后确认无 NULL ──
-- SELECT count(*) FILTER (WHERE barcode_prefix IS NULL) AS null_prefix, count(*) AS total
-- FROM stores;
