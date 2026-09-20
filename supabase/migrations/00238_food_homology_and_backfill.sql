-- ============================================================================
-- 药食同源合规闭环 + 商品类型数据回填（P0-① + P1）
-- ----------------------------------------------------------------------------
-- P0-① 目录准入闭环：
--   1) food_ingredients.is_homology：由私有目录 medicinal_food_catalog 按名同步，
--      标记该食材是否已收录国家《药食同源目录》。商家端据此做非阻塞合规提示，
--     且因目录表 RLS 仅 service_role 可读，客户端永不直接读目录表（合规资产不外露）。
--   2) food_analysis_reports.homology：持久化 ingredient-analyze 计算的
--      {in_catalog, not_in_catalog, total, all_in_catalog}，供 C 端报告页展示
--      「已收录国家药食同源目录」真相徽标 + 透明披露未收录食材。
--
-- P1 数据回填：
--   存量商品 product_kind 为 NULL（迁移 00237 后新增列，缺省放行为食品）。
--   显式回填为 'food' / 'gift'，让数据自解释，便于后续把 isFoodProduct 的空值收紧。
-- ============================================================================

-- 1) food_ingredients 增加药食同源标记列
alter table food_ingredients add column if not exists is_homology boolean;

-- 由私有目录按名同步（service_role 可读 medicinal_food_catalog）
update food_ingredients fi
set is_homology = (
  select bool_or(coalesce(m.is_homology, true))
  from medicinal_food_catalog m
  where m.name = fi.name
)
where fi.is_homology is null;

-- 2) food_analysis_reports 增加 homology 持久化列
alter table food_analysis_reports add column if not exists homology jsonb;

-- 3) P1：存量商品 product_kind 回填
-- 有食材/食养数据 → 食品；仅有 materials（礼品/手作） → 礼品；其余兜底食品
update products
set product_kind = 'food'
where product_kind is null
  and (ingredients is not null or therapy_json is not null or materials is null);

update products
set product_kind = 'gift'
where product_kind is null
  and materials is not null;
