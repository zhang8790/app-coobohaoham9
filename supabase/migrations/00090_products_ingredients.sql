-- 00090: products 表增加 ingredients 列
-- 用于持久化商家在商品编辑页「原料成分分析」区块勾选的食材 key，
-- 驱动详情页「原料分析」卡片（功效 / 适合人群 / 场景）。
-- 软降级：小程序端在列不存在时会自动剥离该字段后再保存，
-- 故本迁移未执行也不影响上架与展示（详情页会按商品名称自动匹配）。
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN products.ingredients IS '关联食材 key 列表（对应 shiyang-dictionary 的 INGREDIENT_DICT key），用于原料/食养成分分析展示';
