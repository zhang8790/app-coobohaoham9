-- 00201_reclassify_partner_to_self.sql
-- 目的：将「品牌馆 / 合作品牌」门店统一归并到自营门店商品中。
-- 背景：项目当前仅以自营门店模式运营（无合作品牌资质），此前被误标为合作品牌的门店
--       （如张林水果店、巫山烤鱼等，见迁移 00139）应归并为自营门店。
-- 影响：stores.partner_brand 全部置空；is_platform 统一为 true。
-- 关联代码：src/db/api.ts 已移除 partner_brand 区分逻辑；
--          src/pages/explore/index.tsx 已删除「品牌馆」分区，全部展示自营门店商品。

-- 1) 合作品牌标识置空（归并到自营）
UPDATE public.stores SET partner_brand = NULL WHERE partner_brand IS NOT NULL;

-- 2) 确保所有门店均为自营门店
UPDATE public.stores SET is_platform = true WHERE is_platform IS NOT true;

-- 注：partner_brand 列保留不删除，避免破坏迁移 00139 的 get_nearby_products RPC
--     （其 RETURNS TABLE 含 partner_brand 列）。该列此后恒为 NULL，仅作历史兼容字段。
