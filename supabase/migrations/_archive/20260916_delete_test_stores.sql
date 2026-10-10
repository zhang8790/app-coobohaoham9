-- ⚠️⚠️⚠️ 已作废（SUPERSEDED）—— 请勿再次执行！
-- 用户于 2026-09-16 18:5x 确认这 3 家为「真实门店」并要求恢复，
-- 恢复脚本见同目录 20260916_restore_stores.sql。本文件仅留作历史记录。
-- ⚠️⚠️⚠️ 删除 3 家非真实（测试占位）门店及其级联数据
-- 背景：巫山烤鱼 / 横笼铺 / 杭州礼品店 均为测试店，用户确认删除。
-- 级联说明（已核对迁移外键）：
--   - products(10)、printer_configs(1)、merchant_settlements、marketing_campaigns、
--     coupons、store_invites 均为 ON DELETE CASCADE → 自动级联删除
--   - orders / footprints / withdrawals 等 ON DELETE SET NULL → store_id 置空，数据保留
--   - liquidity_distribution / merchant_applications 不引用 stores（前者表已不存在、后者无 store_id 列）
-- 平台店 ffffffff-...-ffffffffffff（来店有喜官方店，37 个商品）保留不动。

DELETE FROM stores
WHERE id IN (
  '0617836f-0b6f-4611-870b-c7ce8da03c84',  -- 巫山烤鱼
  '853a98ae-ffca-4586-9c44-21047a94fbb2',  -- 横笼铺
  '70778d6b-d819-41fc-87a3-8766a78eb60d'   -- 杭州礼品店
);

-- 验证：应只剩 1 行（来店有喜官方店）
SELECT id, name, is_platform, is_active FROM stores ORDER BY name;
