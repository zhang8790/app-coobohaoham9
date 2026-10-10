-- ============================================================
-- 20260916_fix_store_is_platform.sql
-- 修复「门店商品混淆」根因：4 家门店的 is_platform 被全部标成 true，
-- 导致 src/db/api.ts 的 isPlatformProduct() 里 `store.is_platform === true`
-- 对全部门店成立 → 首页/探索默认流（platformFilter:'only'）把各店商品混在一起。
--
-- 设计意图（见 00026_add_is_platform.sql）：
--   仅「来店有喜官方店」(平台店) is_platform=true；
--   实体门店（巫山烤鱼/横笼铺/杭州礼品店）必须为 false。
-- 列默认已是 false，但存量 3 家实体店被错误标成 true，需要纠正。
--
-- ⚠️ 必须在 Supabase Dashboard → SQL Editor 中执行（沙箱 CLI 未 link）。
-- ============================================================

-- ① 实体门店统一置为非自营（平台/直营过滤时不再混入）
UPDATE stores SET is_platform = false
WHERE id IN (
  '0617836f-0b6f-4611-870b-c7ce8da03c84',  -- 巫山烤鱼
  '853a98ae-ffca-4586-9c44-21047a94fbb2',  -- 横笼铺
  '70778d6b-d819-41fc-87a3-8766a78eb60d'   -- 杭州礼品店
);

-- ② 双保险：确保平台店仍为自营
UPDATE stores SET is_platform = true
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';  -- 来店有喜官方店

-- ③ 新店审批（adminApproveApplication）未传 is_platform，取列默认 false，不会复发；
--    若担心，可显式加固（可选，需改 src/db/api.ts 的 insert 补 is_platform:false）。

-- 验证：应看到 1 行 true（来店有喜官方店）+ 3 行 false（实体店）
SELECT id, name, is_platform, is_active FROM stores ORDER BY is_platform DESC, name;
