-- 00100: products 表补「食材食疗智能导购」核心字段
-- 对应方案：门店商品主库（raw_material 复用现有 ingredients 列，本迁移不新建）
--
-- 设计说明：
--   1. raw_material（原料拆解）复用现有 ingredients text[] 列（迁移 00090 已加），
--      本迁移不再重复建列，仅在注释中说明语义。
--   2. 以下新列支撑「单品适配打分 / 双价值聚合 / 购物车冲突校验 / 辅料自适应」。
--   3. 软降级：小程序端在列不存在时会自动剥离新字段再保存（见 src/db/api.ts 的
--      insertProductWithDegrade / updateProductWithDegrade），故本迁移未执行也不影响
--      既有上架与展示，只是暂无食疗导购能力。
--   4. 需在用户本机执行（沙箱无 supabase CLI / Token）。执行后建议一并重新部署
--      product-mutate Edge Function，使其支持新字段写入。

-- 商品整体性味（商家可填，也可由原料聚合推导）
-- 取值：大寒 / 寒凉 / 平性 / 微温 / 温热 / 大热
ALTER TABLE products ADD COLUMN IF NOT EXISTS overall_nature text;
COMMENT ON COLUMN products.overall_nature IS '商品整体性味（大寒/寒凉/平性/微温/温热/大热）；为空时由 ingredients 原料聚合推导';

-- 固定食疗标签库（9 项）
ALTER TABLE products ADD COLUMN IF NOT EXISTS health_tag text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.health_tag IS '食疗标签：温中散寒/健脾养胃/滋阴润燥/清热降火/补气养血/安神助眠/消食化积/润肺止咳/利水消肿';

-- 固定情绪标签库（8 项）
ALTER TABLE products ADD COLUMN IF NOT EXISTS emotion_tag text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.emotion_tag IS '情绪标签：治愈放松/元气满满/温暖陪伴/清爽解压/怀旧慰藉/仪式感/小确幸/社交分享';

-- 推荐搭配商品（goods_id 即 products.id）
ALTER TABLE products ADD COLUMN IF NOT EXISTS match_goods text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.match_goods IS '智能搭配升单：推荐一起点的商品 id 列表';

-- 冲突 / 慎搭商品
ALTER TABLE products ADD COLUMN IF NOT EXISTS conflict_goods text[] DEFAULT '{}'::text[];
COMMENT ON COLUMN products.conflict_goods IS '消费冲突：不宜同时点的商品 id 列表（寒热对冲/温补叠加等）';

-- 辅料自适应提醒文案
ALTER TABLE products ADD COLUMN IF NOT EXISTS aux_remind text;
COMMENT ON COLUMN products.aux_remind IS '辅料自适应优化提示，如「体质偏寒可加姜丝/红枣；易上火建议去辣减油」';

-- 复用说明：raw_material 即 ingredients 列（迁移 00090）
COMMENT ON COLUMN products.ingredients IS '原料拆解：关联食材 key 列表（对应 shiyang-dictionary 的 INGREDIENT_DICT key），同时充当方案中的 raw_material';

-- 索引：便于后台按食疗/情绪标签筛选与导购召回
CREATE INDEX IF NOT EXISTS idx_products_health_tag ON products USING gin (health_tag);
CREATE INDEX IF NOT EXISTS idx_products_emotion_tag ON products USING gin (emotion_tag);
CREATE INDEX IF NOT EXISTS idx_products_overall_nature ON products (overall_nature);
